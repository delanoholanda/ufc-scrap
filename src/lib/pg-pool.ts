import { Pool } from 'pg';

let pool: Pool | undefined;

function checkEnvVars() {
  const requiredEnvVars = [
    'POSTGRES_HOST',
    'POSTGRES_PORT',
    'POSTGRES_USER',
    'POSTGRES_PASSWORD',
    'POSTGRES_DB',
  ];

  for (const v of requiredEnvVars) {
    if (!process.env[v]) {
      throw new Error(`Variável de ambiente do PostgreSQL ${v} não definida.`);
    }
  }
}

export function getPgPool(): Pool {
  checkEnvVars();

  // Always create a new pool instance for serverless environments
  // to avoid issues with stale connections.
  pool = new Pool({
    host: process.env.POSTGRES_HOST,
    port: parseInt(process.env.POSTGRES_PORT!, 10),
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DB,
    max: 1, // Use 1 for serverless functions to avoid exhausting connections
    idleTimeoutMillis: 5000,
    connectionTimeoutMillis: 10000,
  });

  pool.on('error', (err, client) => {
    console.error('[PG_POOL_ERROR] Erro inesperado no cliente inativo', err);
  });

  return pool;
}
