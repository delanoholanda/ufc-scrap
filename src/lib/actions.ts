
'use server';
import type { ScrapedDataRow, CSVFile } from '@/lib/types';
import puppeteer, { Browser } from 'puppeteer';
import { getDB, saveLog } from './database';
import { processData } from './processing/process-data';
import { checkAuth } from './auth-actions';
import { syncStudentsToPostgres } from './matriculas-actions';

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

async function createExtractionEntry(year: string, semester: string) {
    const db = getDB();
    const stmt = db.prepare('INSERT INTO extractions (year, semester, status) VALUES (?, ?, ?)');
    const result = stmt.run(year, semester, 'running');
    return Number(result.lastInsertRowid);
}

async function updateExtractionStatus(id: number, status: 'completed' | 'failed' | 'cancelled') {
    const db = getDB();
    db.prepare('UPDATE extractions SET status = ? WHERE id = ?').run(status, id);
}

async function saveData(extractionId: number, data: ScrapedDataRow[]) {
  const db = getDB();
  const dataStmt = db.prepare(
    'INSERT INTO scraped_data (extraction_id, codigo, componente, docente, turma, matricula, nome, curso, tipoReserva, situacao) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const insertMany = db.transaction((rows: ScrapedDataRow[]) => {
    for (const row of rows) {
      dataStmt.run(extractionId, row.codigo, row.componente, row.docente, row.turma, row.matricula, row.nome, row.curso, row.tipoReserva, row.situacao);
    }
  });
  insertMany(data);
}

async function saveProcessedFiles(extractionId: number, files: CSVFile[]) {
    const db = getDB();
    const stmt = db.prepare('INSERT INTO processed_files (extraction_id, filename, content) VALUES (?, ?, ?)');
    const insertMany = db.transaction((filesToSave: CSVFile[]) => {
        for (const file of filesToSave) {
            stmt.run(extractionId, file.filename, file.content);
        }
    });
    insertMany(files);
}

export async function scrapeUFCData(
    formData: FormData,
    onLog: (log: string) => Promise<void>,
    onIdCreated: (id: number) => Promise<void>
): Promise<{ success: boolean; data?: ScrapedDataRow[]; error?: string, cancelled?: boolean }> {
    const userId = await checkAuth();
    if (!userId) return { success: false, error: "Acesso negado. Sessão expirada." };

    const year = formData.get("year") as string;
    const semester = formData.get("semester") as string;
    const visibleMode = formData.get("visibleMode") === 'on';
    const username = formData.get("username") as string;
    const password = formData.get("password") as string;

    const addLog = async (message: string) => {
        const logMsg = `[${new Date().toLocaleTimeString()}][LOG] ${message}`;
        await onLog(logMsg);
    }
    const addError = async (message: string) => {
        const errorMsg = `[${new Date().toLocaleTimeString()}][ERRO] ${message}`;
        await onLog(errorMsg);
    }

    if (!year || !semester || !username || !password) return { success: false, error: "Dados incompletos." };
    
    await addLog(`Iniciando extração completa para o período ${year}.${semester}.`);
    let extractionId: number = await createExtractionEntry(year, semester);
    await onIdCreated(extractionId);

    let browser: Browser | undefined;
    try {
        const isProduction = !!process.env.FIREBASE_APP_HOSTING_URL || process.env.NODE_ENV === 'production';
        browser = await puppeteer.launch({
            headless: !visibleMode,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
            executablePath: isProduction ? '/usr/bin/google-chrome' : undefined
        });
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });

        await addLog("Navegando para o SIGAA...");
        await page.goto('https://si3.ufc.br/sigaa/verTelaLogin.do');
        await page.type('input[name="user.login"]', username);
        await page.type('input[name="user.senha"]', password);
        await Promise.all([page.waitForNavigation(), page.click('input[type="submit"]')]);

        await addLog("Selecionando vínculo Secretaria...");
        await page.waitForSelector(".listagem", { timeout: 15000 });
        const vinculoClicked = await page.evaluate(() => {
            const items = Array.from(document.querySelectorAll('.listagem ul li'));
            const target = items.find(li => li.querySelector('span.col-xs-2')?.textContent?.trim().toUpperCase() === 'SECRETARIA');
            if (target) { const link = target.querySelector('a'); if (link) { link.click(); return true; } }
            return false;
        });

        if (vinculoClicked) {
            await page.waitForNavigation({ waitUntil: 'networkidle0' });
            // Verificar se há uma tela de aviso com o botão "Continuar >>"
            const hasAviso = await page.evaluate(() => {
                const btn = Array.from(document.querySelectorAll('input[type="submit"]')).find(i => (i as HTMLInputElement).value.includes('Continuar >>'));
                if (btn) { (btn as HTMLElement).click(); return true; }
                return false;
            });
            if (hasAviso) await page.waitForNavigation({ waitUntil: 'networkidle0' });
            await addLog("Módulo de Graduação acessado.");
        }

        await page.waitForSelector('a[href*="verMenuGraduacao.do"]');
        await Promise.all([page.waitForNavigation(), page.click('a[href*="verMenuGraduacao.do"]')]);

        await addLog("Navegando para Consulta de Turmas...");
        const menuClicked = await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('a'));
            const target = links.find(a => a.textContent?.trim().includes("Consultar, Alterar, Consolidar e Remover Turma"));
            if (target) { (target as HTMLElement).click(); return true; }
            return false;
        });
        if (menuClicked) await page.waitForNavigation({ waitUntil: 'networkidle0' });

        await addLog("Configurando filtros de busca...");
        await page.waitForSelector('table.formulario');
        await page.evaluate(() => {
            const chk = document.getElementById('form:checkNivel') as HTMLInputElement;
            if (chk && chk.checked) chk.click();
        });
        await page.select('select[name="form:selectUnidade"]', '1020');
        await Promise.all([page.waitForNavigation(), page.click('input[name="form:buttonBuscar"]')]);

        let turmasInfo = await page.evaluate(() => {
            const list: any[] = [];
            let currentCodigo = '', currentComp = '';
            document.querySelectorAll('#lista-turmas > tbody > tr').forEach(row => {
                if (row.classList.contains('destaque')) {
                    const match = row.textContent?.match(/(.*) - (.*)/);
                    if (match) { currentCodigo = match[1].trim(); currentComp = match[2].trim(); }
                } else if (!row.id?.startsWith('trOpcoesTurma')) {
                    const menuImg = row.querySelector('img[title="Visualizar Menu"]');
                    if (menuImg) {
                        list.push({ 
                          id: menuImg.id.replace('exibir_', ''), 
                          codigo: currentCodigo, 
                          componente: currentComp, 
                          turma: row.querySelectorAll('td')[1]?.innerText?.trim() || '', 
                          docente: row.querySelectorAll('td')[2]?.innerText?.trim() || '' 
                        });
                    }
                }
            });
            return list; 
        });

        await addLog(`Iniciando processamento de ${turmasInfo.length} turmas encontradas.`);
        const scrapedData: ScrapedDataRow[] = [];

        for (let i = 0; i < turmasInfo.length; i++) {
            const info = turmasInfo[i];
            
            // Verificar cancelamento
            const currentStatus = (getDB().prepare('SELECT status FROM extractions WHERE id = ?').get(extractionId) as any).status;
            if (currentStatus === 'cancelled') {
                await addLog("Interrupção solicitada pelo usuário. Encerrando...");
                return { success: false, cancelled: true };
            }

            await addLog(`[${i+1}/${turmasInfo.length}] Extraindo: ${info.codigo} - ${info.turma}...`);
            await page.click(`#exibir_${info.id}`);
            await delay(300);
            await page.evaluate((id) => {
                const link = Array.from(document.querySelectorAll(`#trOpcoesTurma${id} a`)).find(a => a.textContent?.includes("Listar Alunos"));
                if (link) (link as HTMLElement).click();
            }, info.id);
            await page.waitForNavigation({ waitUntil: 'networkidle0' });

            const students: ScrapedDataRow[] = await page.evaluate((turmaInfo) => {
                const rows = Array.from(document.querySelectorAll('#lista-turmas-matriculas tbody tr'));
                return rows.map(tr => {
                    const tds = Array.from(tr.querySelectorAll('td')).map(td => td.innerText.trim());
                    return {
                        codigo: turmaInfo.codigo,
                        componente: turmaInfo.componente,
                        docente: turmaInfo.docente,
                        turma: turmaInfo.turma,
                        matricula: tds[0],
                        nome: tds[1],
                        curso: tds[2],
                        tipoReserva: tds[4] || 'NÃO INFORMADO',
                        situacao: tds[tds.length - 1]
                    };
                });
            }, info);

            scrapedData.push(...students);
            await page.goBack();
        }

        await addLog("Salvando dados brutos no banco local...");
        await saveData(extractionId, scrapedData);

        const { files, postgresRows } = await processData(scrapedData, `${year}.${semester}`, addLog);
        await saveProcessedFiles(extractionId, files);

        if (postgresRows && postgresRows.length > 0) {
            await addLog(`Sincronizando ${postgresRows.length} alunos novos com o PostgreSQL...`);
            const pgResult = await syncStudentsToPostgres(postgresRows);
            await addLog(pgResult.message);
        }
        
        await updateExtractionStatus(extractionId, 'completed');
        await addLog("Extração e processamento concluídos com sucesso!");
        return { success: true, data: scrapedData };

    } catch (e: any) {
        await addError(e.message);
        await updateExtractionStatus(extractionId, 'failed');
        return { success: false, error: e.message };
    } finally {
        if (browser) await browser.close();
    }
}
