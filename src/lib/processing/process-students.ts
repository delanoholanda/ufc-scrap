'use server';
import ldap, { Change, SearchEntry, SearchEntryObject } from 'ldapjs';

async function searchLdapByMatricula(client: ldap.Client, matricula: string): Promise<{ uid: string } | null> {
    return new Promise((resolve, reject) => {
        const opts = {
            filter: `(matricula=${matricula})`,
            scope: 'sub' as const,
            attributes: ['uid']
        };
        console.log(`[LDAP_SEARCH_MATRICULA] Buscando com filtro: ${opts.filter}`);
        client.search('ou=people,dc=quixada,dc=ufc,dc=br', opts, (err, res) => {
            if (err) {
                 console.error(`[LDAP_SEARCH_MATRICULA] Erro ao iniciar busca para ${matricula}:`, err);
                return reject(err);
            }
            
            let foundUser: { uid: string } | null = null;
            res.on('searchEntry', (entry: SearchEntry) => {
                const entryObject = entry.pojo;
                if (entryObject.attributes && entryObject.attributes.length > 0) {
                    const uidAttribute = entryObject.attributes.find(attr => attr.type === 'uid');
                    if (uidAttribute && uidAttribute.values.length > 0) {
                        const uid = uidAttribute.values[0];
                        foundUser = { uid: uid };
                        console.log(`[LDAP_SEARCH_MATRICULA] Entrada encontrada para ${matricula}: uid=${uid}`);
                    } else {
                         console.log(`[LDAP_SEARCH_MATRICULA] Entrada encontrada para ${matricula}, mas sem atributo 'uid'.`);
                    }
                }
            });
            res.on('error', (err) => {
                console.error(`[LDAP_SEARCH_MATRICULA] Erro durante a busca para ${matricula}:`, err);
                reject(err)
            });
            res.on('end', (result) => {
                 if (!foundUser) {
                    console.log(`[LDAP_SEARCH_MATRICULA] Busca para ${matricula} concluída. Nenhum usuário encontrado.`);
                }
                resolve(foundUser)
            });
        });
    });
}

async function searchLdapByFullName(client: ldap.Client, fullName: string): Promise<any | null> {
     return new Promise((resolve, reject) => {
        const opts = {
            filter: `(nomecompleto=${fullName})`,
            scope: 'sub' as const,
            attributes: ['uid', 'matricula', 'curso', 'semestre', 'siape', 'cargo']
        };
        console.log(`[LDAP_SEARCH_NAME] Buscando com filtro: ${opts.filter}`);
        client.search('ou=people,dc=quixada,dc=ufc,dc=br', opts, (err, res) => {
            if (err) {
                console.error(`[LDAP_SEARCH_NAME] Erro ao iniciar busca para "${fullName}":`, err);
                return reject(err);
            }

            let foundUser: any | null = null;
            res.on('searchEntry', (entry: SearchEntry) => {
                 const entryObject = entry.pojo;
                 const attributes: any = {};
                 entryObject.attributes?.forEach(attr => {
                     attributes[attr.type] = attr.values.length > 1 ? attr.values : attr.values[0];
                 });
                 foundUser = { dn: entry.dn, attributes: attributes };
                 console.log(`[LDAP_SEARCH_NAME] Entrada encontrada para "${fullName}": dn=${entry.dn}`);
            });
            res.on('error', (err) => {
                console.error(`[LDAP_SEARCH_NAME] Erro durante a busca para "${fullName}":`, err);
                reject(err)
            });
            res.on('end', () => {
                 if (!foundUser) {
                    console.log(`[LDAP_SEARCH_NAME] Busca para "${fullName}" concluída. Nenhum usuário encontrado.`);
                }
                resolve(foundUser)
            });
        });
    });
}

async function modifyLdapEntry(client: ldap.Client, dn: string, changes: Change | Change[]): Promise<boolean> {
     return new Promise((resolve, reject) => {
        console.log(`[LDAP_MODIFY] Tentando modificar DN: ${dn}`);
        client.modify(dn, changes, (err) => {
            if (err) {
                console.error(`[LDAP_MODIFY_ERROR] Falha ao modificar LDAP para DN ${dn}:`, err);
                return reject(err);
            }
            console.log(`[LDAP_MODIFY] Sucesso ao modificar DN: ${dn}`);
            resolve(true);
        });
    });
}

interface SwapInfo {
    'Matrícula': string;
    'Nome': string;
    'Curso': string;
    'Tipo de Reserva': string;
    'CPF': string;
    'MatriculaAntiga': string;
    'CursoAntigo': string;
    'Semestre': string;
    'Siape': string;
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

export async function processStudents(data: any[]) {
    console.log("[PROCESS_STUDENTS] Iniciando processamento de alunos...");
    // Unique students by 'Matrícula'
    const uniqueStudents: Student[] = Array.from(new Map(data.map(item => [item['matricula'], item])).values())
      .filter((s: Student) => s.matricula && s.matricula !== 'SEM ALUNO');
    console.log(`[PROCESS_STUDENTS] Encontrados ${uniqueStudents.length} alunos únicos para processar.`);
      
    const ldapClient = ldap.createClient({ url: `ldap://${process.env.LDAP_SERVER}:${process.env.LDAP_PORT}` });
    
    try {
        await new Promise<void>((resolve, reject) => {
            ldapClient.bind(process.env.LDAP_USERNAME!, process.env.LDAP_PASSWORD!, (err) => {
                if (err) {
                    console.error("[LDAP_BIND_ERROR] Falha no bind com o servidor LDAP:", err);
                    reject(err);
                }
                else {
                    console.log("[LDAP_BIND] Bind com servidor LDAP bem-sucedido.");
                    resolve();
                }
            });
        });

        const studentsWithCpf: Student[] = await Promise.all(uniqueStudents.map(async (student) => {
            let cpf = 'Não Encontrado';
            if (student.situacao === 'MATRICULADO') {
                try {
                    const ldapResult = await searchLdapByMatricula(ldapClient, student.matricula);
                    if (ldapResult) {
                        cpf = ldapResult.uid;
                    }
                } catch (error) {
                    console.error(`[PROCESS_STUDENTS_ERROR] Erro na busca LDAP por matrícula ${student.matricula}:`, error);
                }
            } else {
                 console.log(`[PROCESS_STUDENTS] Aluno ${student.nome} (${student.matricula}) com situação "${student.situacao}", pulando busca LDAP.`);
            }
            return { ...student, CPF: cpf };
        }));

        const notFoundStudentsData = studentsWithCpf.filter(s => s.CPF === 'Não Encontrado');
        let foundStudentsData = studentsWithCpf.filter(s => s.CPF !== 'Não Encontrado');
        console.log(`[PROCESS_STUDENTS] Busca inicial por matrícula: ${foundStudentsData.length} encontrados, ${notFoundStudentsData.length} não encontrados.`);

        // Handle swaps for not-found students
        console.log(`[PROCESS_STUDENTS] Iniciando busca por nome completo para ${notFoundStudentsData.length} alunos não encontrados...`);
        const toSwapStudents: SwapInfo[] = [];
        for (const student of notFoundStudentsData) {
             try {
                const ldapResult = await searchLdapByFullName(ldapClient, student.nome);
                if (ldapResult && ldapResult.attributes) {
                    const newMatricula = parseInt(student.matricula, 10);
                    const oldMatricula = parseInt(ldapResult.attributes.matricula, 10);

                    console.log(`[SWAP_INFO] Encontrado pelo nome: ${student.nome}. Matrícula nova: ${newMatricula}, antiga: ${oldMatricula}`);

                    const swapInfo: SwapInfo = {
                        'Matrícula': student.matricula,
                        'Nome': student.nome,
                        'Curso': student.curso,
                        'Tipo de Reserva': student['tipoReserva'],
                        'CPF': ldapResult.attributes.uid,
                        'MatriculaAntiga': ldapResult.attributes.matricula,
                        'CursoAntigo': ldapResult.attributes.curso,
                        'Semestre': ldapResult.attributes.semestre || 'nan',
                        'Siape': ldapResult.attributes.siape || 'nan',
                    };
                    toSwapStudents.push(swapInfo);

                    if (newMatricula > oldMatricula) {
                        console.log(`[SWAP_ACTION] Matrícula nova (${newMatricula}) é maior. Atualizando LDAP...`);
                         const change = new ldap.Change({
                            operation: 'replace',
                            modification: {
                                matricula: newMatricula.toString(),
                                curso: student.curso
                            }
                        });
                        await modifyLdapEntry(ldapClient, ldapResult.dn, change);
                    }
                     // Add the swapped student back to the found list
                    foundStudentsData.push({ ...student, CPF: ldapResult.attributes.uid });
                }
            } catch (error) {
                 console.error(`[PROCESS_STUDENTS_ERROR] Erro na busca LDAP por nome ${student.nome}:`, error);
            }
        }
        console.log(`[PROCESS_STUDENTS] Busca por nome completo resultou em ${toSwapStudents.length} trocas.`);
        
        const finalNotFoundStudents = notFoundStudentsData
            .filter(s => !toSwapStudents.some(ts => ts['Matrícula'] === s.matricula))
            .map(s => ({
                'Matrícula': s.matricula,
                'Nome': s.nome,
                'Curso': s.curso,
                'Tipo de Reserva': s['tipoReserva'],
                'CPF': s.CPF,
            }))
            .sort((a, b) => a['Tipo de Reserva'].localeCompare(b['Tipo de Reserva']));

        // Generate Postgres students list from the ones that were truly not found anywhere
        const postgresStudents = finalNotFoundStudents.map(s => ({
            'Matrícula': s['Matrícula'],
            'Nome': s['Nome'],
            'Curso': s['Curso'],
        }));
        console.log(`[PROCESS_STUDENTS] Alunos que precisam de cadastro no PG: ${postgresStudents.length}`);
        console.log(`[PROCESS_STUDENTS] Alunos finalmente não encontrados: ${finalNotFoundStudents.length}`);

        // Generate final students file data
        const studentCpfMap = new Map(foundStudentsData.map(s => [s.matricula, s.CPF]));
        const finalStudentsData = data
            .filter((row: any) => studentCpfMap.has(row.matricula))
            .map((row: any) => {
                const nameParts = row.nome.split(' ');
                return {
                    username: studentCpfMap.get(row.matricula),
                    firstname: nameParts[0],
                    lastname: nameParts.slice(1).join(' '),
                    email: 'zz',
                    role1: 'student',
                    course1: row['Curso ShortName'],
                };
            });
            
        const uniqueFinalStudents = Array.from(new Map(finalStudentsData.map((item: any) => [item.username + item.course1, item])).values());
        console.log(`[PROCESS_STUDENTS] Total de matrículas de alunos encontradas e prontas para o arquivo final: ${uniqueFinalStudents.length}`);

        console.log("[PROCESS_STUDENTS] Processamento de alunos concluído.");
        return {
            finalStudents: uniqueFinalStudents,
            notFoundStudents: finalNotFoundStudents,
            toSwapStudents,
            postgresStudents,
        };

    } catch (e) {
        console.error("[PROCESS_STUDENTS_FATAL] Um erro fatal ocorreu durante o processamento de alunos:", e);
        // Retorna arrays vazios para não quebrar o resto do processo
        return {
            finalStudents: [],
            notFoundStudents: uniqueStudents.map(s => ({ ...s, 'CPF': 'ERRO NO PROCESSAMENTO' })),
            toSwapStudents: [],
postgresStudents: [],
        };
    } finally {
        ldapClient.unbind((err) => {
            if (err) console.error("[LDAP_UNBIND_ERROR] Erro ao desvincular do LDAP:", err);
            else console.log("[LDAP_UNBIND] Desvinculado do servidor LDAP.");
        });
    }
}
