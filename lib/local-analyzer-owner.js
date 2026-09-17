import { db } from "./db";

export async function localAnalyzerOwner() {
  const sql = db();
  const configured = String(process.env.OWNER_THREADS_USER_ID || "").trim();
  const rows = configured
    ? await sql`
        SELECT a.threads_user_id FROM threads_accounts AS a
        JOIN collector_settings AS s ON s.threads_user_id=a.threads_user_id
        WHERE a.threads_user_id=${configured} AND a.role='owner' AND a.collection_enabled=TRUE
          AND s.ai_provider='local_codex'
        LIMIT 1`
    : await sql`
        SELECT a.threads_user_id FROM threads_accounts AS a
        JOIN collector_settings AS s ON s.threads_user_id=a.threads_user_id
        WHERE a.role='owner' AND a.collection_enabled=TRUE AND s.ai_provider='local_codex'
        ORDER BY a.created_at LIMIT 1`;
  return rows[0]?.threads_user_id || "";
}
