
'use server';

import { getPgPool } from './pg-pool';
import type { PostgresMatricula } from './types';
import { z } from 'zod';
import Papa from 'papaparse';
import type { PoolClient } from 'pg';

async function getNextUidNumber(client: PoolClient): Promise<number> {
    const result = await client.query('SELECT MAX(uidnumber) as max_uid FROM matriculas');
    const maxUid = result.rows[0].max_uid || 0;
    return maxUid + 1;
}

const MatriculaSchema = z.object({
  matricula: z.number({ required_error: 'Matrícula é obrigatória.' }).int(),
  nome: z.string({ required_error: 'Nome é obrigatório.' }).min(1, 'Nome é obrigatório.').toUpperCase(),
  curso: z.string({ required_error: 'Curso é obrigatório.' }).min(1, 'Curso é obrigatório.').toUpperCase(),
  cadastrado: z.number().int().min(0).optional().default(0),
});

export async function fetchMatriculas({ page, perPage, search }: { page: number, perPage: number, search?: string }) {
  let pool;
  try {
    pool = getPgPool();
    const offset = (page - 1) * perPage;
    const client = await pool.connect();
    
    try {
        let whereClause = '';
        const params: any[] = [];
        
        if (search) {
          whereClause = 'WHERE nome ILIKE $1 OR matricula::text LIKE $1';
          params.push(`%${search}%`);
        }
        
        const countQuery = `SELECT COUNT(*) as count FROM matriculas ${whereClause}`;
        const totalResult = await client.query(countQuery, params);
        const total = parseInt(totalResult.rows[0].count, 10);
        
        const query = `
          SELECT * FROM matriculas 
          ${whereClause} 
          ORDER BY id_matriculas DESC 
          LIMIT $${params.length + 1} OFFSET $${params.length + 2}
        `;
        params.push(perPage, offset);
        
        const matriculasResult = await client.query(query, params);
        
        return { success: true, matriculas: matriculasResult.rows, total };
    } finally {
        client.release();
    }
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Falha ao buscar matrículas no PostgreSQL.';
    console.error('[POSTGRES_FETCH_ERROR]', error);
    return { success: false, error };
  } finally {
      if (pool) {
          await pool.end();
      }
  }
}

export async function addMatricula(data: z.infer<typeof MatriculaSchema>) {
  let pool;
  try {
    pool = getPgPool();
    const validation = MatriculaSchema.safeParse(data);
    if (!validation.success) {
      return { success: false, error: validation.error.errors.map(e => e.message).join(', ') };
    }
    
    const client = await pool.connect();
    try {
        const existing = await client.query('SELECT id_matriculas FROM matriculas WHERE matricula = $1', [data.matricula]);
        if (existing.rowCount && existing.rowCount > 0) {
          return { success: false, error: `A matrícula ${data.matricula} já está cadastrada.` };
        }
        
        const uidnumber = await getNextUidNumber(client);
        
        const query = 'INSERT INTO matriculas (matricula, nome, curso, cadastrado, uidnumber) VALUES ($1, $2, $3, $4, $5)';
        await client.query(query, [data.matricula, data.nome, data.curso, data.cadastrado, uidnumber]);
        
        return { success: true, message: `Matrícula ${data.matricula} cadastrada com sucesso.` };
    } finally {
        client.release();
    }
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Falha ao adicionar matrícula no PostgreSQL.';
     console.error('[POSTGRES_ADD_ERROR]', error);
    return { success: false, error };
  } finally {
      if (pool) {
          await pool.end();
      }
  }
}

export async function updateMatricula(id: number, data: Partial<z.infer<typeof MatriculaSchema>>) {
  let pool;
  try {
    pool = getPgPool();
    const { matricula, nome, curso, cadastrado } = data;
    const query = 'UPDATE matriculas SET matricula = $1, nome = $2, curso = $3, cadastrado = $4 WHERE id_matriculas = $5';
    await pool.query(query, [matricula, nome?.toUpperCase(), curso?.toUpperCase(), cadastrado, id]);
    return { success: true, message: 'Matrícula atualizada com sucesso.' };
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Falha ao atualizar matrícula no PostgreSQL.';
    console.error('[POSTGRES_UPDATE_ERROR]', error);
    return { success: false, error };
  } finally {
      if (pool) {
          await pool.end();
      }
  }
}

export async function deleteMatricula(id: number) {
  let pool;
  try {
    pool = getPgPool();
    await pool.query('DELETE FROM matriculas WHERE id_matriculas = $1', [id]);
    return { success: true, message: 'Matrícula excluída com sucesso.' };
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Falha ao excluir matrícula no PostgreSQL.';
    console.error('[POSTGRES_DELETE_ERROR]', error);
    return { success: false, error };
  } finally {
      if (pool) {
          await pool.end();
      }
  }
}

export async function processMatriculasCsv(fileContent: string) {
    let countSuccess = 0;
    let countFailed = 0;
    const errors: string[] = [];
    let pool;

    try {
        pool = getPgPool();
        const client = await pool.connect();

        try {
            const results = await new Promise<{ data: { 'Matrícula': string; 'Nome': string; 'Curso': string }[], errors: any[] }>((resolve, reject) => {
                Papa.parse<{ 'Matrícula': string; 'Nome': string; 'Curso': string }>(fileContent, {
                    header: true,
                    delimiter: ';',
                    skipEmptyLines: true,
                    complete: resolve,
                    error: reject
                });
            });

            if (results.errors.length > 0) {
                return { success: false, message: `Erro ao processar o arquivo CSV: ${results.errors[0].message}`, errors: [] };
            }

            let latestUid = (await getNextUidNumber(client)) - 1;

            for (const row of results.data) {
                const matriculaNum = parseInt(row['Matrícula'], 10);
                if (isNaN(matriculaNum) || !row['Nome'] || !row['Curso']) {
                    countFailed++;
                    errors.push(`Linha inválida: ${JSON.stringify(row)}`);
                    continue;
                }

                const existing = await client.query('SELECT id_matriculas FROM matriculas WHERE matricula = $1', [matriculaNum]);
                if (existing.rowCount && existing.rowCount > 0) {
                    countFailed++;
                    errors.push(`Matrícula ${matriculaNum} já existe.`);
                    continue;
                }

                latestUid++;
                const insertQuery = 'INSERT INTO matriculas (matricula, nome, curso, cadastrado, uidnumber) VALUES ($1, $2, $3, $4, $5)';
                await client.query(insertQuery, [
                    matriculaNum,
                    row['Nome'].toUpperCase(),
                    row['Curso'].toUpperCase(),
                    0,
                    latestUid
                ]);
                countSuccess++;
            }

            let finalMessage = `${countSuccess} matrículas adicionadas com sucesso.`;
            if (countFailed > 0) {
                finalMessage += ` ${countFailed} falharam.`;
            }

            return { success: true, message: finalMessage, errors };

        } finally {
            client.release();
        }
    } catch (e) {
        const error = e instanceof Error ? e.message : 'Um erro inesperado ocorreu durante o processamento do CSV.';
        console.error('[POSTGRES_CSV_ERROR]', error);
        return { success: false, message: error, errors: [] };
    } finally {
        if (pool) {
            await pool.end();
        }
    }
}
