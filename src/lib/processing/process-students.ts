
'use server';
import ldap, { SearchEntry } from 'ldapjs';

function normalizeString(str: string): string {
    if (!str) return '';
    return str
        .toUpperCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^A-Z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Busca no LDAP apenas os alunos cujas matrículas ou nomes foram extraídos.
 * Isso evita o erro de "Size Limit Exceeded".
 */
async function fetchSpecificStudents(client: ldap.Client, uniqueStudents: Student[], logger: (m: string) => Promise<void>): Promise<{ 
    matriculaMap: Map<string, string>, 
    nameMap: Map<string, any> 
}> {
    const matriculaMap = new Map<string, string>();
    const nameMap = new Map<string, any>();

    // Filtramos apenas matrículas válidas
    const matriculas = uniqueStudents.map(s => String(s.matricula).trim()).filter(m => m && m !== 'SEM ALUNO');
    const nomes = uniqueStudents.map(s => s.nome.trim()).filter(n => n);

    if (matriculas.length === 0) return { matriculaMap, nameMap };

    // Criamos um filtro OR gigante para buscar todos de uma vez
    // Ex: (|(matricula=123)(matricula=456)(nomecompleto=JOAO...))
    // Nota: Dividimos em lotes de 50 para evitar filtros excessivamente longos
    const batchSize = 50;
    for (let i = 0; i < matriculas.length; i += batchSize) {
        const batchMatriculas = matriculas.slice(i, i + batchSize);
        const batchNomes = nomes.slice(i, i + batchSize);

        const matriculaFilter = batchMatriculas.map(m => `(matricula=${m})`).join('');
        // Para nomes, usamos wildcard básico caso haja acentos no servidor
        const nameFilter = batchNomes.map(n => `(nomecompleto=${n})`).join('');
        
        const finalFilter = `(&(objectClass=alunoUFCQuixada)(|${matriculaFilter}${nameFilter}))`;

        await new Promise<void>((resolve, reject) => {
            const opts = {
                filter: finalFilter,
                scope: 'sub' as const,
                attributes: ['uid', 'matricula', 'nomecompleto', 'curso', 'semestre', 'siape'],
                sizeLimit: 0
            };

            client.search('ou=people,dc=quixada,dc=ufc,dc=br', opts, (err, res) => {
                if (err) return reject(err);

                res.on('searchEntry', (entry: SearchEntry) => {
                    const pojo = entry.pojo;
                    const attributes: any = {};
                    pojo.attributes?.forEach(attr => {
                        attributes[attr.type] = attr.values[0];
                    });
                    
                    const uid = attributes.uid;
                    const matricula = attributes.matricula;
                    const nome = attributes.nomecompleto;

                    if (uid && matricula) {
                        matriculaMap.set(String(matricula).trim(), String(uid).trim());
                    }
                    if (uid && nome) {
                        nameMap.set(normalizeString(nome), { dn: entry.dn.toString(), attributes });
                    }
                });
                res.on('error', (err) => {
                    logger(`[AVISO LDAP] Erro durante busca específica: ${err.message}`);
                    resolve(); // Continua mesmo com erro em um lote
                });
                res.on('end', () => resolve());
            });
        });
    }

    return { matriculaMap, nameMap };
}

async function modifyLdapEntry(client: ldap.Client, dn: string, changes: any): Promise<boolean> {
     return new Promise((resolve) => {
        client.modify(dn, changes, (err) => {
            if (err) {
                console.error(`[LDAP_MODIFY_ERROR] Falha ao modificar DN ${dn}:`, err);
                return resolve(false);
            }
            resolve(true);
        });
    });
}

interface Student {
    matricula: string;
    nome: string;
    curso: string;
    situacao: string;
    tipoReserva: string;
    'Curso ShortName': string;
    CPF?: string;
}

export async function processStudents(data: any[], logger: (m: string) => Promise<void>) {
    await logger("[LDAP] Cruzando dados de alunos com diretório...");
    
    const uniqueStudents: Student[] = Array.from(new Map(data.map(item => [String(item['matricula']).trim(), item])).values())
      .filter((s: Student) => s.matricula && s.matricula !== 'SEM ALUNO');
    
    await logger(`[LDAP] ${uniqueStudents.length} alunos únicos identificados nos dados extraídos.`);

    const ldapClient = ldap.createClient({ 
        url: `ldap://${process.env.LDAP_SERVER}:${process.env.LDAP_PORT}`,
        connectTimeout: 10000
    });
    
    try {
        await new Promise<void>((resolve, reject) => {
            ldapClient.bind(process.env.LDAP_USERNAME!, process.env.LDAP_PASSWORD!, (err) => {
                if (err) return reject(err);
                resolve();
            });
        });

        // BUSCA CIRÚRGICA: Apenas os alunos extraídos
        const { matriculaMap, nameMap } = await fetchSpecificStudents(ldapClient, uniqueStudents, logger);
        await logger(`[LDAP] Busca finalizada. Encontrados no diretório: ${matriculaMap.size} via matrícula, ${nameMap.size} via nome.`);

        const studentsWithCpf: Student[] = [];
        const notFoundStudentsData: Student[] = [];

        // 1. Cruzamento por Matrícula
        for (const student of uniqueStudents) {
            let cpf = matriculaMap.get(String(student.matricula).trim());
            if (cpf) {
                studentsWithCpf.push({ ...student, CPF: cpf });
            } else {
                notFoundStudentsData.push(student);
            }
        }
        await logger(`[LDAP] Cruzamento inicial: ${studentsWithCpf.length} encontrados por matrícula.`);

        // 2. Cruzamento por Nome (Swap/Troca de Matrícula)
        const toSwapStudents: any[] = [];
        const stillNotFound: Student[] = [];

        for (const student of notFoundStudentsData) {
            const normalizedName = normalizeString(student.nome);
            const ldapResult = nameMap.get(normalizedName);

            if (ldapResult) {
                const newMatriculaStr = String(student.matricula).trim();
                const oldMatriculaStr = String(ldapResult.attributes.matricula).trim();

                const swapInfo = {
                    'Matrícula': student.matricula,
                    'Nome': student.nome,
                    'Curso': student.curso,
                    'Tipo de Reserva': student.tipoReserva,
                    'CPF': ldapResult.attributes.uid,
                    'MatriculaAntiga': ldapResult.attributes.matricula,
                    'CursoAntigo': ldapResult.attributes.curso,
                    'Semestre': ldapResult.attributes.semestre || 'nan',
                    'Siape': ldapResult.attributes.siape || 'nan',
                };
                toSwapStudents.push(swapInfo);

                // Tenta atualizar a matrícula no LDAP se for diferente
                if (newMatriculaStr !== oldMatriculaStr) {
                    try {
                        const change = new ldap.Change({
                            operation: 'replace',
                            modification: { matricula: newMatriculaStr, curso: student.curso }
                        });
                        await modifyLdapEntry(ldapClient, ldapResult.dn, change);
                    } catch (e) {}
                }
                studentsWithCpf.push({ ...student, CPF: ldapResult.attributes.uid });
            } else {
                stillNotFound.push(student);
            }
        }
        
        if (toSwapStudents.length > 0) {
            await logger(`[LDAP] Swap: ${toSwapStudents.length} alunos localizados por nome.`);
        }

        const finalNotFoundStudents = stillNotFound.map(s => ({
            'Matrícula': s.matricula,
            'Nome': s.nome,
            'Curso': s.curso,
            'Tipo de Reserva': s.tipoReserva,
            'CPF': 'Não Encontrado',
        }));

        const postgresStudents = finalNotFoundStudents.map(s => ({
            'Matrícula': s['Matrícula'],
            'Nome': s['Nome'],
            'Curso': s['Curso'],
        }));

        const studentCpfMap = new Map(studentsWithCpf.map(s => [String(s.matricula).trim(), s.CPF!]));
        const finalStudents = data
            .filter((row: any) => studentCpfMap.has(String(row.matricula).trim()))
            .map((row: any) => {
                const nameParts = row.nome.split(' ');
                return {
                    username: studentCpfMap.get(String(row.matricula).trim()),
                    firstname: nameParts[0],
                    lastname: nameParts.slice(1).join(' '),
                    email: 'zz',
                    role1: 'student',
                    course1: row['Curso ShortName'],
                };
            });

        await logger(`[LDAP] Resultado: ${finalStudents.length} cadastrados, ${finalNotFoundStudents.length} não cadastrados.`);

        return {
            finalStudents,
            notFoundStudents: finalNotFoundStudents,
            toSwapStudents,
            postgresStudents,
        };

    } catch (e: any) {
        await logger(`[ERRO LDAP] Falha crítica no cruzamento de alunos: ${e.message}`);
        // RECOVERY: Retorna os alunos extraídos como não encontrados em vez de esvaziar os arquivos
        const recoveryNotFound = uniqueStudents.map(s => ({
            'Matrícula': s.matricula,
            'Nome': s.nome,
            'Curso': s.curso,
            'Tipo de Reserva': s.tipoReserva,
            'CPF': 'Erro no LDAP',
        }));
        return { finalStudents: [], notFoundStudents: recoveryNotFound, toSwapStudents: [], postgresStudents: [] };
    } finally {
        ldapClient.unbind();
    }
}
