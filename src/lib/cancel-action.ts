'use server';

import { getDB } from './database';

export async function cancelExtraction(id: number): Promise<{ success: boolean; error?: string }> {
  try {
    const db = getDB();
    const stmt = db.prepare("UPDATE extractions SET status = 'cancelled' WHERE id = ? AND status = 'running'");
    const result = stmt.run(id);

    if (result.changes === 0) {
      // It might have already completed or been cancelled, which is not an error for the user.
      console.warn(`[CANCEL_ACTION] Tentativa de cancelar a extração ${id}, mas ela não estava em estado 'running'.`);
      return { success: true }; // Still a success from the user's perspective
    }
    
    console.log(`[CANCEL_ACTION] Extração ${id} marcada como 'cancelled'.`);
    return { success: true };
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Falha ao cancelar a extração.';
    console.error(`[CANCEL_ACTION_ERROR] Erro ao cancelar a extração ${id}:`, error);
    return { success: false, error };
  }
}
