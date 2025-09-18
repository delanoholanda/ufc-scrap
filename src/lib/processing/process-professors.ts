
import ldap, { SearchEntry } from 'ldapjs';

async function searchLdapByFullName(client: ldap.Client, fullName: string): Promise<{ uid: string } | null> {
    if (!fullName || fullName.trim() === '') {
        console.log(`[PROFESSOR_LOOKUP_LDAP] Nome vazio fornecido, pulando busca.`);
        return null;
    }
    return new Promise((resolve, reject) => {
        const cleanedName = fullName.replace(/\s*\(\d+h\)/, '').trim();
        if (cleanedName.includes("A DEFINIR")) {
            console.log(`[PROFESSOR_LOOKUP_LDAP] Professor "A DEFINIR", pulando busca.`);
            return resolve(null);
        }

        const opts = {
            filter: `(nomecompleto=${cleanedName})`,
            scope: 'sub' as const,
            attributes: ['uid']
        };
        console.log(`[PROFESSOR_LOOKUP_LDAP] Buscando com filtro: ${opts.filter}`);
        
        client.search('ou=people,dc=quixada,dc=ufc,dc=br', opts, (err, res) => {
            if (err) {
                console.error(`[PROFESSOR_LOOKUP_LDAP] Erro ao iniciar busca para "${cleanedName}":`, err);
                return reject(err);
            }

            let foundUser: { uid: string } | null = null;
            let entryCount = 0;

            res.on('searchEntry', (entry: SearchEntry) => {
                entryCount++;
                const entryObject = entry.pojo;
                if (entryObject.attributes && entryObject.attributes.length > 0) {
                    const uidAttribute = entryObject.attributes.find(attr => attr.type === 'uid');
                    if (uidAttribute && uidAttribute.values.length > 0) {
                        foundUser = { uid: uidAttribute.values[0] };
                        console.log(`[PROFESSOR_LOOKUP_LDAP] Entrada encontrada para "${cleanedName}": uid=${foundUser.uid}`);
                    }
                }
            });
            res.on('error', (ldapErr) => {
                 console.error(`[PROFESSOR_LOOKUP_LDAP] Erro na busca para "${cleanedName}":`, ldapErr);
                reject(ldapErr);
            });
            res.on('end', () => {
                 if (!foundUser) {
                    console.log(`[PROFESSOR_LOOKUP_LDAP] Busca para "${cleanedName}" concluída. Nenhum usuário único encontrado.`);
                 }
                 // If more than one user is found, it's an ambiguous result.
                 if (entryCount > 1) {
                    console.log(`[PROFESSOR_LOOKUP_LDAP] Múltiplos resultados (${entryCount}) encontrados para "${cleanedName}". Retornando nulo para evitar inconsistências.`);
                    resolve(null);
                 } else {
                    resolve(foundUser);
                 }
            });
        });
    });
}


export async function processProfessors(data: any[]) {
    console.log("[PROCESS_PROFESSORS] Iniciando processamento de professores...");
    
    const ldapClient = ldap.createClient({ url: `ldap://${process.env.LDAP_SERVER}:${process.env.LDAP_PORT}` });

    try {
        await new Promise<void>((resolve, reject) => {
            ldapClient.bind(process.env.LDAP_USERNAME!, process.env.LDAP_PASSWORD!, (err) => {
                if (err) {
                    console.error("[LDAP_BIND_ERROR_PROFESSOR] Falha no bind com o servidor LDAP:", err);
                    return reject(err);
                }
                console.log("[LDAP_BIND_PROFESSOR] Bind com servidor LDAP bem-sucedido.");
                resolve();
            });
        });

        // 1. Expandir entradas de múltiplos professores
        const expandedProfessorData: any[] = [];
        data.forEach(row => {
            const teachers = row.docente.split(/ e |, /).filter(Boolean);
            teachers.forEach((teacher: string) => {
                expandedProfessorData.push({ ...row, docente_individual: teacher.trim() });
            });
        });

        // 2. Obter professores únicos por disciplina
        const uniqueProfessorsPerCourse = Array.from(new Map(expandedProfessorData.map(item =>
            [`${item.docente_individual}-${item['Curso ShortName']}`, item]
        )).values());
        console.log(`[PROCESS_PROFESSORS] Encontrados ${uniqueProfessorsPerCourse.length} registros únicos de professor/disciplina para processar.`);

        // 3. Enriquecer com CPF via LDAP (sequencialmente)
        const professorsWithCpf = [];
        for (const prof of uniqueProfessorsPerCourse) {
            let cpf: string | null = null;
            try {
                const ldapResult = await searchLdapByFullName(ldapClient, prof.docente_individual);
                if (ldapResult) {
                    cpf = ldapResult.uid;
                }
            } catch (error) {
                console.error(`[PROCESS_PROFESSORS_ERROR] Erro na busca LDAP por professor ${prof.docente_individual}:`, error);
                // Em caso de erro de conexão, pare para não sobrecarregar
                throw error;
            }
            const cleanedName = prof.docente_individual.replace(/\s*\(\d+h\)/, '').trim();
            professorsWithCpf.push({ ...prof, CPF: cpf || 'Não Encontrado', docente_individual: cleanedName });
        }


        // 4. Separar encontrados e não encontrados
        const foundProfessors = professorsWithCpf.filter(p => p.CPF !== 'Não Encontrado');
        const notFoundProfessors = professorsWithCpf
            .filter(p => p.CPF === 'Não Encontrado')
            .map(p => ({
                nome: p.docente_individual,
                cpf: 'Não Encontrado',
                course1: p['Curso ShortName'],
            }));
        
        console.log(`[PROCESS_PROFESSORS] Professores encontrados com CPF via LDAP: ${foundProfessors.length}`);
        console.log(`[PROCESS_PROFESSORS] Professores não encontrados: ${notFoundProfessors.length}`);
        
        // 5. Formatar arquivo final de professores
        const finalProfessors = foundProfessors.map(p => {
            const nameParts = p.docente_individual.split(' ');
            return {
                username: p.CPF,
                firstname: nameParts[0],
                lastname: nameParts.slice(1).join(' '),
                email: 'zz',
                role1: 'editingteacher',
                course1: p['Curso ShortName'],
            };
        });
        
        const uniqueFinalProfessors = Array.from(new Map(finalProfessors.map((item: any) => [item.username + item.course1, item])).values());
        console.log(`[PROCESS_PROFESSORS] Total de matrículas de professores encontradas e prontas para o arquivo final: ${uniqueFinalProfessors.length}`);

        console.log("[PROCESS_PROFESSORS] Processamento de professores concluído.");
        return {
            finalProfessors: uniqueFinalProfessors,
            notFoundProfessors,
        };

    } catch(e) {
        console.error("[PROCESS_PROFESSORS_FATAL] Um erro fatal ocorreu durante o processamento de professores:", e);
        return { finalProfessors: [], notFoundProfessors: [] };
    } finally {
        ldapClient.unbind((err) => {
            if (err) console.error("[LDAP_UNBIND_ERROR_PROFESSOR] Erro ao desvincular do LDAP:", err);
            else console.log("[LDAP_UNBIND_PROFESSOR] Desvinculado do servidor LDAP.");
        });
    }
}
