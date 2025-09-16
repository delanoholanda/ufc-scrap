'use server';

import { getDB } from './database';
import type { Extraction, ScrapedDataRow, CSVFile, ExtractionLog } from './types';
import { processData } from './processing/process-data';

export async function fetchExtractions(): Promise<{ success: boolean; data?: Extraction[]; error?: string }> {
  try {
    const db = getDB();
    const stmt = db.prepare('SELECT id, year, semester, status, createdAt FROM extractions ORDER BY createdAt DESC');
    const data = stmt.all() as Extraction[];
    return { success: true, data };
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Falha ao buscar extrações.';
    console.error('[HISTORY_ACTIONS_ERROR]', error);
    return { success: false, error };
  }
}

export async function deleteExtraction(id: number): Promise<{ success: boolean; error?: string }> {
  try {
    const db = getDB();
    // A chave estrangeira com ON DELETE CASCADE cuidará de apagar os dados em `scraped_data`, `processed_files` e `extraction_logs`
    const stmt = db.prepare('DELETE FROM extractions WHERE id = ?');
    const result = stmt.run(id);

    if (result.changes === 0) {
      return { success: false, error: 'Nenhuma extração encontrada com este ID.' };
    }
    
    return { success: true };
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Falha ao excluir extração.';
    console.error('[HISTORY_ACTIONS_ERROR]', error);
    return { success: false, error };
  }
}

export async function fetchExtractionDetails(id: number): Promise<{
  success: boolean;
  extraction?: Extraction;
  data?: ScrapedDataRow[];
  files?: CSVFile[];
  error?: string;
}> {
  try {
    const db = getDB();
    
    const extractionStmt = db.prepare('SELECT id, year, semester, status, createdAt FROM extractions WHERE id = ?');
    const extraction = extractionStmt.get(id) as Extraction | undefined;

    if (!extraction) {
      return { success: false, error: 'Extração não encontrada.' };
    }

    const dataStmt = db.prepare('SELECT * FROM scraped_data WHERE extraction_id = ?');
    const data = dataStmt.all(id) as ScrapedDataRow[];

    const filesStmt = db.prepare('SELECT filename, content FROM processed_files WHERE extraction_id = ?');
    const files = filesStmt.all(id) as CSVFile[];

    return { success: true, extraction, data, files };
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Falha ao buscar detalhes da extração.';
    console.error('[HISTORY_ACTIONS_ERROR]', error);
    return { success: false, error };
  }
}

export async function fetchExtractionLogs(id: number): Promise<{ success: boolean; logs?: ExtractionLog[]; error?: string }> {
  try {
    const db = getDB();
    const stmt = db.prepare('SELECT id, log_message, timestamp FROM extraction_logs WHERE extraction_id = ? ORDER BY timestamp ASC');
    const logs = stmt.all(id) as ExtractionLog[];
    return { success: true, logs };
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Falha ao buscar os logs da extração.';
    console.error('[HISTORY_ACTIONS_ERROR]', error);
    return { success: false, error };
  }
}

export async function reprocessExtraction(id: number): Promise<{ success: boolean; files?: CSVFile[]; error?: string }> {
    const db = getDB();
    try {
        console.log(`[REPROCESS] Iniciando reprocessamento para extração ID: ${id}`);
        // Marcar como 'running' para dar feedback na UI
        db.prepare("UPDATE extractions SET status = 'running' WHERE id = ?").run(id);

        // 1. Obter dados brutos e informações da extração
        const extractionInfoStmt = db.prepare('SELECT year, semester FROM extractions WHERE id = ?');
        const extractionInfo = extractionInfoStmt.get(id) as { year: number; semester: number } | undefined;
        
        const dataStmt = db.prepare('SELECT * FROM scraped_data WHERE extraction_id = ?');
        const rawData = dataStmt.all(id) as ScrapedDataRow[];

        if (!extractionInfo || rawData.length === 0) {
            const errorMsg = 'Dados brutos ou informações da extração não encontrados para reprocessamento.';
            console.error(`[REPROCESS_ERROR] ${errorMsg}`);
            db.prepare("UPDATE extractions SET status = 'failed' WHERE id = ?").run(id);
            return { success: false, error: errorMsg };
        }
        console.log(`[REPROCESS] Encontrados ${rawData.length} registros brutos para a extração ${extractionInfo.year}.${extractionInfo.semester}.`);

        // 2. Executar a lógica de processamento
        console.log(`[REPROCESS] Executando 'processData'...`);
        const category = `${extractionInfo.year}.${extractionInfo.semester}`;
        const newFiles = await processData(rawData, category);
        console.log(`[REPROCESS] 'processData' concluído. Gerados ${newFiles.length} arquivos.`);

        // 3. Atualizar arquivos no banco de dados em uma transação
        const updateTransaction = db.transaction(() => {
            console.log(`[REPROCESS] Excluindo arquivos antigos...`);
            db.prepare('DELETE FROM processed_files WHERE extraction_id = ?').run(id);

            console.log(`[REPROCESS] Inserindo ${newFiles.length} novos arquivos...`);
            const insertStmt = db.prepare('INSERT INTO processed_files (extraction_id, filename, content) VALUES (?, ?, ?)');
            for (const file of newFiles) {
                insertStmt.run(id, file.filename, file.content);
            }
            
            // Marcar como 'completed' no final da transação bem-sucedida
            db.prepare("UPDATE extractions SET status = 'completed' WHERE id = ?").run(id);
        });
        
        updateTransaction();
        console.log(`[REPROCESS] Transação de atualização de arquivos concluída com sucesso.`);

        return { success: true, files: newFiles };
    } catch (e) {
        const error = e instanceof Error ? e.message : 'Falha ao reprocessar a extração.';
        console.error('[REPROCESS_FATAL_ERROR]', error);
        db.prepare("UPDATE extractions SET status = 'failed' WHERE id = ?").run(id);
        return { success: false, error };
    }
}
