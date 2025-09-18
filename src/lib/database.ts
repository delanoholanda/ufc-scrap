import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import type { User, ExtractionStatus, Extraction, ScrapedDataRow } from './types';

const DB_FILE_NAME = 'ufcScraper.db';
const dataDirectory = path.join(process.cwd(), 'data');
const dbPath = path.join(dataDirectory, DB_FILE_NAME);

let dbInstance: Database.Database | null = null;

function initializeDB(): Database.Database {
  if (dbInstance) {
    return dbInstance;
  }

  // Ensure the data directory exists
  if (!fs.existsSync(dataDirectory)) {
    fs.mkdirSync(dataDirectory, { recursive: true });
  }

  const db = new Database(dbPath);
  console.log('[DB] Database connected at:', dbPath);

  // Enable WAL mode for better concurrency
  db.pragma('journal_mode = WAL');

  // Run initial schema setup
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      salt TEXT NOT NULL,
      hash TEXT NOT NULL,
      createdAt TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      resetPasswordToken TEXT,
      resetPasswordExpires TEXT
    );

    CREATE TABLE IF NOT EXISTS extractions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      year INTEGER NOT NULL,
      semester INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'running', -- 'running', 'completed', 'cancelled', 'failed'
      createdAt TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS scraped_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      extraction_id INTEGER NOT NULL,
      codigo TEXT,
      componente TEXT,
      docente TEXT,
      turma TEXT,
      matricula TEXT,
      nome TEXT,
      curso TEXT,
      tipoReserva TEXT,
      situacao TEXT,
      FOREIGN KEY (extraction_id) REFERENCES extractions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS processed_files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        extraction_id INTEGER NOT NULL,
        filename TEXT NOT NULL,
        content TEXT NOT NULL,
        FOREIGN KEY (extraction_id) REFERENCES extractions(id) ON DELETE CASCADE
    );

     CREATE TABLE IF NOT EXISTS extraction_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      extraction_id INTEGER NOT NULL,
      log_message TEXT NOT NULL,
      timestamp TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      FOREIGN KEY (extraction_id) REFERENCES extractions(id) ON DELETE CASCADE
    );
  `);

  console.log('[DB] Schema initialized.');

  // Migration: Add status column to extractions if it doesn't exist
  try {
    const columns = db.pragma('table_info(extractions)') as { name: string }[];
    const statusColumn = columns.some((col) => col.name === 'status');
    if (!statusColumn) {
        console.log('[DB_MIGRATION] Coluna "status" não encontrada na tabela "extractions". Adicionando...');
        db.prepare("ALTER TABLE extractions ADD COLUMN status TEXT NOT NULL DEFAULT 'completed'").run();
        console.log('[DB_MIGRATION] Coluna "status" adicionada com sucesso.');
    }
  } catch(e) {
    console.error('[DB_MIGRATION_ERROR] Falha ao verificar/adicionar a coluna status:', e);
  }


  // Seed default user if no users exist
  const userResult = db.prepare('SELECT count(*) as count FROM users').get() as { count: number } | undefined;
  const userCount = userResult ? userResult.count : 0;

  if (userCount === 0) {
    console.log('[DB] No users found. Seeding default "ntic" user...');
    const { salt, hash } = hashPassword('TroqueNTIC!@');
    db.prepare('INSERT INTO users (name, username, email, salt, hash) VALUES (?, ?, ?, ?, ?)')
      .run('Usuário Padrão', 'ntic', 'ntic@quixada.ufc.br', salt, hash);
    console.log('[DB] Default user "ntic" created.');
  }
  
  // Reset any 'running' extractions from a previous server crash
  try {
    db.prepare("UPDATE extractions SET status = 'failed' WHERE status = 'running'").run();
    console.log('[DB] Marked previously running extractions as failed.');
  } catch(e) {
    // This might fail if the table/column doesn't exist yet on first run, which is fine.
    console.warn('[DB] Could not reset running extractions, might be the first run.', e);
  }


  dbInstance = db;
  return db;
}

export function getDB() {
  return initializeDB();
}

export function hashPassword(password: string): { salt: string; hash: string } {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return { salt, hash };
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  const hashToVerify = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return hash === hashToVerify;
}

export function findUserByUsername(username: string): User | null {
  const db = getDB();
  const stmt = db.prepare('SELECT * FROM users WHERE username = ?');
  const user = stmt.get(username) as any;
  return user || null;
}

export function findUserByEmail(email: string): User | null {
    const db = getDB();
    const stmt = db.prepare('SELECT * FROM users WHERE email = ?');
    const user = stmt.get(email) as User | undefined;
    return user || null;
}

export function generatePasswordResetToken(userId: number): string {
    const db = getDB();
    const token = crypto.randomBytes(20).toString('hex');
    const expires = new Date(Date.now() + 3600000); // 1 hour from now

    const stmt = db.prepare('UPDATE users SET resetPasswordToken = ?, resetPasswordExpires = ? WHERE id = ?');
    stmt.run(token, expires.toISOString(), userId);

    return token;
}

export function getUserByResetToken(token: string): User | null {
    const db = getDB();
    const stmt = db.prepare('SELECT * FROM users WHERE resetPasswordToken = ? AND resetPasswordExpires > ?');
    const user = stmt.get(token, new Date().toISOString()) as User | undefined;
    return user || null;
}

export function findUserById(id: number): Omit<User, 'salt' | 'hash'> | null {
  const db = getDB();
  const stmt = db.prepare('SELECT id, name, username, email FROM users WHERE id = ?');
  const user = stmt.get(id) as any;
  return user || null;
}

export function getExtractionStatus(id: number): ExtractionStatus {
    const db = getDB();
    const stmt = db.prepare('SELECT status FROM extractions WHERE id = ?');
    const result = stmt.get(id) as { status: ExtractionStatus } | undefined;
    return result?.status || 'failed'; // Default to failed if not found
}

export function saveLog(extractionId: number, logMessage: string): void {
  const db = getDB();
  try {
    const stmt = db.prepare('INSERT INTO extraction_logs (extraction_id, log_message) VALUES (?, ?)');
    stmt.run(extractionId, logMessage);
  } catch (e) {
    // Log to console, but don't crash the extraction if logging fails
    console.error(`[SAVE_LOG_ERROR] Failed to save log for extraction ${extractionId}:`, e);
  }
}

export function fetchLatestSuccessfulExtraction(year: string, semester: string): { extraction: Extraction | null, data: ScrapedDataRow[] | null } {
    const db = getDB();
    try {
        const stmt = db.prepare(
            `SELECT id, year, semester, status, createdAt FROM extractions 
             WHERE year = ? AND semester = ? AND status = 'completed' 
             ORDER BY createdAt DESC LIMIT 1`
        );
        const extraction = stmt.get(year, semester) as Extraction | undefined;

        if (!extraction) {
            return { extraction: null, data: null };
        }
        
        const dataStmt = db.prepare('SELECT * FROM scraped_data WHERE extraction_id = ?');
        const data = dataStmt.all(extraction.id) as ScrapedDataRow[];
        
        return { extraction, data };
    } catch (e) {
        console.error("Error fetching latest successful extraction:", e);
        return { extraction: null, data: null };
    }
}


// Ensure the database is initialized on module load
initializeDB();
