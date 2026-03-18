
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

/**
 * Normaliza strings conforme regra: Uppercase, sem acentos, hífens viram espaços.
 */
function normalizeString(str: string): string {
    if (!str) return '';
    return str
        .toUpperCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove acentos
        .replace(/-/g, ' ')              // Hífens viram espaços
        .replace(/\s+/g, ' ')            // Remove espaços duplos
        .trim();
}

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
        filter = `(&${filter}(${searchField}=${escapeLdapFilter(term)}))`;
      } else if (searchField === 'nomecompleto') {
        const normalizedTerm = normalizeString(term);
        const parts = normalizedTerm.split(/\s+/).filter(p => p.length > 0);
        if (parts.length > 0) {
          const subFilters = parts.map(p => `(nomecompleto=*${escapeLdapFilter(p)}*)`).join('');
          filter = `(&${filter}${subFilters})`;
        }
      } else {
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
        paged: { pageSize: 250, pagePause: false },
        sizeLimit: 0,
      };

      client.search('ou=people,dc=quixada,dc=ufc,dc=br', opts, (err, res) => {
        if (err) return resolve({ success: false, error: err.message });

        res.on('searchEntry', (entry) => {
          const attrs: any = {};
          entry.pojo.attributes.forEach(a => { 
              attrs[a.type.toLowerCase()] = a.values[0]; 
          });
          allUsers.push({ dn: entry.dn.toString(), ...attrs } as LdapUser);
        });

        res.on('error', (err: any) => {
          if (err.name === 'SizeLimitExceededError' || err.code === 4) finalizeSearch();
          else resolve({ success: false, error: err.message });
        });

        res.on('end', () => finalizeSearch());

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

    const updateData: any = { ...attributes };
    
    // Sincronização Automática CN e SN (Primeiro Nome / Restante) em maiúsculas conforme regra
    if (updateData.nomecompleto) {
        const cleanName = normalizeString(updateData.nomecompleto);
        const nameParts = cleanName.split(/\s+/);
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || firstName;
        
        updateData.cn = firstName;
        updateData.sn = lastName;
        updateData.nomecompleto = cleanName;
    }

    const validEntries = Object.entries(updateData).filter(([key, value]) => {
        return value !== undefined && value !== null && key !== 'dn' && key !== 'uid';
    });

    if (validEntries.length === 0) return { success: true };

    // Usando o formato de Change validado pelo usuário que funcionou para resolver o erro de Atributo
    const changes: Change[] = validEntries.map(([key, value]) => {
      return new Change({
        operation: 'replace',
        modification: {
            type: key,
            values: [String(value)]
        }
      });
    });

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
          entry.pojo.attributes.forEach(a => { 
              attrs[a.type.toLowerCase()] = a.values[0]; 
          });
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
