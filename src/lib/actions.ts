'use server';
import type { ScrapedDataRow, CSVFile } from '@/lib/types';
import puppeteer, { type PuppeteerLaunchOptions, ElementHandle, Browser, Page } from 'puppeteer';
import { getDB, getExtractionStatus } from './database';
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


export async function scrapeUFCData(
    formData: FormData,
    onLog: (log: string) => Promise<void>,
    onIdCreated: (id: number) => Promise<void>
): Promise<{ success: boolean; data?: ScrapedDataRow[]; error?: string, cancelled?: boolean }> {
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
        await addLog(`Registro de extração criado com ID: ${extractionId}`);
        await onIdCreated(extractionId); // Send ID to client immediately
    } catch (e: any) {
        await addError(e.message);
        return { success: false, error: e.message };
    }


    if(visibleMode) {
        await addLog("Modo visível ATIVADO. A janela do navegador será exibida.");
    } else {
        await addLog("Modo visível DESATIVADO. O processo será executado em segundo plano.");
    }

    let browser: Browser | undefined;
    try {
        await addLog("Etapa 1: Configurando e lançando o navegador...");

        const isProduction = !!process.env.FIREBASE_APP_HOSTING_URL;

        const launchOptions: PuppeteerLaunchOptions = {
            headless: !visibleMode,
            args: isProduction
                ? ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
                : [],
        };

        await addLog(`Ambiente de produção detectado: ${isProduction}.`);
        await addLog(`Opções de lançamento: ${JSON.stringify(launchOptions)}`);

        browser = await puppeteer.launch(launchOptions);
        const page: Page = await browser.newPage();
        await addLog("Navegador iniciado com sucesso.");

        await addLog("Etapa 2: Navegando para a página de login do SIGAA...");
        await page.goto('https://si3.ufc.br/sigaa/verTelaLogin.do');
        await addLog("Página de login carregada.");

        await addLog("Etapa 3: Preenchendo credenciais...");
        await page.type('input[name="user.login"]', username);
        await page.type('input[name="user.senha"]', password);
        await addLog("Credenciais preenchidas.");

        await addLog("Etapa 4: Realizando login...");
        await Promise.all([
            page.waitForNavigation(),
            page.click('input[type="submit"]'),
        ]);

        const loginErrorElement = await page.$('.error');
        if (loginErrorElement) {
            const errorMessage = await page.evaluate(el => el.textContent, loginErrorElement);
            const errorMsg = `Falha no login: ${errorMessage?.trim()}`;
            await addError(errorMsg);
            throw new Error(errorMsg);
        }
        await addLog("Login bem-sucedido!");

        await addLog("Etapa 4.5: Selecionando o vínculo para acessar o portal...");
        await page.waitForSelector("li:not(.disabled) a", { timeout: 10000 });
        await addLog("Página de vínculos carregada. Procurando por 'Secretaria'.");

        const vinculoElement = await page.evaluateHandle(() => {
            const links = Array.from(document.querySelectorAll('li:not(.disabled) a'));
            for (const link of links) {
                const linkSpan = link.querySelector('span.col-xs-2');
                if (linkSpan && linkSpan.textContent?.trim().toLowerCase() === 'secretaria') {
                    return link;
                }
            }
            return document.querySelector('li:not(.disabled) a');
        });

        if (!vinculoElement || !(vinculoElement.asElement())) {
            throw new Error("Não foi possível encontrar um vínculo de Secretaria ativo para clicar.");
        }

        await addLog("Vínculo 'Secretaria' encontrado. Clicando...");
        const link = vinculoElement.asElement() as ElementHandle<Element>;
        if (link) {
            await Promise.all([
                page.waitForNavigation(),
                link.click()
            ]);
            await addLog("Vínculo selecionado. Acessando portal principal...");
        } else {
            throw new Error("Referência ao elemento do vínculo é nula.");
        }


        await addLog("Etapa 4.6: Entrando no módulo de Graduação...");
        await delay(1000);
        const graduacaoSelector = 'a[href*="verMenuGraduacao.do"]';
        await page.waitForSelector(graduacaoSelector, { timeout: 10000 });
        await addLog("Módulo de graduação encontrado. Clicando...");
        await Promise.all([
            page.waitForNavigation(),
            page.click(graduacaoSelector),
        ]);
        await addLog("Módulo de graduação acessado.");


        await addLog("Etapa 5: Navegando para a consulta de turmas...");
        await page.waitForSelector('div#coordenacao.aba', { visible: true, timeout: 10000 });

        const consultaLinkHandle = await page.evaluateHandle(() => {
            const links = Array.from(document.querySelectorAll('div#coordenacao.aba a'));
            return links.find(a => a.textContent?.trim() === "Consultar, Alterar, Consolidar e Remover Turma");
        });

        if (!consultaLinkHandle || !consultaLinkHandle.asElement()) {
            throw new Error("Não foi possível encontrar o link de 'Consultar, Alterar, Consolidar e Remover Turma'.");
        }

        const consultaLink = consultaLinkHandle.asElement() as ElementHandle<Element>;
        await Promise.all([
            page.waitForNavigation(),
            consultaLink.click(),
        ]);
        await addLog("Página de consulta carregada.");

        await addLog("Etapa 6: Preenchendo formulário de busca de turmas...");
        await page.waitForSelector('table.formulario', { timeout: 30000 });

        await page.click('input#form\\:checkNivel');
        await addLog("Checkbox 'Nível' desmarcado.");

        await page.click('input[name="form:inputAno"]', { clickCount: 3 });
        await page.keyboard.press('Backspace');
        await page.type('input[name="form:inputAno"]', year);
        await addLog(`Ano '${year}' preenchido.`);

        await page.click('input[name="form:inputPeriodo"]', { clickCount: 3 });
        await page.keyboard.press('Backspace');
        await page.type('input[name="form:inputPeriodo"]', semester);
        await addLog(`Período '${semester}' preenchido.`);

        await page.select('select[name="form:selectUnidade"]', '1020');
        await addLog("Unidade 'CAMPUS DA UFC EM QUIXADÁ' selecionada.");

        await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle0' }),
            page.click('input[name="form:buttonBuscar"]'),
        ]);
        await addLog("Busca de turmas realizada.");

        await addLog("Etapa 7: Extraindo dados da tabela de turmas...");
        await page.waitForSelector('#lista-turmas > tbody > tr', { timeout: 10000 });

        const scrapedData: ScrapedDataRow[] = [];
        let currentComponenteInfo = { codigo: '', componente: '' };

        const classRowsHandles = await page.$$('#lista-turmas > tbody > tr');
        let turmasParaProcessar = [];

        for (const row of classRowsHandles) {
            const isHeader = await row.evaluate(el => el.classList.contains('destaque'));
            const isVisible = await row.evaluate(el => (el as HTMLElement).style.display !== 'none');

            if (isHeader) {
                const headerText = await row.evaluate(el => el.textContent?.trim() || '');
                const componenteMatch = headerText?.match(/(.*) - (.*)/);
                currentComponenteInfo.codigo = componenteMatch?.[1] || '';
                currentComponenteInfo.componente = componenteMatch?.[2].replace(/\s*\(.*\)\s*$/, '') || '';
            } else if (isVisible) {
                const idTurmaMatch = await row.evaluate(el => el.querySelector('img[onclick*="exibirOpcoesTurma"]')?.getAttribute('onclick')?.match(/(\d+)/));
                const idTurma = idTurmaMatch ? idTurmaMatch[1] : null;

                if (idTurma) {
                     turmasParaProcessar.push({
                        ...currentComponenteInfo,
                        docente: await row.$eval('td:nth-child(3)', el => el.textContent?.trim() || 'A DEFINIR'),
                        turma: await row.$eval('td:nth-child(2) > a', el => el.textContent?.trim() || ''),
                        idTurma: idTurma
                    });
                }
            }
        }
        
        const isTestMode = false; // Set to false to run for all classes
        if (isTestMode) {
            turmasParaProcessar = turmasParaProcessar.slice(0, 3);
            await addLog(`[MODO DE TESTE] Limitando a extração para ${turmasParaProcessar.length} turmas.`);
        }

        await addLog(`Encontradas ${turmasParaProcessar.length} turmas para processar. Iniciando extração de dados dos alunos...`);

        for (let i = 0; i < turmasParaProcessar.length; i++) {
             const status = getExtractionStatus(extractionId);
             if (status === 'cancelled') {
                 await addLog('Cancelamento detectado. Interrompendo a extração...');
                 await updateExtractionStatus(extractionId, 'cancelled');
                 return { success: false, error: "Extração cancelada pelo usuário.", cancelled: true };
             }
            
            const turmaInfo = turmasParaProcessar[i];
            await addLog(`(${i + 1}/${turmasParaProcessar.length}) Processando turma ${turmaInfo.turma} de ${turmaInfo.componente}...`);

            try {
                await addLog(`Navegando para alunos da turma ID ${turmaInfo.idTurma} via JS.`);
                await Promise.all([
                    page.waitForNavigation({ waitUntil: 'networkidle0' }),
                    page.evaluate((id) => {
                        // @ts-ignore
                        jsfcljs(document.forms['form'], 'form:j_id_jsp_1668842680_875,form:j_id_jsp_1668842680_875,id,' + id + ',turmasEAD,false', '');
                    }, turmaInfo.idTurma)
                ]);

                await addLog("Página de alunos carregada.");

                await page.waitForSelector('table.listagem', { timeout: 10000 });
                const studentRows = await page.$$('#lista-turmas-matriculas > tbody > tr');

                if (studentRows.length > 0) {
                    for (const studentRow of studentRows) {
                        const cells = await studentRow.$$eval('td', tds => tds.map(td => (td as HTMLElement).innerText?.trim() || ''));
                        scrapedData.push({
                            ...turmaInfo,
                            matricula: cells[0] || '',
                            nome: cells[1] || '',
                            curso: cells[2] || '',
                            tipoReserva: cells[4] || '',
                            situacao: cells[7] || '',
                        });
                    }
                } else {
                     await addLog(`Turma ${turmaInfo.turma} não possui alunos matriculados.`);
                    scrapedData.push({
                        ...turmaInfo, matricula: 'SEM ALUNO', nome: '***', curso: '***', tipoReserva: '***', situacao: '***'
                    });
                }

                await addLog(`Extração da turma ${turmaInfo.turma} concluída. Voltando...`);
                await page.goBack({ waitUntil: 'networkidle0' });
                await page.waitForSelector('#lista-turmas', { timeout: 10000 });
                await addLog('Retornou à lista de turmas com sucesso.');

            } catch (e: any) {
                await addError(`Erro ao processar alunos da turma ${turmaInfo.turma}: ${e.message}. Tentando voltar...`);
                try {
                    await page.goto('https://si3.ufc.br/sigaa/ensino/turma/busca_turma.jsf', { waitUntil: 'networkidle0' });
                    await page.waitForSelector('#lista-turmas', { timeout: 10000 });
                    await addLog('Recuperado com sucesso, retornou à lista de turmas.');
                } catch (navError: any) {
                    await addError(`Falha crítica ao tentar voltar para a lista de turmas. Abortando. Erro: ${navError.message}`);
                    throw navError;
                }
            }
        }

        if (scrapedData.length > 0) {
            await addLog("Etapa 8: Salvando dados brutos no banco de dados...");
            const saveResult = await saveData(extractionId, scrapedData);
            if (!saveResult.success) {
                throw new Error(saveResult.error || "Falha ao salvar dados brutos.");
            }
            await addLog("Dados brutos salvos com sucesso.");
            
            await addLog("Etapa 9: Processando dados e gerando arquivos CSV...");
            const processResult = await processData(scrapedData, `${year}.${semester}`);
            
            await addLog("Etapa 10: Salvando arquivos processados no banco de dados...");
            const saveFilesResult = await saveProcessedFiles(extractionId, processResult);
             if (!saveFilesResult.success) {
                throw new Error(saveFilesResult.error);
            }
            await addLog("Arquivos processados salvos com sucesso.");

        } else {
            await addLog("Nenhum dado foi extraído. Processo encerrado.");
        }
        
        await updateExtractionStatus(extractionId, 'completed');
        await addLog("Extração e processamento concluídos com sucesso.");
        return { success: true, data: scrapedData };

    } catch (e) {
        const errorMessage = e instanceof Error ? e.message : 'Um erro desconhecido ocorreu.';
        const finalError = `Erro durante a automação: ${errorMessage}`;
        await addError(finalError);
        await updateExtractionStatus(extractionId, 'failed');
        return { success: false, error: finalError };
    } finally {
        if (browser) {
            await addLog("Fechando o navegador...");
            await browser.close();
        }
    }
}


export async function processScrapedData(
  data: ScrapedDataRow[],
  year: string,
  semester: string
): Promise<{ success: boolean; files?: CSVFile[]; error?: string }> {
  try {
    if (!data || data.length === 0) {
      return { success: false, error: 'Não há dados para processar.' };
    }
    
    const category = `${year}.${semester}`;
    const files = await processData(data, category);

    return { success: true, files };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Um erro desconhecido ocorreu durante o processamento.';
    console.error('[PROCESS_SCRAPED_DATA_ERROR]', errorMessage);
    return { success: false, error: errorMessage };
  }
}
