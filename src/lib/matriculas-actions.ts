
'use server';

import { getPgPool } from './pg-pool';
import { checkAuth } from './auth-actions';
import { z } from 'zod';
import Papa from 'papaparse';

const MatriculaSchema = z.object({
  matricula: z.number(),
  nome: z.string(),
  curso: z.string(),
  cadastrado: z.number().optional().default(0),
});

/**
 * Busca o próximo UID Number disponível (Maior atual + 1)
 */
async function getNextUidNumber(pool: any): Promise<number> {
    const res = await pool.query('SELECT MAX(uidnumber) as max_uid FROM matriculas');
    const maxUid = parseInt(res.rows[0].max_uid, 10);
    return isNaN(maxUid) ? 100000 : maxUid + 1;
}

export async function fetchMatriculas(params: { page: number; perPage: number; search?: string }) {
  if (!(await checkAuth())) return { success: false, error: "Não autenticado." };

  const { page, perPage, search } = params;
  const offset = (page - 1) * perPage;
  const pool = getPgPool();

  try {
    let query = 'SELECT id_matriculas, matricula, nome, curso, cadastrado, uidnumber FROM matriculas';
    let countQuery = 'SELECT COUNT(*) FROM matriculas';
    const values: any[] = [];

    if (search) {
      const searchPattern = `%${search}%`;
      query += ' WHERE nome ILIKE $1 OR CAST(matricula AS TEXT) ILIKE $1';
      countQuery += ' WHERE nome ILIKE $1 OR CAST(matricula AS TEXT) ILIKE $1';
      values.push(searchPattern);
    }

    query += ` ORDER BY id_matriculas DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`;
    const result = await pool.query(query, [...values, perPage, offset]);
    const countResult = await pool.query(countQuery, values);

    return {
      success: true,
      matriculas: result.rows,
      total: parseInt(countResult.rows[0].count, 10),
    };
  } catch (error: any) {
    console.error('[FETCH_MATRICULAS_ERROR]', error.message);
    return { success: false, error: 'Falha ao buscar matrículas no PostgreSQL.' };
  }
}

export async function addMatricula(data: z.infer<typeof MatriculaSchema>) {
  if (!(await checkAuth())) return { success: false, error: "Não autenticado." };

  const pool = getPgPool();
  try {
    const check = await pool.query(
      'SELECT id_matriculas FROM matriculas WHERE matricula = $1',
      [data.matricula]
    );

    if (check.rows.length > 0) {
      return { success: false, error: 'Já existe um aluno cadastrado com esta matrícula.' };
    }

    const nextUid = await getNextUidNumber(pool);

    await pool.query(
      'INSERT INTO matriculas (matricula, nome, curso, cadastrado, uidnumber) VALUES ($1, $2, $3, $4, $5)',
      [data.matricula, data.nome, data.curso, data.cadastrado, nextUid]
    );
    return { success: true, message: 'Matrícula adicionada com sucesso.' };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function updateMatricula(id: number, data: any) {
  if (!(await checkAuth())) return { success: false, error: "Não autenticado." };

  const pool = getPgPool();
  try {
    const check = await pool.query(
      'SELECT id_matriculas FROM matriculas WHERE matricula = $1 AND id_matriculas != $2',
      [data.matricula, id]
    );

    if (check.rows.length > 0) {
      return { success: false, error: 'Outro aluno já utiliza esta matrícula.' };
    }

    await pool.query(
      'UPDATE matriculas SET matricula = $1, nome = $2, curso = $3, cadastrado = $4 WHERE id_matriculas = $5',
      [data.matricula, data.nome, data.curso, data.cadastrado, id]
    );
    return { success: true, message: 'Matrícula atualizada com sucesso.' };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function deleteMatricula(id: number) {
  if (!(await checkAuth())) return { success: false, error: "Não autenticado." };

  const pool = getPgPool();
  try {
    await pool.query('DELETE FROM matriculas WHERE id_matriculas = $1', [id]);
    return { success: true, message: 'Matrícula excluída.' };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function processMatriculasCsv(csvContent: string) {
  if (!(await checkAuth())) return { success: false, error: "Não autenticado." };

  const results = Papa.parse(csvContent, {
    header: true,
    skipEmptyLines: true,
    delimiter: ';',
  });

  const pool = getPgPool();
  let successCount = 0;
  const errors: string[] = [];

  try {
      let currentMaxUid = await getNextUidNumber(pool);

      for (const row of (results.data as any[])) {
        try {
          const matricula = parseInt(row['Matrícula'] || row.Matricula || row.matricula, 10);
          const nome = row.Nome || row.nome;
          const curso = row.Curso || row.curso;

          if (isNaN(matricula) || !nome) continue;
          
          const check = await pool.query('SELECT id_matriculas FROM matriculas WHERE matricula = $1', [matricula]);

          if (check.rows.length === 0) {
              await pool.query(
                `INSERT INTO matriculas (matricula, nome, curso, cadastrado, uidnumber) 
                 VALUES ($1, $2, $3, 0, $4)`,
                [matricula, nome, curso, currentMaxUid]
              );
              currentMaxUid++;
          } else {
              await pool.query(
                `UPDATE matriculas SET nome = $1, curso = $2 WHERE matricula = $3`,
                [nome, curso, matricula]
              );
          }
          successCount++;
        } catch (e: any) {
          errors.push(`Erro na linha ${successCount + errors.length + 1}: ${e.message}`);
        }
      }
  } catch (e: any) {
      return { success: false, message: 'Erro ao processar arquivo.', error: e.message };
  }

  return {
    success: true,
    message: `${successCount} registros processados com sucesso.`,
    errors,
  };
}

export async function syncStudentsToPostgres(students: any[]) {
    const pool = getPgPool();
    let count = 0;
    try {
        // Obter o ponto de partida para novos UIDs
        const res = await pool.query('SELECT MAX(uidnumber) as max_uid FROM matriculas');
        let currentMaxUid = parseInt(res.rows[0].max_uid, 10);
        if (isNaN(currentMaxUid)) currentMaxUid = 100000;

        for (const s of students) {
            const matricula = parseInt(s.matricula || s['Matrícula'], 10);
            const nome = s.nome || s.Nome;
            const curso = s.curso || s.Curso;

            if (isNaN(matricula) || !nome) continue;
            
            // Verificar se o aluno já existe
            const check = await pool.query('SELECT uidnumber FROM matriculas WHERE matricula = $1', [matricula]);
            
            if (check.rows.length === 0) {
                // Aluno NOVO: Incrementa o maior UID e salva
                currentMaxUid++;
                await pool.query(
                    `INSERT INTO matriculas (matricula, nome, curso, cadastrado, uidnumber) 
                     VALUES ($1, $2, $3, 0, $4)`,
                    [matricula, nome, curso, currentMaxUid]
                );
                count++;
            } else {
                // Aluno EXISTENTE: Apenas atualiza dados básicos
                await pool.query(
                    `UPDATE matriculas SET nome = $1, curso = $2 WHERE matricula = $3`,
                    [nome, curso, matricula]
                );
            }
        }
        return { success: true, message: `${count} alunos novos cadastrados no PostgreSQL.` };
    } catch (e: any) {
        console.error("[SYNC_POSTGRES_ERROR]", e.message);
        return { success: false, error: e.message, message: 'Erro ao sincronizar com Postgres.' };
    }
}
