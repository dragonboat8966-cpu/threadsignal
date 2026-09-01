import { NextResponse } from "next/server";
import { requireOwner } from "../../../../lib/cloud-auth";
import { db, ensureSchema } from "../../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const owner = await requireOwner();
  if (!owner) return NextResponse.json({ error: "未授權" }, { status: 401 });
  await ensureSchema();
  const sql = db();
  const settingRows = await sql`
    SELECT ai_filter_enabled, ai_confidence_threshold
    FROM collector_settings WHERE threads_user_id=${owner.userId} LIMIT 1`;
  const settings = settingRows[0] || {};
  const threshold = Math.max(50, Math.min(95, Number(settings.ai_confidence_threshold) || 75));

  await sql`
    DELETE FROM collection_runs
    WHERE threads_user_id=${owner.userId}
      AND started_at < date_trunc('day', NOW() AT TIME ZONE 'Asia/Taipei') AT TIME ZONE 'Asia/Taipei'`;

  const runs = await sql`
    SELECT r.*,
      COUNT(ri.lead_id)::int AS candidate_count,
      COUNT(ri.lead_id) FILTER (WHERE l.classification_source='pending')::int AS current_pending_count,
      COUNT(ri.lead_id) FILTER (WHERE
        l.classification_source='rules'
        OR (l.classification_source IN ('openai','local_codex') AND l.ai_match=TRUE AND l.ai_confidence >= ${threshold})
      )::int AS current_accepted_count,
      COUNT(ri.lead_id) FILTER (WHERE
        l.classification_source IN ('openai','local_codex')
        AND (l.ai_match IS DISTINCT FROM TRUE OR l.ai_confidence < ${threshold})
      )::int AS current_rejected_count
    FROM collection_runs r
    LEFT JOIN collection_run_items ri ON ri.run_id=r.id
    LEFT JOIN leads l ON l.id=ri.lead_id
    WHERE r.threads_user_id=${owner.userId}
      AND r.started_at >= date_trunc('day', NOW() AT TIME ZONE 'Asia/Taipei') AT TIME ZONE 'Asia/Taipei'
    GROUP BY r.id
    ORDER BY r.started_at DESC
    LIMIT 30`;

  return NextResponse.json({
    date: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" }).format(new Date()),
    timezone: "Asia/Taipei",
    aiFilterEnabled: settings.ai_filter_enabled !== false,
    confidenceThreshold: threshold,
    runs
  }, { headers: { "Cache-Control": "no-store" } });
}
