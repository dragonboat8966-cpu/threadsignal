import { NextResponse } from "next/server";
import { requireOwner } from "../../../../../lib/cloud-auth";
import { db, ensureSchema } from "../../../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request, { params }) {
  const owner = await requireOwner();
  if (!owner) return NextResponse.json({ error: "未授權" }, { status: 401 });
  await ensureSchema();
  const { runId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(String(runId || ""))) {
    return NextResponse.json({ error: "無效的蒐集紀錄" }, { status: 400 });
  }
  const sql = db();
  const settingRows = await sql`
    SELECT ai_confidence_threshold FROM collector_settings
    WHERE threads_user_id=${owner.userId} LIMIT 1`;
  const threshold = Math.max(50, Math.min(95, Number(settingRows[0]?.ai_confidence_threshold) || 75));
  const runRows = await sql`
    SELECT * FROM collection_runs
    WHERE id=${runId} AND threads_user_id=${owner.userId}
      AND started_at >= date_trunc('day', NOW() AT TIME ZONE 'Asia/Taipei') AT TIME ZONE 'Asia/Taipei'
    LIMIT 1`;
  if (!runRows.length) return NextResponse.json({ error: "這筆紀錄不存在或已於午夜清除" }, { status: 404 });

  const items = await sql`
    SELECT l.id, l.threads_id, l.username, l.body, l.published_at, l.permalink, l.content_type,
      l.keywords, l.demand_score, l.demand_level, l.ai_match, l.ai_confidence,
      l.relevance_reason, l.classification_source, l.classified_at,
      CASE
        WHEN l.classification_source='pending' THEN 'pending'
        WHEN l.classification_source='rules' THEN 'accepted'
        WHEN l.classification_source IN ('openai','local_codex')
          AND l.ai_match=TRUE AND l.ai_confidence >= ${threshold} THEN 'accepted'
        ELSE 'rejected'
      END AS outcome
    FROM collection_run_items ri
    JOIN leads l ON l.id=ri.lead_id
    WHERE ri.run_id=${runId} AND l.threads_user_id=${owner.userId}
    ORDER BY l.published_at DESC
    LIMIT 1000`;

  return NextResponse.json({ run: runRows[0], confidenceThreshold: threshold, items }, {
    headers: { "Cache-Control": "no-store" }
  });
}
