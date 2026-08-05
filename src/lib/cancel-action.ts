'use server';

import { getDB } from './database';

export async function cancelExtraction(id?: number | null): Promise<{ success: boolean; error?: string }> {
  try {
    const db = getDB();
    let result;
    if (id) {
      const stmt = db.prepare("UPDATE extractions SET status = 'cancelled' WHERE id = ? AND status = 'running'");
      result = stmt.run(id);
    } else {
      const stmt = db.prepare("UPDATE extractions SET status = 'cancelled' WHERE status = 'running'");
      result = stmt.run();
    }

    if (result.changes === 0) {
      console.warn(`[CANCEL_ACTION] Nenhuma extração em estado 'running' para cancelar.`);
      return { success: true };
    }
    
    console.log(`[CANCEL_ACTION] Extração marcada como 'cancelled' (${result.changes} alterada(s)).`);
    return { success: true };
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Falha ao cancelar a extração.';
    console.error(`[CANCEL_ACTION_ERROR] Erro ao cancelar a extração:`, error);
    return { success: false, error };
  }
}
