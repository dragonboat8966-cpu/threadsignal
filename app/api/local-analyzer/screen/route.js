import { NextResponse } from "next/server";
import { authorizeLocalDownload } from "../../../../lib/local-analyzer-auth";
import { db, ensureSchema } from "../../../../lib/db";
import { screenPendingLeads } from "../../../../lib/screener";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request) {
  try {
    if (!authorizeLocalDownload(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  } catch {
    return NextResponse.json({ error: "本機分析密鑰尚未設定。" }, { status: 503 });
  }
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OPENAI_API_KEY 尚未設定；多人工作區候選內容維持隱藏。" }, { status: 503 });
  }

  await ensureSchema();
  const sql = db();
  const rows = await sql`
    SELECT a.threads_user_id
    FROM threads_accounts AS a
    JOIN collector_settings AS s ON s.threads_user_id=a.threads_user_id
    WHERE a.collection_enabled=TRUE AND s.active=TRUE AND s.ai_filter_enabled=TRUE
      AND s.ai_provider='openai'
      AND EXISTS (
        SELECT 1 FROM leads AS l
        WHERE l.threads_user_id=a.threads_user_id
          AND l.classification_source='pending'
          AND l.published_at >= NOW() - (s.collection_days * INTERVAL '1 day')
      )
    ORDER BY (
      SELECT MIN(l2.collected_at) FROM leads AS l2
      WHERE l2.threads_user_id=a.threads_user_id AND l2.classification_source='pending'
    ) ASC NULLS LAST
    LIMIT 1`;
  const userId = rows[0]?.threads_user_id;
  if (!userId) return NextResponse.json({ ok: true, skipped: true, reason: "目前沒有等待網站 AI 判定的多人工作區資料" });

  try {
    const screening = await screenPendingLeads(userId, { limit: 60 });
    return NextResponse.json({ ok: true, userId, screening });
  } catch (error) {
    return NextResponse.json({
      error: String(error.message || error || "多人背景 AI 篩選失敗").slice(0, 500),
      userId
    }, { status: 502 });
  }
}
