'use server';

import ldap, { Change } from 'ldapjs';
import type { LdapUser } from './types';
import { checkAuth } from './auth-actions';

function getLdapClient(): ldap.Client {
  const ldapUrl = `ldap://${process.env.LDAP_SERVER}:${process.env.LDAP_PORT}`;
  return ldap.createClient({ url: ldapUrl, connectTimeout: 10000 });
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
      // Usar busca exata para campos numéricos/identificadores para maior eficiência
      if (searchField === 'matricula' || searchField === 'uid' || searchField === 'siape') {
        filter = `(&${filter}(${searchField}=${searchValue}))`;
      } else {
        filter = `(&${filter}(${searchField}=*${searchValue}*))`;
      }
    }
    if (status) {
      filter = `(&${filter}(status=${status}))`;
    }

    return new Promise((resolve) => {
      const users: LdapUser[] = [];
      const opts: ldap.SearchOptions = {
        filter,
        scope: 'sub' as const,
        paged: {
          pageSize: 200,
          pagePause: false
        },
        sizeLimit: 0, // 0 indica que confiamos no controle de paginação do servidor
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
          client.unbind();
        });

        res.on('error', (err: any) => {
          if (err.name === 'SizeLimitExceededError') {
             // Se o servidor ainda assim reclamar de tamanho, retornamos o que já foi coletado
             const total = users.length;
             const start = (page - 1) * perPage;
             const paginatedUsers = users.slice(start, start + perPage);
             resolve({ success: true, users: paginatedUsers, total });
          } else {
             resolve({ success: false, error: err.message });
          }
          client.unbind();
        });
      });
    });
  } catch (error: any) {
    return { success: false, error: error.message };
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

    const changes: Change[] = Object.entries(attributes).map(([key, value]) => {
      return new Change({
        operation: 'replace',
        modification: { [key]: value }
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
    client.unbind();
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

    return new Promise((resolve) => {
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
  } catch (error: any) {
    return { success: false, error: error.message };
  } finally {
    client.unbind();
  }
}
