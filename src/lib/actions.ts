
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
        await addLog("Mapeando turmas encontradas na página...");

        // 1. Coleta os parâmetros POST de cada turma sem navegar
        const turmaPayloads = await page.evaluate(() => {
            // Expande todas as opções de turmas caso estejam ocultas
            document.querySelectorAll('img[title="Visualizar Menu"]').forEach(img => {
                try { (img as HTMLElement).click(); } catch(e) {}
            });

            const captured: { actionUrl: string; entries: [string, string][] }[] = [];
            const old_jsfcljs = (window as any).jsfcljs;

            (window as any).jsfcljs = function(form: HTMLFormElement, params: any, target: any) {
                if ((window as any).apf) (window as any).apf(form, params);
                const prevTarget = form.target;
                if (target) form.target = target;
                
                const formData = new FormData(form);
                const entries: [string, string][] = [];
                formData.forEach((value, key) => {
                    entries.push([key, String(value)]);
                });
                
                captured.push({
                    actionUrl: form.action || window.location.href,
                    entries
                });

                form.target = prevTarget;
                if ((window as any).dpf) (window as any).dpf(form);
            };

            // Filtragem precisa dos links para listar alunos da turma
            let links = Array.from(document.querySelectorAll('#btnSelecionarTurma > a, a[title*="Listar Alunos"], a[id*="btnSelecionarTurma"]')) as HTMLElement[];
            if (links.length === 0) {
                links = Array.from(document.querySelectorAll('#lista-turmas a')).filter(a => {
                    const text = a.textContent?.trim() || '';
                    const title = a.getAttribute('title') || '';
                    return text.includes('Listar Alunos') || text.includes('Selecionar Turma') || title.includes('Listar Alunos') || title.includes('Selecionar Turma');
                }) as HTMLElement[];
            }

            for (const link of links) {
                try {
                    if (link.onclick) {
                        (link.onclick as any)(new MouseEvent('click'));
                    } else {
                        link.click();
                    }
                } catch(e) {}
            }

            (window as any).jsfcljs = old_jsfcljs;

            return captured;
        });

        if (!turmaPayloads || turmaPayloads.length === 0) {
            await addLog("Nenhuma turma encontrada para extração.");
            await updateExtractionStatus(extractionId, 'completed');
            return { success: true, data: [] };
        }

        await addLog(`[PROCESS] ${turmaPayloads.length} turmas identificadas. Carregando alunos...`);
        const scrapedData: ScrapedDataRow[] = [];

        for (let i = 0; i < turmaPayloads.length; i++) {
            // Verifica se o usuário solicitou cancelamento
            const currentStatus = (getDB().prepare('SELECT status FROM extractions WHERE id = ?').get(extractionId) as any)?.status;
            if (currentStatus === 'cancelled') {
                await addLog("Operação cancelada pelo usuário.");
                return { success: false, cancelled: true };
            }

            const payload = turmaPayloads[i];
            
            // Faz o fetch individual de cada turma no navegador
            const turmaResult = await page.evaluate(async (p) => {
                try {
                    const formData = new FormData();
                    p.entries.forEach(([key, val]) => formData.append(key, val));

                    const response = await fetch(p.actionUrl, {
                        method: 'POST',
                        body: formData
                    });
                    const htmlText = await response.text();

                    const parser = new DOMParser();
                    const doc = parser.parseFromString(htmlText, 'text/html');

                    const visualizacao = doc.querySelector('#conteudo > table') as HTMLTableElement;
                    if (!visualizacao || visualizacao.rows.length < 2) {
                        return null;
                    }

                    const compCell = (visualizacao.rows[0]?.cells[1]?.textContent || visualizacao.rows[0]?.cells[1]?.innerText || '').trim();
                    const compInfo = compCell.split(' - ');
                    const codigo = compInfo[0] || '';
                    const componente = compInfo[1] || compCell;
                    const turma = (visualizacao.rows[1]?.cells[1]?.textContent || visualizacao.rows[1]?.cells[1]?.innerText || '').trim();
                    const docente = (visualizacao.rows[2]?.cells[1]?.textContent || visualizacao.rows[2]?.cells[1]?.innerText || '').trim();

                    const rowsData: any[] = [];
                    const registros = doc.querySelector('#lista-turmas-matriculas > tbody') as HTMLTableSectionElement;
                    if (registros && registros.rows.length > 0) {
                        for (let j = 0; j < registros.rows.length; j++) {
                            const row = registros.rows[j];
                            if (row.cells.length >= 3) {
                                const getCellText = (idx: number) => (row.cells[idx]?.textContent || row.cells[idx]?.innerText || '').trim();
                                rowsData.push({
                                    codigo,
                                    componente,
                                    docente,
                                    turma,
                                    matricula: getCellText(0),
                                    nome: getCellText(1),
                                    curso: getCellText(2),
                                    tipoReserva: getCellText(4) || 'NÃO INFORMADO',
                                    situacao: getCellText(row.cells.length - 1)
                                });
                            }
                        }
                    } else {
                        rowsData.push({
                            codigo,
                            componente,
                            docente,
                            turma,
                            matricula: 'SEM ALUNO',
                            nome: 'TURMA SEM ALUNOS',
                            curso: 'N/A',
                            tipoReserva: 'N/A',
                            situacao: 'N/A'
                        });
                    }

                    return {
                        codigo,
                        componente,
                        turma,
                        docente,
                        rows: rowsData
                    };
                } catch (e: any) {
                    return { error: e.message };
                }
            }, payload);

            if (turmaResult && !turmaResult.error && turmaResult.rows) {
                await addLog(`[${i + 1}/${turmaPayloads.length}] Turma: ${turmaResult.codigo} - ${turmaResult.componente} - ${turmaResult.turma}`);
                scrapedData.push(...turmaResult.rows);
            } else if (turmaResult?.error) {
                await addLog(`[AVISO] [${i + 1}/${turmaPayloads.length}] Erro ao carregar turma: ${turmaResult.error}`);
            } else {
                await addLog(`[AVISO] [${i + 1}/${turmaPayloads.length}] Não foi possível extrair dados da turma.`);
            }
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
