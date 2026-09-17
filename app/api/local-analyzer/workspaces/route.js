import { NextResponse } from "next/server";
import { authorizeLocalDownload } from "../../../../lib/local-analyzer-auth";
import { db, ensureSchema } from "../../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    if (!authorizeLocalDownload(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  } catch {
    return NextResponse.json({ error: "本機分析密鑰尚未設定。" }, { status: 503 });
  }

  await ensureSchema();
  const sql = db();
  const rows = await sql`
    SELECT a.threads_user_id, a.username, a.role, a.collection_enabled,
      s.active, s.ai_filter_enabled
    FROM threads_accounts AS a
    JOIN collector_settings AS s ON s.threads_user_id=a.threads_user_id
    WHERE a.collection_enabled=TRUE AND s.ai_provider='local_codex'
    ORDER BY CASE WHEN a.role='owner' THEN 0 ELSE 1 END, LOWER(a.username), a.created_at`;

  return NextResponse.json({
    version: 1,
    workspaces: rows.map(row => ({
      userId: String(row.threads_user_id),
      username: String(row.username || ""),
      role: row.role === "owner" ? "owner" : "user",
      active: row.active !== false,
      aiFilterEnabled: row.ai_filter_enabled !== false
    }))
  }, { headers: { "Cache-Control": "no-store" } });
}
