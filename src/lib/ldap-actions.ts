

'use server';

import ldap, { Change, SearchEntry, Filter, AndFilter, EqualityFilter, SubstringFilter } from 'ldapjs';
import type { LdapUser } from './types';
import crypto from 'crypto';


function getLdapClient(): ldap.Client {
  const requiredEnvVars = ['LDAP_SERVER', 'LDAP_PORT', 'LDAP_USERNAME', 'LDAP_PASSWORD'];
  for (const v of requiredEnvVars) {
    if (!process.env[v]) {
      throw new Error(`Variável de ambiente LDAP ${v} não definida.`);
    }
  }

  const ldapUrl = `ldap://${process.env.LDAP_SERVER}:${process.env.LDAP_PORT}`;
  return ldap.createClient({
    url: ldapUrl,
    connectTimeout: 5000,
  });
}

// Helper para converter entrada do LDAP para nosso tipo
function entryToLdapUser(entry: SearchEntry): LdapUser {
    const user = entry.pojo;
    return {
        dn: entry.dn.toString(),
        uid: user.attributes?.find(a => a.type === 'uid')?.values[0] || '',
        cn: user.attributes?.find(a => a.type === 'cn')?.values[0] || '',
        sn: user.attributes?.find(a => a.type === 'sn')?.values[0] || '',
        nomecompleto: user.attributes?.find(a => a.type === 'nomecompleto')?.values[0] || '',
        mail: user.attributes?.find(a => a.type === 'mail')?.values[0] || '',
        cargo: user.attributes?.find(a => a.type === 'cargo')?.values[0],
        status: user.attributes?.find(a => a.type === 'status')?.values[0],
        matricula: user.attributes?.find(a => a.type === 'matricula')?.values[0],
        curso: user.attributes?.find(a => a.type === 'curso')?.values[0],
        siape: user.attributes?.find(a => a.type === 'siape')?.values[0],
    };
}


export async function fetchLdapUsers({
  page,
  perPage,
  searchField,
  searchValue,
  status,
  baseFilter,
}: {
  page: number;
  perPage: number;
  searchField: string;
  searchValue?: string;
  status?: 'ativo' | 'inativo';
  baseFilter: string;
}): Promise<{ success: boolean; users?: LdapUser[]; total?: number; error?: string }> {
  let client: ldap.Client | null = null;
  try {
    client = getLdapClient();

    await new Promise<void>((resolve, reject) => {
      client!.bind(process.env.LDAP_USERNAME!, process.env.LDAP_PASSWORD!, (err) => {
        if (err) {
          console.error('[LDAP_BIND_ERROR]', err);
          return reject(new Error(`Falha no bind LDAP: ${err.message}`));
        }
        resolve();
      });
    });
    
    const filterParts: Filter[] = [ldap.parseFilter(baseFilter)];

    if (searchValue && searchField) {
        let valueFilter: Filter;
        valueFilter = new EqualityFilter({
            attribute: searchField,
            value: searchValue,
        });
        filterParts.push(valueFilter);
    }
    
    if (status) {
        const statusFilter = new EqualityFilter({
            attribute: 'status',
            value: status,
        });
        filterParts.push(statusFilter);
    }

    const finalFilter = new AndFilter({ filters: filterParts });
    
    const baseDN = 'ou=people,dc=quixada,dc=ufc,dc=br';

    // Etapa 1: Obter todos os DNs que correspondem ao filtro
    let allEntries = await new Promise<SearchEntry[]>((resolve, reject) => {
        const entries: SearchEntry[] = [];
        const searchOptions = {
          filter: finalFilter,
          scope: 'sub' as const,
          attributes: ['uid', 'cn', 'sn', 'nomecompleto', 'mail', 'cargo', 'status', 'matricula', 'curso', 'siape'],
          sizeLimit: 0, // No limit
          paged: true,
        };

        client!.search(baseDN, searchOptions, (err, res) => {
            if (err) return reject(err);
            res.on('searchEntry', (entry) => entries.push(entry));
            res.on('error', (err) => {
                if (err.name === 'SizeLimitExceededError') {
                    resolve(entries);
                } else {
                    reject(err);
                }
            });
            res.on('end', () => resolve(entries));
        });
    });
    
    // Ordenar os resultados em memória pela aplicação
    allEntries.sort((a, b) => {
        const nameA = a.pojo.attributes?.find(attr => attr.type === 'nomecompleto')?.values[0] || '';
        const nameB = b.pojo.attributes?.find(attr => attr.type === 'nomecompleto')?.values[0] || '';
        return nameA.localeCompare(nameB);
    });

    const total = allEntries.length;
    
    // Etapa 2: Obter a "fatia" para a página atual
    const offset = (page - 1) * perPage;
    const entriesForPage = allEntries.slice(offset, offset + perPage);

    if (entriesForPage.length === 0) {
        return { success: true, users: [], total: total };
    }

    // Etapa 3: Mapear as entradas para o formato LdapUser
    const users = entriesForPage.map(entry => entryToLdapUser(entry));
    
    return { success: true, users, total };

  } catch (e) {
    const error = e instanceof Error ? e.message : 'Falha ao buscar usuários LDAP.';
    console.error('[LDAP_FETCH_ERROR]', e);
    if ((e as any).name === 'SizeLimitExceededError') {
        return { success: false, error: 'O número de resultados excedeu o limite do servidor LDAP.' };
    }
    return { success: false, error };
  } finally {
    if (client) {
      client.unbind();
    }
  }
}

export async function findLdapUserByDn(dn: string): Promise<{ success: boolean; user?: LdapUser; error?: string }> {
   let client: ldap.Client | null = null;
    try {
        client = getLdapClient();
        await new Promise<void>((resolve, reject) => {
            client!.bind(process.env.LDAP_USERNAME!, process.env.LDAP_PASSWORD!, (err) => {
                if (err) return reject(err);
                resolve();
            });
        });

        const user = await new Promise<LdapUser>((resolve, reject) => {
             let userFound: LdapUser | null = null;
             client!.search(dn, { scope: 'base', attributes: ['uid', 'cn', 'sn', 'nomecompleto', 'mail', 'cargo', 'status', 'matricula', 'curso', 'siape'] }, (err, res) => {
                if (err) return reject(err);
                res.on('searchEntry', (entry) => {
                    userFound = entryToLdapUser(entry);
                });
                res.on('error', reject);
                res.on('end', (result) => {
                    if (userFound) {
                        resolve(userFound);
                    } else if (result?.status === 0) {
                        reject(new Error("Usuário não encontrado com o DN fornecido."));
                    } else if (result) {
                        reject(new Error(`Busca LDAP falhou com status ${result.status}`));
                    } else {
                        reject(new Error("Busca LDAP não retornou um resultado final."));
                    }
                });
             });
        });

        return { success: true, user };

    } catch (e) {
        const error = e instanceof Error ? e.message : 'Falha ao buscar usuário LDAP.';
        return { success: false, error };
    } finally {
        if (client) {
            client.unbind();
        }
    }
}


export async function updateLdapUser(dn: string, attributes: Partial<LdapUser>): Promise<{ success: boolean; error?: string }> {
    let client: ldap.Client | null = null;
    try {
        client = getLdapClient();
        await new Promise<void>((resolve, reject) => {
            client!.bind(process.env.LDAP_USERNAME!, process.env.LDAP_PASSWORD!, (err) => {
                if (err) return reject(err);
                resolve();
            });
        });

        const changes: Change[] = [];
        
        const { user: existingUser } = await findLdapUserByDn(dn);
        if (!existingUser) {
            return { success: false, error: 'Usuário não encontrado para atualização.' };
        }
        
        if (attributes.nomecompleto && attributes.nomecompleto !== existingUser.nomecompleto) {
            const nameParts = attributes.nomecompleto.split(' ');
            const newCn = nameParts[0];
            const newSn = nameParts.slice(1).join(' ') || newCn; // Ensure sn is not empty

            changes.push(new Change({
                operation: 'replace',
                modification: new ldap.Attribute({ type: 'nomecompleto', values: [attributes.nomecompleto] })
            }));
            changes.push(new Change({
                operation: 'replace',
                modification: new ldap.Attribute({ type: 'cn', values: [newCn] })
            }));
             changes.push(new Change({
                operation: 'replace',
                modification: new ldap.Attribute({ type: 'sn', values: [newSn] })
            }));
        }

        const attributeMap: { [key in keyof Omit<LdapUser, 'nomecompleto' | 'userPassword'>]?: string } = {
            mail: 'mail',
            status: 'status',
            matricula: 'matricula',
            cargo: 'cargo'
        };

        for (const key in attributes) {
            const attrKey = key as keyof LdapUser;
            // Skip handled attributes
            if (attrKey === 'nomecompleto' || attrKey === 'userPassword') continue;

            if (attrKey in attributeMap) {
                const ldapAttr = attributeMap[attrKey as keyof typeof attributeMap];
                if (ldapAttr) {
                    const value = attributes[attrKey];
                    const existingValue = existingUser[attrKey];

                    if (value !== undefined && value !== null && String(value).trim() !== '' && String(value) !== String(existingValue)) {
                         changes.push(new Change({
                            operation: (existingValue !== undefined && existingValue !== null && String(existingValue).trim() !== '') ? 'replace' : 'add',
                            modification: new ldap.Attribute({ type: ldapAttr, values: [String(value)] })
                        }));
                    } else if ((value === undefined || value === null || String(value).trim() === '') && (existingValue !== undefined && existingValue !== null && String(existingValue).trim() !== '')) {
                        changes.push(new Change({
                            operation: 'delete',
                            modification: new ldap.Attribute({ type: ldapAttr })
                        }));
                    }
                }
            }
        }
        
        if (attributes.userPassword) {
            const md5 = crypto.createHash('md5').update(attributes.userPassword).digest('base64');
            const ldapPassword = `{MD5}${md5}`;
            changes.push(new Change({
                operation: 'replace',
                modification: new ldap.Attribute({ type: 'userPassword', values: [ldapPassword] })
            }));
        }
        
        if (changes.length === 0) {
            return { success: true }; // No changes needed
        }

        await new Promise<void>((resolve, reject) => {
            client!.modify(dn, changes, (err) => {
                if (err) {
                    console.error('[LDAP_MODIFY_ERROR]', err);
                    return reject(err);
                }
                resolve();
            });
        });

        return { success: true };

    } catch (e) {
        const error = e instanceof Error ? e.message : 'Falha ao atualizar usuário LDAP.';
        return { success: false, error };
    } finally {
        if (client) {
            client.unbind();
        }
    }
}

export async function updateLdapUserStatus(dn: string, status: 'ativo' | 'inativo'): Promise<{ success: boolean; error?: string }> {
    let client: ldap.Client | null = null;
    try {
        client = getLdapClient();
        await new Promise<void>((resolve, reject) => {
            client!.bind(process.env.LDAP_USERNAME!, process.env.LDAP_PASSWORD!, (err) => {
                if (err) return reject(err);
                resolve();
            });
        });

        const change = new Change({
            operation: 'replace',
            modification: new ldap.Attribute({ type: 'status', values: [status] })
        });

        await new Promise<void>((resolve, reject) => {
            client!.modify(dn, change, (err) => {
                if (err) {
                    console.error('[LDAP_STATUS_UPDATE_ERROR]', err);
                    return reject(err);
                }
                resolve();
            });
        });

        return { success: true };
    } catch (e) {
        const error = e instanceof Error ? e.message : 'Falha ao atualizar o status do usuário LDAP.';
        return { success: false, error };
    } finally {
        if (client) {
            client.unbind();
        }
    }
}
