
'use server';
import ldap, { SearchEntry } from 'ldapjs';

/**
 * Normaliza strings para comparação
 */
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
 * Escapa caracteres especiais para filtros LDAP
 */
function escapeLdapFilter(str: string): string {
    return str.replace(/\\/g, '\\5c')
              .replace(/\*/g, '\\2a')
              .replace(/\(/g, '\\28')
              .replace(/\)/g, '\\29')
              .replace(/\0/g, '\\00');
}

/**
 * Busca alunos específicos no diretório LDAP
 */
async function fetchSpecificStudents(client: ldap.Client, uniqueStudents: any[]): Promise<{ 
    matriculaMap: Map<string, string>, 
    nameMap: Map<string, any> 
}> {
    const matriculaMap = new Map<string, string>();
    const nameMap = new Map<string, any>();

    const matriculas = uniqueStudents.map(s => String(s.matricula).trim()).filter(m => m && m !== 'SEM ALUNO');
    const nomes = uniqueStudents.map(s => s.nome.trim()).filter(n => n);

    if (matriculas.length === 0) return { matriculaMap, nameMap };

    const batchSize = 30;
    for (let i = 0; i < matriculas.length; i += batchSize) {
        const batchMatriculas = matriculas.slice(i, i + batchSize);
        const batchNomes = nomes.slice(i, i + batchSize);

        const matriculaFilter = batchMatriculas.map(m => `(matricula=${escapeLdapFilter(m)})`).join('');
        const nameFilter = batchNomes.map(n => `(nomecompleto=${escapeLdapFilter(n)})`).join('');
        
        const finalFilter = `(&(objectClass=alunoUFCQuixada)(|${matriculaFilter}${nameFilter}))`;

        await new Promise<void>((resolve) => {
            client.search('ou=people,dc=quixada,dc=ufc,dc=br', { filter: finalFilter, scope: 'sub' as const }, (err, res) => {
                if (err) { resolve(); return; }
                res.on('searchEntry', (entry: SearchEntry) => {
                    const attrs: any = {};
                    entry.pojo.attributes.forEach(attr => { attrs[attr.type] = attr.values[0]; });
                    
                    if (attrs.uid && attrs.matricula) {
                        matriculaMap.set(String(attrs.matricula).trim(), String(attrs.uid).trim());
                    }
                    if (attrs.uid && attrs.nomecompleto) {
                        nameMap.set(normalizeString(attrs.nomecompleto), { dn: entry.dn.toString(), attributes: attrs });
                    }
                });
                res.on('error', () => resolve());
                res.on('end', () => resolve());
            });
        });
    }
    return { matriculaMap, nameMap };
}

/**
 * Processa a lista de alunos extraídos, cruzando com o LDAP.
 */
export async function processStudents(data: any[], logger: (m: string) => Promise<void>) {
    await logger("[LDAP] Cruzando dados de alunos com diretório...");
    
    const uniqueStudents = Array.from(new Map(data.map(item => [String(item.matricula).trim(), item])).values())
      .filter((s: any) => s.matricula && s.matricula !== 'SEM ALUNO');
    
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

        const { matriculaMap, nameMap } = await fetchSpecificStudents(ldapClient, uniqueStudents);

        const studentsWithCpf: any[] = [];
        const notFoundStudents: any[] = [];
        const toSwapStudents: any[] = [];
        const postgresStudents: any[] = [];

        for (const student of uniqueStudents) {
            const m = String(student.matricula).trim();
            const cpfFoundByMatricula = matriculaMap.get(m);
            const ldapEntryByName = nameMap.get(normalizeString(student.nome));

            if (cpfFoundByMatricula) {
                // Caso 1: Encontrado por matrícula
                studentsWithCpf.push({ ...student, CPF: cpfFoundByMatricula });
            } else if (ldapEntryByName) {
                // Caso 2: Encontrado por nome (Troca de matrícula)
                const swapInfo = {
                    matricula: student.matricula,
                    nome: student.nome,
                    curso: student.curso,
                    tipoReserva: student.tipoReserva || '',
                    cpf: ldapEntryByName.attributes.uid,
                    matriculaAntiga: ldapEntryByName.attributes.matricula,
                    cursoAntigo: ldapEntryByName.attributes.curso
                };
                toSwapStudents.push(swapInfo);
                studentsWithCpf.push({ ...student, CPF: ldapEntryByName.attributes.uid });
            } else {
                // Caso 3: Aluno novo
                notFoundStudents.push({ 
                    matricula: student.matricula, 
                    nome: student.nome, 
                    curso: student.curso, 
                    tipoReserva: student.tipoReserva || '', 
                    cpf: 'Não Encontrado' 
                });
                
                postgresStudents.push({ 
                    matricula: student.matricula, 
                    nome: student.nome, 
                    curso: student.curso 
                });
            }
        }

        const studentCpfMap = new Map(studentsWithCpf.map(s => [String(s.matricula).trim(), s.CPF]));
        const finalStudents = data.filter(r => studentCpfMap.has(String(r.matricula).trim())).map(r => {
            const parts = r.nome.split(' ');
            return {
                username: studentCpfMap.get(String(r.matricula).trim()),
                firstname: parts[0],
                lastname: parts.slice(1).join(' '),
                email: 'zz',
                role1: 'student',
                course1: r['Curso ShortName']
            };
        });

        await logger(`[LDAP] Sincronização: ${finalStudents.length} vinculados, ${toSwapStudents.length} trocas, ${postgresStudents.length} novos.`);

        return { finalStudents, notFoundStudents, toSwapStudents, postgresStudents };
    } finally {
        ldapClient.unbind();
    }
}
