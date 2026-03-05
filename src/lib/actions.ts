'use server';
import type { ScrapedDataRow, CSVFile, Extraction } from '@/lib/types';
import puppeteer, { type PuppeteerLaunchOptions, Browser, Page } from 'puppeteer';
import { getDB, getExtractionStatus, fetchLatestSuccessfulExtraction } from './database';
import { processData } from './processing/process-data';


// Helper function to add delay
const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

async function createExtractionEntry(year: string, semester: string) {
    const db = getDB();
    try {
        const stmt = db.prepare('INSERT INTO extractions (year, semester, status) VALUES (?, ?, ?)');
        const result = stmt.run(year, semester, 'running');
        return Number(result.lastInsertRowid);
    } catch (e) {
        console.error("Database Error:", e);
        throw new Error("Falha ao criar o registro da extração no banco de dados.");
    }
}

async function updateExtractionStatus(id: number, status: 'completed' | 'failed' | 'cancelled') {
    const db = getDB();
    try {
        db.prepare('UPDATE extractions SET status = ? WHERE id = ?').run(status, id);
    } catch(e) {
        console.error(`Falha ao atualizar status da extração ${id} para ${status}:`, e);
    }
}

async function saveData(extractionId: number, data: ScrapedDataRow[]) {
  const db = getDB();
  try {
    const dataStmt = db.prepare(
      'INSERT INTO scraped_data (extraction_id, codigo, componente, docente, turma, matricula, nome, curso, tipoReserva, situacao) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );

    const insertMany = db.transaction((rows: ScrapedDataRow[]) => {
      for (const row of rows) {
        dataStmt.run(
          extractionId,
          row.codigo,
          row.componente,
          row.docente,
          row.turma,
          row.matricula,
          row.nome,
          row.curso,
          row.tipoReserva,
          row.situacao
        );
      }
    });

    insertMany(data);
    return { success: true, extractionId };
  } catch (e) {
    console.error("Database Error:", e);
    return { success: false, error: "Falha ao salvar os dados no banco de dados." };
  }
}

async function saveProcessedFiles(extractionId: number, files: CSVFile[]) {
    const db = getDB();
    try {
        const stmt = db.prepare('INSERT INTO processed_files (extraction_id, filename, content) VALUES (?, ?, ?)');
        const insertMany = db.transaction((filesToSave: CSVFile[]) => {
            for (const file of filesToSave) {
                stmt.run(extractionId, file.filename, file.content);
            }
        });
        insertMany(files);
        return { success: true };
    } catch (e) {
        console.error("Database Error (Processed Files):", e);
        return { success: false, error: "Falha ao salvar os arquivos processados no banco de dados." };
    }
}

function compareScrapedData(oldData: ScrapedDataRow[], newData: ScrapedDataRow[]): ScrapedDataRow[] {
    const oldDataMap = new Map<string, ScrapedDataRow>();
    oldData.forEach(row => {
        const turmaRef = (row.turma || '').replace('Turma ', '').trim();
        const key = `${turmaRef}-${(row.matricula || '').trim()}`;
        oldDataMap.set(key, row);
    });

    const newDataMap = new Map<string, ScrapedDataRow>();
    newData.forEach(row => {
        const turmaRef = (row.turma || '').replace('Turma ', '').trim();
        const key = `${turmaRef}-${(row.matricula || '').trim()}`;
        newDataMap.set(key, row);
    });

    const differences: ScrapedDataRow[] = [];

    newDataMap.forEach((newRow, key) => {
        const oldRow = oldDataMap.get(key);
        if (!oldRow || oldRow.situacao !== newRow.situacao) {
            differences.push(newRow);
        }
    });

    oldMapCheck: oldDataMap.forEach((oldRow, key) => {
        if (!newDataMap.has(key)) {
            differences.push({ ...oldRow, situacao: 'REMOVIDO' });
        }
    });
    
    return differences;
}


export async function scrapeUFCData(
    formData: FormData,
    onLog: (log: string) => Promise<void>,
    onIdCreated: (id: number) => Promise<void>
): Promise<{ success: boolean; data?: ScrapedDataRow[]; error?: string, cancelled?: boolean, noChanges?: boolean }> {
    const year = formData.get("year") as string;
    const semester = formData.get("semester") as string;
    const visibleMode = formData.get("visibleMode") === 'on';

    const username = process.env.SIGAA_USERNAME || formData.get("username") as string;
    const password = process.env.SIGAA_PASSWORD || formData.get("password") as string;

    const addLog = async (message: string) => {
        const logMsg = `[${new Date().toLocaleTimeString()}][LOG] ${message}`;
        console.log(logMsg);
        await onLog(logMsg);
    }
    const addError = async (message: string) => {
        const errorMsg = `[${new Date().toLocaleTimeString()}][ERRO] ${message}`;
        console.error(errorMsg);
        await onLog(errorMsg);
    }

    if (!year || !semester || !username || !password) {
        const errorMsg = "Ano, período, usuário e senha são obrigatórios.";
        await addError(errorMsg);
        return { success: false, error: errorMsg };
    }
    
    await addLog(`Iniciando extração para ${year}/${semester}.`);
    
    let extractionId: number;
    try {
        extractionId = await createExtractionEntry(year, semester);
        await onIdCreated(extractionId);
    } catch (e: any) {
        await addError(e.message);
        return { success: false, error: e.message };
    }

    let browser: Browser | undefined;
    try {
        await addLog("Etapa 1: Configurando e lançando o navegador...");
        const isProduction = !!process.env.FIREBASE_APP_HOSTING_URL;
        const launchOptions: PuppeteerLaunchOptions = {
            headless: !visibleMode,
            args: isProduction ? ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] : [],
        };

        browser = await puppeteer.launch(launchOptions);
        const page: Page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });

        await addLog("Etapa 2: Navegando para o SIGAA...");
        await page.goto('https://si3.ufc.br/sigaa/verTelaLogin.do');
        await page.type('input[name="user.login"]', username);
        await page.type('input[name="user.senha"]', password);
        await Promise.all([page.waitForNavigation(), page.click('input[type="submit"]')]);

        const loginErrorElement = await page.$('.error');
        if (loginErrorElement) {
            const errorMessage = await page.evaluate(el => el.textContent, loginErrorElement);
            throw new Error(`Falha no login: ${errorMessage?.trim()}`);
        }
        await addLog("Login bem-sucedido!");

        await addLog(`Etapa 4.5: Selecionando o vínculo 'Secretaria'...`);
        await page.waitForSelector("section.listagem ul li", { timeout: 15000 });
        
        const clickedSecretaria = await page.evaluate(() => {
            const items = Array.from(document.querySelectorAll('section.listagem ul li:not(.disabled)'));
            // Procura o item onde a segunda coluna (col-xs-2) contém exatamente "Secretaria"
            const targetItem = items.find(li => {
                const vinculoName = li.querySelector('span.col-xs-2')?.textContent?.trim().toUpperCase() || '';
                return vinculoName === 'SECRETARIA';
            });
            
            if (targetItem) {
                const link = targetItem.querySelector('a');
                if (link) {
                    (link as HTMLElement).click();
                    return true;
                }
            }
            return false;
        });

        if (!clickedSecretaria) {
            throw new Error("Não foi possível encontrar o vínculo 'SECRETARIA' ativo.");
        }
        await addLog("Vínculo de acesso selecionado.");
        await page.waitForNavigation({ waitUntil: 'networkidle0' });

        // Etapa de aviso intermediária (se houver)
        try {
            await page.waitForSelector('input[value="Continuar >>"]', { timeout: 3000 });
            await Promise.all([page.waitForNavigation(), page.click('input[value="Continuar >>"]')]);
            await addLog("Tela de aviso confirmada.");
        } catch (e) {}

        await addLog("Etapa 4.6: Entrando no módulo de Graduação...");
        await page.waitForSelector('a[href*="verMenuGraduacao.do"]', { timeout: 15000 });
        await Promise.all([page.waitForNavigation(), page.click('a[href*="verMenuGraduacao.do"]')]);
        await addLog("Módulo de graduação acessado.");

        await addLog("Etapa 5: Navegando para a consulta de turmas...");
        await page.waitForSelector('div#coordenacao.aba', { visible: true, timeout: 15000 });
        await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('div#coordenacao.aba a'));
            const target = links.find(a => a.textContent?.trim().includes("Consultar") && a.textContent?.trim().includes("Turma"));
            if (target) (target as HTMLElement).click();
        });
        await page.waitForNavigation();
        await addLog("Página de consulta carregada.");

        await addLog("Etapa 6: Preenchendo formulário de busca de turmas...");
        await page.waitForSelector('table.formulario', { timeout: 15000 });
        const isNivelChecked = await page.$eval('input#form\\:checkNivel', el => (el as HTMLInputElement).checked).catch(() => false);
        if (isNivelChecked) await page.click('input#form\\:checkNivel');

        await page.click('input[name="form:inputAno"]', { clickCount: 3 });
        await page.keyboard.press('Backspace');
        await page.type('input[name="form:inputAno"]', year);
        await page.click('input[name="form:inputPeriodo"]', { clickCount: 3 });
        await page.keyboard.press('Backspace');
        await page.type('input[name="form:inputPeriodo"]', semester);
        
        await page.select('select[name="form:selectUnidade"]', '1020'); // CAMPUS QUIXADA
        await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.click('input[name="form:buttonBuscar"]')]);
        await addLog("Busca de turmas realizada.");

        await addLog("Etapa 7: Analisando tabela de turmas...");
        const turmasInfo = await page.evaluate(() => {
            const list: any[] = [];
            let lastCodigo = '';
            let lastComponente = '';
            const rows = Array.from(document.querySelectorAll('#lista-turmas > tbody > tr'));
            rows.forEach(row => {
                if (row.classList.contains('destaque')) {
                    const text = row.textContent?.trim() || '';
                    const match = text.match(/(.*) - (.*)/);
                    if (match) {
                        lastCodigo = match[1].trim();
                        lastComponente = match[2].split('(')[0].trim();
                    }
                } else if (row.classList.contains('linhaPar') || row.classList.contains('linhaImpar')) {
                    const menuImg = row.querySelector('img[title="Visualizar Menu"]');
                    if (menuImg) {
                        const idMatch = menuImg.id.match(/exibir_(\d+)/);
                        const id = idMatch ? idMatch[1] : null;
                        const cells = row.querySelectorAll('td');
                        if (id) {
                            list.push({
                                id,
                                codigo: lastCodigo,
                                componente: lastComponente,
                                turma: cells[1]?.textContent?.trim() || '',
                                docente: cells[2]?.textContent?.trim() || ''
                            });
                        }
                    }
                }
            });
            return list;
        });

        const totalToProcess = turmasInfo.length;
        await addLog(`${totalToProcess} turmas identificadas.`);

        const scrapedData: ScrapedDataRow[] = [];

        for (let i = 0; i < totalToProcess; i++) {
            const status = getExtractionStatus(extractionId);
            if (status === 'cancelled') {
                await updateExtractionStatus(extractionId, 'cancelled');
                return { success: false, error: "Extração cancelada pelo usuário.", cancelled: true };
            }

            const info = turmasInfo[i];
            await addLog(`(${i + 1}/${totalToProcess}) Acessando turma ${info.turma} de ${info.codigo}...`);

            try {
                // Abre o menu de opções
                await page.click(`#exibir_${info.id}`);
                await delay(800); // Aguarda a animação do menu

                // Clica em "Listar Alunos" dentro do menu que acabou de abrir
                const clicked = await page.evaluate((id) => {
                    const menuRow = document.querySelector(`#trOpcoesTurma${id}`);
                    if (!menuRow) return false;
                    const links = Array.from(menuRow.querySelectorAll('a'));
                    const target = links.find(a => a.textContent?.trim().includes("Listar Alunos"));
                    if (target) {
                        (target as HTMLElement).click();
                        return true;
                    }
                    return false;
                }, info.id);

                if (!clicked) throw new Error("Link 'Listar Alunos' não encontrado no menu.");

                await page.waitForNavigation({ waitUntil: 'networkidle0' });
                await page.waitForSelector('#lista-turmas-matriculas', { timeout: 10000 });

                // Extrai os dados dos alunos
                const studentsFound = await page.evaluate((info) => {
                    const rows = Array.from(document.querySelectorAll('#lista-turmas-matriculas tbody tr'));
                    return rows.map(tr => {
                        const tds = Array.from(tr.querySelectorAll('td')).map(td => td.innerText?.trim() || '');
                        if (tds.length >= 8) {
                            return {
                                codigo: info.codigo,
                                componente: info.componente,
                                docente: info.docente,
                                turma: info.turma,
                                matricula: tds[0],
                                nome: tds[1].split('\n')[0].trim(),
                                curso: tds[2].trim(),
                                tipoReserva: tds[4].trim(),
                                situacao: tds[7].trim()
                            };
                        }
                        return null;
                    }).filter(s => s !== null);
                }, info);

                if (studentsFound.length > 0) {
                    const s = studentsFound[0] as any;
                    await addLog(`- ${studentsFound.length} alunos extraídos. Exemplo: ${s.nome} (${s.matricula})`);
                } else {
                    await addLog(`- Nenhum aluno encontrado na tabela de discentes.`);
                }

                scrapedData.push(...(studentsFound as ScrapedDataRow[]));
                
                // Volta para a lista de turmas
                await page.goBack({ waitUntil: 'networkidle0' });
            } catch (e: any) {
                await addError(`Erro na turma ${info.turma}: ${e.message}`);
                // Tenta recuperar navegando de volta para a busca caso se perca
                await page.goto('https://si3.ufc.br/sigaa/ensino/turma/busca_turma.jsf', { waitUntil: 'networkidle0' }).catch(() => {});
            }
        }

        if (scrapedData.length > 0) {
            await addLog(`Total de ${scrapedData.length} registros extraídos.`);
            await addLog("Salvando dados brutos...");
            await saveData(extractionId, scrapedData);

            let dataToProcess = scrapedData;
            const previous = await fetchLatestSuccessfulExtraction(year, semester);
            
            if (previous.extraction && previous.data && previous.data.length > 0) {
                await addLog("Comparando com extração anterior...");
                const differences = compareScrapedData(previous.data, scrapedData);
                await addLog(`${differences.length} alterações detectadas.`);
                if (differences.length === 0) {
                    await updateExtractionStatus(extractionId, 'completed');
                    return { success: true, noChanges: true };
                }
                dataToProcess = differences;
            }

            await addLog("Processando e gerando arquivos CSV...");
            const files = await processData(dataToProcess, `${year}.${semester}`, addLog);
            await addLog("Salvando arquivos finais...");
            await saveProcessedFiles(extractionId, files);
        } else {
            await addLog("Aviso: Nenhum aluno extraído de nenhuma turma.");
        }
        
        await updateExtractionStatus(extractionId, 'completed');
        await addLog("Processo concluído com sucesso!");
        return { success: true, data: scrapedData };

    } catch (e: any) {
        await addError(`Falha Crítica: ${e.message}`);
        await updateExtractionStatus(extractionId, 'failed');
        return { success: false, error: e.message };
    } finally {
        if (browser) await browser.close();
    }
}
