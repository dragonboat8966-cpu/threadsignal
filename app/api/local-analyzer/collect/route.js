import { NextResponse } from "next/server";
import { authorizeLocalDownload } from "../../../../lib/local-analyzer-auth";
import { collectAccount } from "../../../../lib/collector";
import { db, ensureSchema } from "../../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request) {
  try {
    if (!authorizeLocalDownload(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  } catch {
    return NextResponse.json({ error: "本機分析密鑰尚未設定。" }, { status: 503 });
  }

  await ensureSchema();
  const sql = db();
  const rows = await sql`
    SELECT a.threads_user_id
    FROM threads_accounts AS a
    JOIN collector_settings AS s ON s.threads_user_id=a.threads_user_id
    WHERE a.collection_enabled=TRUE AND s.active=TRUE
      AND NOT EXISTS (
        SELECT 1 FROM collection_runs AS r
        WHERE r.threads_user_id=a.threads_user_id
          AND r.trigger_type IN ('local_hourly','cron')
          AND r.started_at >= date_trunc('hour', NOW() AT TIME ZONE 'Asia/Taipei') AT TIME ZONE 'Asia/Taipei'
      )
    ORDER BY (
      SELECT MAX(r2.started_at) FROM collection_runs AS r2
      WHERE r2.threads_user_id=a.threads_user_id
    ) ASC NULLS FIRST, a.created_at ASC
    LIMIT 1`;
  const userId = rows[0]?.threads_user_id;
  if (!userId) return NextResponse.json({ ok: true, skipped: true, reason: "本小時所有工作區都已完成蒐集" });

  try {
    const collection = await collectAccount(userId, { triggerType: "local_hourly" });
    return NextResponse.json({ ok: true, userId, collection });
  } catch (error) {
    return NextResponse.json({
      error: String(error.message || error || "多人背景蒐集失敗").slice(0, 500),
      userId
    }, { status: 502 });
  }
}
