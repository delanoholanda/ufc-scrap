
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
      if (searchField === 'matricula' || searchField === 'uid' || searchField === 'siape') {
        filter = `(&${filter}(${searchField}=${searchValue}))`;
      } else {
        filter = `(&${filter}(${searchField}=*${searchValue}*))`;
      }
    }
    if (status) {
      filter = `(&${filter}(status=${status}))`;
    }

    const result = await new Promise<any>((resolve) => {
      const users: LdapUser[] = [];
      const opts: ldap.SearchOptions = {
        filter,
        scope: 'sub' as const,
        paged: {
          pageSize: 200,
          pagePause: false
        },
        sizeLimit: 0,
      };

      client.search('ou=people,dc=quixada,dc=ufc,dc=br', opts, (err, res) => {
        if (err) return resolve({ success: false, error: err.message });

        res.on('searchEntry', (entry) => {
          const attrs: any = {};
          entry.pojo.attributes.forEach(a => { attrs[a.type] = a.values[0]; });
          users.push({ dn: entry.dn.toString(), ...attrs } as LdapUser);
        });

        res.on('end', () => {
          const total = users.length;
          const start = (page - 1) * perPage;
          const paginatedUsers = users.slice(start, start + perPage);
          resolve({ success: true, users: paginatedUsers, total });
        });

        res.on('error', (err: any) => {
          if (err.name === 'SizeLimitExceededError') {
             const total = users.length;
             const start = (page - 1) * perPage;
             const paginatedUsers = users.slice(start, start + perPage);
             resolve({ success: true, users: paginatedUsers, total });
          } else {
             resolve({ success: false, error: err.message });
          }
        });
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

    // Filtra apenas atributos válidos e com valores definidos
    const validEntries = Object.entries(attributes).filter(([key, value]) => {
        return value !== undefined && value !== null && key !== 'dn' && key !== 'uid';
    });

    if (validEntries.length === 0) {
        return { success: true };
    }

    // Criar as mudanças de forma mais explícita para evitar o erro "modification must be an Attribute"
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
        if (err) {
            console.error('[LDAP_MODIFY_ERROR]', err);
            reject(err);
        } else {
            resolve();
        }
      });
    });

    return { success: true };
  } catch (error: any) {
    console.error('[LDAP_UPDATE_CATCH]', error);
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
          entry.pojo.attributes.forEach(a => { attrs[a.type] = a.values[0]; });
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
