
'use server';

import { Pool } from 'pg';
import ldap from 'ldapjs';
import nodemailer from 'nodemailer';
import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);

interface ConnectionResult {
  success: boolean;
  message: string;
}

interface TestResults {
  postgres: ConnectionResult;
  ldap: ConnectionResult;
  email: ConnectionResult;
  chrome: ConnectionResult;
}

export async function testConnections(): Promise<TestResults> {
  const pgResult = await testPostgresConnection();
  const ldapResult = await testLdapConnection();
  const emailResult = await testEmailConnection();
  const chromeResult = await testChromeAvailability();

  return {
    postgres: pgResult,
    ldap: ldapResult,
    email: emailResult,
    chrome: chromeResult,
  };
}

async function testChromeAvailability(): Promise<ConnectionResult> {
  const isProduction = !!process.env.FIREBASE_APP_HOSTING_URL || process.env.NODE_ENV === 'production';
  const chromePath = isProduction ? '/usr/bin/google-chrome' : 'google-chrome';

  try {
    // Tenta executar o comando --version para ver se o binário existe e responde
    const { stdout } = await execPromise(`${chromePath} --version`);
    return { success: true, message: `Chrome detectado: ${stdout.trim()}` };
  } catch (error: any) {
    return { 
      success: false, 
      message: `Chrome não encontrado no caminho: ${chromePath}. Verifique o apphosting.yaml.` 
    };
  }
}

async function testPostgresConnection(): Promise<ConnectionResult> {
  const requiredEnvVars = [
    'POSTGRES_HOST',
    'POSTGRES_PORT',
    'POSTGRES_USER',
    'POSTGRES_PASSWORD',
    'POSTGRES_DB',
  ];

  for (const v of requiredEnvVars) {
    if (!process.env[v]) {
      return { success: false, message: `Variável de ambiente ${v} não definida.` };
    }
  }

  const pgPool = new Pool({
    host: process.env.POSTGRES_HOST,
    port: parseInt(process.env.POSTGRES_PORT!, 10),
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DB,
    connectionTimeoutMillis: 5000,
  });

  try {
    const client = await pgPool.connect();
    client.release();
    return { success: true, message: 'Conexão com PostgreSQL bem-sucedida.' };
  } catch (error: any) {
    return { success: false, message: `Falha na conexão com PostgreSQL: ${error.message}` };
  } finally {
    await pgPool.end();
  }
}

async function testLdapConnection(): Promise<ConnectionResult> {
  const requiredEnvVars = [
    'LDAP_SERVER',
    'LDAP_PORT',
    'LDAP_USERNAME',
    'LDAP_PASSWORD',
  ];

  for (const v of requiredEnvVars) {
    if (!process.env[v]) {
      return { success: false, message: `Variável de ambiente ${v} não definida.` };
    }
  }
  
  const ldapUrl = `ldap://${process.env.LDAP_SERVER}:${process.env.LDAP_PORT}`;
  const client = ldap.createClient({
    url: ldapUrl,
    connectTimeout: 5000,
  });

  return new Promise((resolve) => {
    client.on('error', (err) => {
      resolve({ success: false, message: `Falha na conexão com LDAP: ${err.message}` });
    });

    client.bind(process.env.LDAP_USERNAME!, process.env.LDAP_PASSWORD!, (err) => {
      if (err) {
        resolve({ success: false, message: `Falha no bind LDAP: ${err.message}` });
        client.unbind();
      } else {
        resolve({ success: true, message: 'Conexão e bind com LDAP bem-sucedidos.' });
        client.unbind();
      }
    });
  });
}

async function testEmailConnection(): Promise<ConnectionResult> {
    const requiredEnvVars = ['EMAIL_HOST', 'EMAIL_PORT', 'EMAIL_USER', 'EMAIL_PASS'];

    for (const v of requiredEnvVars) {
        if (!process.env[v]) {
        return { success: false, message: `Variável de ambiente ${v} não definida.` };
        }
    }

    const transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: parseInt(process.env.EMAIL_PORT!, 10),
        secure: parseInt(process.env.EMAIL_PORT!, 10) === 465,
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
        tls: {
            rejectUnauthorized: false
        }
    });

    try {
        await transporter.verify();
        return { success: true, message: 'Conexão com servidor SMTP bem-sucedida.' };
    } catch (error: any) {
        return { success: false, message: `Falha na conexão SMTP: ${error.message}` };
    }
}
