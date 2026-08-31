import { db } from "./db";

export async function localAnalyzerOwner() {
  const sql = db();
  const configured = String(process.env.OWNER_THREADS_USER_ID || "").trim();
  const rows = configured
    ? await sql`SELECT threads_user_id FROM threads_accounts WHERE threads_user_id=${configured} AND role='owner' AND collection_enabled=TRUE LIMIT 1`
    : await sql`SELECT threads_user_id FROM threads_accounts WHERE role='owner' AND collection_enabled=TRUE ORDER BY created_at LIMIT 1`;
  return rows[0]?.threads_user_id || "";
}
