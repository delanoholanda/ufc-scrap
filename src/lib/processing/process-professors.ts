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

async function fetchAllProfessors(client: ldap.Client): Promise<Map<string, any>> {
    return new Promise((resolve, reject) => {
        const professorsMap = new Map<string, any>();
        const opts = {
            filter: '(objectClass=servidorUFCQuixada)',
            scope: 'sub' as const,
            attributes: ['uid', 'nomecompleto', 'siape'],
            paged: {
                pageSize: 200,
                pagePause: false
            },
            sizeLimit: 0
        };

        client.search('ou=people,dc=quixada,dc=ufc,dc=br', opts, (err, res) => {
            if (err) return reject(err);

            res.on('searchEntry', (entry: SearchEntry) => {
                const pojo = entry.pojo;
                const uid = pojo.attributes?.find(a => a.type === 'uid')?.values[0];
                const nome = pojo.attributes?.find(a => a.type === 'nomecompleto')?.values[0];
                const siape = pojo.attributes?.find(a => a.type === 'siape')?.values[0];
                if (uid && nome) {
                    professorsMap.set(normalizeString(nome), { uid: String(uid).trim(), siape: String(siape || '') });
                }
            });
            res.on('error', (err) => {
                if (err.name === 'SizeLimitExceededError') {
                    resolve(professorsMap);
                } else {
                    reject(err);
                }
            });
            res.on('end', () => resolve(professorsMap));
        });
    });
}

export async function processProfessors(data: any[], logger: (m: string) => Promise<void>) {
    await logger("[LDAP] Cruzando dados de professores com diretório...");
    
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

        const ldapProfessorsMap = await fetchAllProfessors(ldapClient);
        await logger(`[LDAP] ${ldapProfessorsMap.size} registros de servidores carregados.`);

        const expandedProfessorData: any[] = [];
        data.forEach(row => {
            const teachers = row.docente.split(/ e |, /).filter(Boolean);
            teachers.forEach((teacher: string) => {
                expandedProfessorData.push({ ...row, docente_individual: teacher.trim() });
            });
        });

        const uniqueProfessorsPerCourse = Array.from(new Map(expandedProfessorData.map(item =>
            [`${item.docente_individual}-${item['Curso ShortName']}`, item]
        )).values());

        const professorsWithCpf = uniqueProfessorsPerCourse.map(prof => {
            const cleanedName = prof.docente_individual.replace(/\s*\(\d+h\)/, '').trim();
            const normalizedScrapedName = normalizeString(cleanedName);
            let cpf = 'Não Encontrado';
            let siape = '';
            
            if (!cleanedName.includes("A DEFINIR")) {
                const found = ldapProfessorsMap.get(normalizedScrapedName);
                if (found) {
                    cpf = found.uid;
                    siape = found.siape;
                }
            }
            return { ...prof, CPF: cpf, Siape: siape, docente_individual: cleanedName };
        });

        const foundProfessors = professorsWithCpf.filter(p => p.CPF !== 'Não Encontrado');
        const notFoundProfessors = professorsWithCpf
            .filter(p => p.CPF === 'Não Encontrado')
            .map(p => ({
                nome: p.docente_individual,
                cpf: 'Não Encontrado',
                course1: p['Curso ShortName'],
            }));
        
        const finalProfessors = foundProfessors.map(p => {
            const nameParts = p.docente_individual.split(' ');
            return {
                username: p.CPF,
                firstname: nameParts[0],
                lastname: nameParts.slice(1).join(' '),
                email: 'zz',
                role1: 'editingteacher',
                course1: p['Curso ShortName']
            };
        });
        
        const uniqueFinalProfessors = Array.from(new Map(finalProfessors.map((item: any) => [item.username + item.course1, item])).values());
        await logger(`[LDAP] Professores identificados: ${uniqueFinalProfessors.length}`);

        return { finalProfessors: uniqueFinalProfessors, notFoundProfessors };

    } catch(e: any) {
        await logger(`[ERRO LDAP] Falha no processamento de professores: ${e.message}`);
        return { finalProfessors: [], notFoundProfessors: [] };
    } finally {
        ldapClient.unbind();
    }
}
