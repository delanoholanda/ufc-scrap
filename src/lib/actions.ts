
'use server';
import type { ScrapedDataRow, CSVFile } from '@/lib/types';
import puppeteer, { Browser, Page } from 'puppeteer';
import { getDB } from './database';
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
    
    await addLog(`Iniciando extração para o período ${year}.${semester}.`);
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

        await addLog("Navegando para o portal de login...");
        await page.goto('https://si3.ufc.br/sigaa/verTelaLogin.do', { waitUntil: 'networkidle2' });
        
        await page.waitForSelector('input[name="user.login"]');
        await page.type('input[name="user.login"]', username);
        await page.type('input[name="user.senha"]', password);
        
        await addLog("Realizando login...");
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle2' }),
            page.click('input[type="submit"]')
        ]);

        await addLog("Aguardando lista de vínculos...");
        await page.waitForSelector(".listagem", { timeout: 30000 });
        
        await addLog("Localizando vínculo 'SECRETARIA'...");
        const linkSelector = await page.evaluate(() => {
            const items = Array.from(document.querySelectorAll('.listagem ul li'));
            const target = items.find(li => {
                const label = li.querySelector('span.col-xs-2')?.textContent?.trim().toUpperCase();
                return label === 'SECRETARIA' || label?.includes('SECRETARIA');
            });
            const link = target?.querySelector('a');
            if (link) {
                if (!link.id) link.id = 'tmp_secretaria_link';
                return `#${link.id}`;
            }
            return null;
        });

        if (linkSelector) {
            await addLog("Vínculo encontrado. Acessando...");
            await Promise.all([
                page.waitForNavigation({ waitUntil: 'networkidle0' }),
                page.click(linkSelector)
            ]);
            await delay(2000);
        } else {
            throw new Error("Vínculo 'SECRETARIA' não encontrado.");
        }

        await addLog("Verificando telas de aviso intermediárias...");
        try {
            await delay(1000);
            const hasMenu = await page.$('a[href*="verMenuGraduacao.do"]');
            if (!hasMenu) {
                const continueBtn = await page.$('input[value*="Continuar"]');
                if (continueBtn) {
                    await addLog("Tela de aviso detectada. Clicando em continuar...");
                    await Promise.all([
                        page.waitForNavigation({ waitUntil: 'networkidle0' }),
                        continueBtn.click()
                    ]);
                    await delay(1000);
                }
            }
        } catch (e) {
            await addLog("Navegação prosseguindo...");
        }
        
        await addLog("Aguardando Menu de Graduação...");
        await page.waitForSelector('a[href*="verMenuGraduacao.do"]', { timeout: 30000 });

        await addLog("Acessando Menu de Graduação...");
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle0' }),
            page.click('a[href*="verMenuGraduacao.do"]')
        ]);

        await addLog("Acessando 'Consultar Turma'...");
        const consultaSelector = await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('a'));
            const target = links.find(a => a.textContent?.trim().includes("Consultar, Alterar, Consolidar e Remover Turma"));
            if (target) {
                if (!target.id) target.id = 'tmp_consulta_link';
                return `#${target.id}`;
            }
            return null;
        });

        if (consultaSelector) {
            await Promise.all([
                page.waitForNavigation({ waitUntil: 'networkidle0' }),
                page.click(consultaSelector)
            ]);
        } else {
             throw new Error("Link 'Consultar Turma' não encontrado.");
        }

        await addLog("Configurando filtros...");
        await page.waitForSelector('table.formulario', { timeout: 20000 });
        await page.evaluate(() => {
            const chk = document.getElementById('form:checkNivel') as HTMLInputElement;
            if (chk && chk.checked) chk.click();
        });
        await page.select('select[name="form:selectUnidade"]', '1020');
        
        await addLog("Buscando turmas...");
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle0' }),
            page.click('input[name="form:buttonBuscar"]')
        ]);

        await page.waitForSelector('#lista-turmas', { timeout: 30000 });
        let turmasInfo = await page.evaluate(() => {
            const list: any[] = [];
            let currentCodigo = '', currentComp = '';
            document.querySelectorAll('#lista-turmas > tbody > tr').forEach(row => {
                if (row.classList.contains('destaque')) {
                    const match = row.textContent?.match(/(.*) - (.*)/);
                    if (match) { 
                        currentCodigo = match[1].trim(); 
                        currentComp = match[2].trim(); 
                    }
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

        if (turmasInfo.length === 0) {
            await addLog("Nenhuma turma encontrada.");
            await updateExtractionStatus(extractionId, 'completed');
            return { success: true, data: [] };
        }

        await addLog(`Processando ${turmasInfo.length} turmas.`);
        const scrapedData: ScrapedDataRow[] = [];

        for (let i = 0; i < turmasInfo.length; i++) {
            const info = turmasInfo[i];
            const currentStatus = (getDB().prepare('SELECT status FROM extractions WHERE id = ?').get(extractionId) as any).status;
            if (currentStatus === 'cancelled') {
                await addLog("Operação cancelada pelo usuário.");
                return { success: false, cancelled: true };
            }

            const progressLog = `[${i+1}/${turmasInfo.length}] Turma: ${info.codigo} - ${info.componente} - ${info.turma}`;
            await addLog(progressLog);

            await page.waitForSelector(`#exibir_${info.id}`, { timeout: 15000 });
            await page.click(`#exibir_${info.id}`);
            
            await page.waitForSelector(`#trOpcoesTurma${info.id}`, { visible: true, timeout: 10000 });
            await delay(500);

            const listarAlunosSelector = await page.evaluate((id) => {
                const links = Array.from(document.querySelectorAll(`#trOpcoesTurma${id} a`));
                const target = links.find(a => a.textContent?.includes("Listar Alunos"));
                if (target) {
                    if (!target.id) target.id = `tmp_listar_link_${id}`;
                    return `#${target.id}`;
                }
                return null;
            }, info.id);

            if (listarAlunosSelector) {
                try {
                    await Promise.all([
                        page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 15000 }),
                        page.click(listarAlunosSelector)
                    ]);
                    
                    // Verifica se a página de alunos abriu ou se há mensagem de erro/vazia
                    const pageContent = await page.evaluate(() => {
                        const table = document.querySelector('#lista-turmas-matriculas');
                        const errorMsg = document.querySelector('.error, .errorNote, .messagem-erro')?.textContent?.trim();
                        return { hasTable: !!table, error: errorMsg };
                    });

                    if (!pageContent.hasTable) {
                        await addLog(`[AVISO] Turma ${info.codigo} sem alunos matriculados ou link inacessível.`);
                        scrapedData.push({
                            codigo: info.codigo,
                            componente: info.componente,
                            docente: info.docente,
                            turma: info.turma,
                            matricula: 'SEM ALUNO',
                            nome: 'TURMA SEM ALUNOS',
                            curso: 'N/A',
                            tipoReserva: 'N/A',
                            situacao: 'N/A'
                        });
                        // Volta se mudou de página
                        const isMainList = await page.$('#lista-turmas');
                        if (!isMainList) await page.goBack();
                    } else {
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
                        await Promise.all([
                            page.waitForNavigation({ waitUntil: 'networkidle0' }),
                            page.goBack()
                        ]);
                    }
                } catch (e) {
                    await addLog(`[AVISO] Falha ao acessar alunos de ${info.codigo}. Prosseguindo...`);
                    // Garante que o robô tente voltar para a lista principal
                    const isMainList = await page.$('#lista-turmas');
                    if (!isMainList) {
                         await page.goto('https://si3.ufc.br/sigaa/graduacao/turma/lista.do', { waitUntil: 'networkidle2' }).catch(() => {});
                    }
                }
            } else {
                await addLog(`[AVISO] Turma ${info.codigo} não possui opção 'Listar Alunos'.`);
                scrapedData.push({
                    codigo: info.codigo,
                    componente: info.componente,
                    docente: info.docente,
                    turma: info.turma,
                    matricula: 'SEM ALUNO',
                    nome: 'TURMA SEM ALUNOS (LINK AUSENTE)',
                    curso: 'N/A',
                    tipoReserva: 'N/A',
                    situacao: 'N/A'
                });
            }

            await page.waitForSelector('#lista-turmas', { timeout: 20000 }).catch(() => {});
            await delay(300);
        }

        await addLog("Salvando e processando dados...");
        await saveData(extractionId, scrapedData);
        const { files, postgresRows } = await processData(scrapedData, `${year}.${semester}`, addLog);
        await saveProcessedFiles(extractionId, files);

        if (postgresRows && postgresRows.length > 0) {
            await syncStudentsToPostgres(postgresRows);
        }
        
        await updateExtractionStatus(extractionId, 'completed');
        return { success: true, data: scrapedData };

    } catch (e: any) {
        await addError(`Erro crítico: ${e.message}`);
        await updateExtractionStatus(extractionId, 'failed');
        return { success: false, error: e.message };
    } finally {
        if (browser) {
            await addLog("Fechando navegador...");
            await browser.close();
        }
    }
}
