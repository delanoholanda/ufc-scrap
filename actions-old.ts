'use server';
import type { ScrapedDataRow, User } from '@/lib/types';
import puppeteer, { type PuppeteerLaunchOptions, ElementHandle, Browser, Page, Target } from 'puppeteer';
import { getDB } from './database';

// Helper function to add delay
const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

async function saveData(year: string, semester: string, data: ScrapedDataRow[]) {
  const db = getDB();
  try {
    const extractionStmt = db.prepare('INSERT INTO extractions (year, semester) VALUES (?, ?)');
    const extractionResult = extractionStmt.run(year, semester);
    const extractionId = extractionResult.lastInsertRowid;

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


export async function scrapeUFCData(formData: FormData): Promise<{ success: boolean; data?: ScrapedDataRow[]; error?: string, logs?: string[] }> {
    const year = formData.get("year") as string;
    const semester = formData.get("semester") as string;

    const username = process.env.SIGAA_USERNAME || formData.get("username") as string;
    const password = process.env.SIGAA_PASSWORD || formData.get("password") as string;

    const logs: string[] = [];
    const addLog = (message: string) => {
        const logMsg = `[${new Date().toLocaleTimeString()}][LOG] ${message}`;
        console.log(logMsg);
        logs.push(logMsg);
    }
    const addError = (message: string) => {
        const errorMsg = `[${new Date().toLocaleTimeString()}][ERRO] ${message}`;
        console.error(errorMsg);
        logs.push(errorMsg);
    }

    if (!year || !semester || !username || !password) {
        const errorMsg = "Ano, período, usuário e senha são obrigatórios.";
        addError(errorMsg);
        return { success: false, error: errorMsg, logs };
    }

    addLog(`Iniciando extração para ${year}/${semester}.`);

    let browser: Browser | undefined;
    try {
        addLog("Etapa 1: Configurando e lançando o navegador...");

        const isProduction = !!process.env.FIREBASE_APP_HOSTING_URL;

        const launchOptions: PuppeteerLaunchOptions = {
            headless: isProduction,
            args: isProduction
                ? ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
                : [],
        };

        addLog(`Ambiente de produção detectado: ${isProduction}.`);
        addLog(`Opções de lançamento: ${JSON.stringify(launchOptions)}`);

        browser = await puppeteer.launch(launchOptions);
        const page: Page = await browser.newPage();
        addLog("Navegador iniciado com sucesso.");

        addLog("Etapa 2: Navegando para a página de login do SIGAA...");
        await page.goto('https://si3.ufc.br/sigaa/verTelaLogin.do');
        addLog("Página de login carregada.");

        addLog("Etapa 3: Preenchendo credenciais...");
        await page.type('input[name="user.login"]', username);
        await page.type('input[name="user.senha"]', password);
        addLog("Credenciais preenchidas.");

        addLog("Etapa 4: Realizando login...");
        await Promise.all([
            page.waitForNavigation(),
            page.click('input[type="submit"]'),
        ]);

        const loginErrorElement = await page.$('.error');
        if (loginErrorElement) {
            const errorMessage = await page.evaluate(el => el.textContent, loginErrorElement);
            const errorMsg = `Falha no login: ${errorMessage?.trim()}`;
            addError(errorMsg);
            await browser.close();
            return { success: false, error: errorMsg, logs };
        }
        addLog("Login bem-sucedido!");

        addLog("Etapa 4.5: Selecionando o vínculo para acessar o portal...");
        await page.waitForSelector("li:not(.disabled) a", { timeout: 10000 });
        addLog("Página de vínculos carregada. Procurando por 'Secretaria'.");

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

        addLog("Vínculo 'Secretaria' encontrado. Clicando...");
        const link = vinculoElement.asElement() as ElementHandle<Element>;
        if (link) {
            await Promise.all([
                page.waitForNavigation(),
                link.click()
            ]);
            addLog("Vínculo selecionado. Acessando portal principal...");
        } else {
            throw new Error("Referência ao elemento do vínculo é nula.");
        }


        addLog("Etapa 4.6: Entrando no módulo de Graduação...");
        await delay(1000);
        const graduacaoSelector = 'a[href*="verMenuGraduacao.do"]';
        await page.waitForSelector(graduacaoSelector, { timeout: 10000 });
        addLog("Módulo de graduação encontrado. Clicando...");
        await Promise.all([
            page.waitForNavigation(),
            page.click(graduacaoSelector),
        ]);
        addLog("Módulo de graduação acessado.");


        addLog("Etapa 5: Navegando para a consulta de turmas...");
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
        addLog("Página de consulta carregada.");

        addLog("Etapa 6: Preenchendo formulário de busca de turmas...");
        await page.waitForSelector('table.formulario', { timeout: 30000 });

        await page.click('input#form\\:checkNivel');
        addLog("Checkbox 'Nível' desmarcado.");

        await page.click('input[name="form:inputAno"]', { clickCount: 3 });
        await page.keyboard.press('Backspace');
        await page.type('input[name="form:inputAno"]', year);
        addLog(`Ano '${year}' preenchido.`);

        await page.click('input[name="form:inputPeriodo"]', { clickCount: 3 });
        await page.keyboard.press('Backspace');
        await page.type('input[name="form:inputPeriodo"]', semester);
        addLog(`Período '${semester}' preenchido.`);

        await page.select('select[name="form:selectUnidade"]', '1020');
        addLog("Unidade 'CAMPUS DA UFC EM QUIXADÁ' selecionada.");

        await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle0' }),
            page.click('input[name="form:buttonBuscar"]'),
        ]);
        addLog("Busca de turmas realizada.");

        addLog("Etapa 7: Extraindo dados da tabela de turmas...");
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
        addLog(`Encontradas ${turmasParaProcessar.length} turmas. Iniciando extração de dados dos alunos...`);
        
        for (let i = 0; i < turmasParaProcessar.length; i++) {
            const turmaInfo = turmasParaProcessar[i];
            addLog(`(${i + 1}/${turmasParaProcessar.length}) Processando turma ${turmaInfo.turma} de ${turmaInfo.componente}...`);

            try {
                // ABORDAGEM ROBUSTA: Executar JS diretamente
                addLog(`Navegando para alunos da turma ID ${turmaInfo.idTurma} via JS.`);
                await Promise.all([
                    page.waitForNavigation({ waitUntil: 'networkidle0' }),
                    page.evaluate((id) => {
                        // Esta função simula o clique no link "Listar Alunos"
                        // @ts-ignore
                        jsfcljs(document.forms['form'], 'form:j_id_jsp_1668842680_875,form:j_id_jsp_1668842680_875,id,' + id + ',turmasEAD,false', '');
                    }, turmaInfo.idTurma)
                ]);

                addLog("Página de alunos carregada.");

                // 5. Extrai os dados
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
                     addLog(`Turma ${turmaInfo.turma} não possui alunos matriculados.`);
                    scrapedData.push({
                        ...turmaInfo, matricula: 'SEM ALUNO', nome: '***', curso: '***', tipoReserva: '***', situacao: '***'
                    });
                }

                // 6. Volta para a página anterior
                addLog(`Extração da turma ${turmaInfo.turma} concluída. Voltando...`);
                await page.goBack({ waitUntil: 'networkidle0' });
                await page.waitForSelector('#lista-turmas', { timeout: 10000 });
                addLog('Retornou à lista de turmas com sucesso.');

            } catch (e: any) {
                addError(`Erro ao processar alunos da turma ${turmaInfo.turma}: ${e.message}. Tentando voltar...`);
                try {
                    // Tenta recarregar a página de busca como um fallback de emergência
                    await page.goto('https://si3.ufc.br/sigaa/ensino/turma/busca_turma.jsf', { waitUntil: 'networkidle0' });
                    await page.waitForSelector('#lista-turmas', { timeout: 10000 });
                    addLog('Recuperado com sucesso, retornou à lista de turmas.');
                } catch (navError: any) {
                    addError(`Falha crítica ao tentar voltar para a lista de turmas. Abortando. Erro: ${navError.message}`);
                    throw navError;
                }
            }
        }

        if (scrapedData.length > 0) {
            addLog(`Salvando ${scrapedData.length} registros no banco de dados...`);
            const saveResult = await saveData(year, semester, scrapedData);
            if (!saveResult.success) {
                throw new Error(saveResult.error);
            }
            addLog("Dados salvos com sucesso.");
        }


        addLog("Extração concluída com sucesso.");
        return { success: true, data: scrapedData, logs };

    } catch (e) {
        const errorMessage = e instanceof Error ? e.message : 'Um erro desconhecido ocorreu.';
        const finalError = `Erro durante a automação: ${errorMessage}`;
        addError(finalError);
        return { success: false, error: finalError, logs };
    } finally {
        if (browser) {
            addLog("Fechando o navegador...");
            await browser.close();
        }
    }
}


// 1178348 funciona