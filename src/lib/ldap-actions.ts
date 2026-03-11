
'use server';

import ldap, { Change } from 'ldapjs';
import type { LdapUser } from './types';
import { checkAuth } from './auth-actions';

function getLdapClient(): ldap.Client {
  const ldapUrl = `ldap://${process.env.LDAP_SERVER}:${process.env.LDAP_PORT}`;
  return ldap.createClient({ 
    url: ldapUrl, 
    connectTimeout: 15000,
    timeout: 15000 
  });
}

function normalizeString(str: string): string {
    if (!str) return '';
    return str.toUpperCase().trim();
}

/**
 * Escapa caracteres especiais para filtros LDAP
 */
function escapeLdapFilter(str: string): string {
  if (!str) return '';
  return str.replace(/\\/g, '\\5c')
            .replace(/\*/g, '\\2a')
            .replace(/\(/g, '\\28')
            .replace(/\)/g, '\\29')
            .replace(/\0/g, '\\00');
}

export async function fetchLdapUsers(params: {
  page: number;
  perPage: number;
  searchField: string;
  searchValue: string;
  status?: 'ativo' | 'inativo';
  baseFilter: string;
}) {
  if (!(await checkAuth())) return { success: false, error: "Não autenticado." };

  const client = getLdapClient();
  const { page, perPage, searchField, searchValue, status, baseFilter } = params;

  try {
    await new Promise<void>((resolve, reject) => {
      client.bind(process.env.LDAP_USERNAME!, process.env.LDAP_PASSWORD!, (err) => {
        if (err) reject(err); else resolve();
      });
    });

    let filter = baseFilter;
    if (searchValue) {
      const term = searchValue.trim();
      
      if (['matricula', 'uid', 'siape'].includes(searchField)) {
        // Busca exata para IDs numéricos/documentos
        filter = `(&${filter}(${searchField}=${escapeLdapFilter(term)}))`;
      } else if (searchField === 'mail') {
        // Busca por e-mail
        filter = `(&${filter}(mail=*${escapeLdapFilter(term)}*))`;
      } else if (searchField === 'nomecompleto') {
        // Busca "Smart" Multitermo para nomes:
        // Converte para uppercase e divide o nome em partes para busca independente
        const upperTerm = term.toUpperCase();
        const cleanTerm = upperTerm.replace(/-/g, ' ').replace(/\s+/g, ' ');
        const parts = cleanTerm.split(/\s+/).filter(p => p.length > 0);
        
        if (parts.length > 0) {
          // Cada parte deve estar contida no campo nomecompleto
          const subFilters = parts.map(p => `(nomecompleto=*${escapeLdapFilter(p)}*)`).join('');
          filter = `(&${filter}${subFilters})`;
        }
      } else {
        // Busca substring genérica para outros campos
        filter = `(&${filter}(${searchField}=*${escapeLdapFilter(term)}*))`;
      }
    }
    
    if (status) {
      filter = `(&${filter}(status=${status}))`;
    }

    const result = await new Promise<any>((resolve) => {
      const allUsers: LdapUser[] = [];
      const opts: ldap.SearchOptions = {
        filter,
        scope: 'sub' as const,
        paged: {
          pageSize: 250,
          pagePause: false
        },
        sizeLimit: 0,
      };

      client.search('ou=people,dc=quixada,dc=ufc,dc=br', opts, (err, res) => {
        if (err) return resolve({ success: false, error: err.message });

        res.on('searchEntry', (entry) => {
          const attrs: any = {};
          entry.pojo.attributes.forEach(a => { 
            // Mapeia os atributos para lowercase para garantir compatibilidade com a interface
            attrs[a.type.toLowerCase()] = a.values[0]; 
          });
          allUsers.push({ dn: entry.dn.toString(), ...attrs } as LdapUser);
        });

        res.on('error', (err: any) => {
          if (err.name === 'SizeLimitExceededError' || err.code === 4) {
             finalizeSearch();
          } else {
             resolve({ success: false, error: err.message });
          }
        });

        res.on('end', () => {
          finalizeSearch();
        });

        function finalizeSearch() {
          const total = allUsers.length;
          const start = (page - 1) * perPage;
          const paginatedUsers = allUsers.slice(start, start + perPage);
          resolve({ success: true, users: paginatedUsers, total });
        }
      });
    });

    return result;
  } catch (error: any) {
    return { success: false, error: error.message };
  } finally {
    try { client.unbind(); } catch (e) {}
  }
}

export async function updateLdapUser(dn: string, attributes: Partial<LdapUser>) {
  if (!(await checkAuth())) return { success: false, error: "Não autenticado." };

  const client = getLdapClient();
  try {
    await new Promise<void>((resolve, reject) => {
      client.bind(process.env.LDAP_USERNAME!, process.env.LDAP_PASSWORD!, (err) => {
        if (err) reject(err); else resolve();
      });
    });

    const changes: Change[] = [];
    
    if (attributes.nomecompleto) {
        const nameParts = attributes.nomecompleto.trim().split(/\s+/);
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || firstName;
        
        attributes.cn = normalizeString(firstName);
        attributes.sn = normalizeString(lastName);
        attributes.nomecompleto = attributes.nomecompleto.trim();
    }

    Object.entries(attributes).forEach(([key, value]) => {
        if (value !== undefined && value !== null && key !== 'dn' && key !== 'uid') {
            changes.push(new Change({
                operation: 'replace',
                modification: {
                    type: key,
                    values: [String(value)]
                }
            }));
        }
    });

    if (changes.length === 0) return { success: true };

    await new Promise<void>((resolve, reject) => {
      client.modify(dn, changes, (err) => {
        if (err) reject(err); else resolve();
      });
    });

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  } finally {
    try { client.unbind(); } catch (e) {}
  }
}

export async function updateLdapUserStatus(dn: string, status: 'ativo' | 'inativo') {
  return updateLdapUser(dn, { status });
}

export async function findLdapUserByDn(dn: string): Promise<{ success: boolean; user?: LdapUser; error?: string }> {
  if (!(await checkAuth())) return { success: false, error: "Não autenticado." };

  const client = getLdapClient();
  try {
    await new Promise<void>((resolve, reject) => {
      client.bind(process.env.LDAP_USERNAME!, process.env.LDAP_PASSWORD!, (err) => {
        if (err) reject(err); else resolve();
      });
    });

    const result = await new Promise<any>((resolve) => {
      client.search(dn, { scope: 'base' as const }, (err, res) => {
        if (err) return resolve({ success: false, error: err.message });
        res.on('searchEntry', (entry) => {
          const attrs: any = {};
          entry.pojo.attributes.forEach(attr => { attrs[attr.type.toLowerCase()] = attr.values[0]; });
          resolve({ success: true, user: { dn: entry.dn.toString(), ...attrs } as LdapUser });
        });
        res.on('error', (err) => resolve({ success: false, error: err.message }));
      });
    });
    
    return result;
  } catch (error: any) {
    return { success: false, error: error.message };
  } finally {
    try { client.unbind(); } catch (e) {}
  }
}
