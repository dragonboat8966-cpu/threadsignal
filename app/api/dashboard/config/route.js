import { NextResponse } from "next/server";
import { requireOwner } from "../../../../lib/cloud-auth";
import { db, ensureSchema } from "../../../../lib/db";

export const runtime = "nodejs";

export async function PUT(request) {
  const owner = await requireOwner();
  if (!owner) return NextResponse.json({ error: "未授權" }, { status: 401 });
  const input = await request.json();
  const keywords = Array.isArray(input.keywords) ? [...new Set(input.keywords.map(String).map(value => value.trim()).filter(Boolean))].slice(0, 30) : [];
  if (!keywords.length) return NextResponse.json({ error: "至少需要一個關鍵字" }, { status: 400 });
  const target = Math.max(1, Math.min(1000, Number(input.target) || 200));
  const schedule = /^([01]\d|2[0-3]):[0-5]\d$/.test(input.schedule) ? input.schedule : "08:30";
  const tone = String(input.tone || "專業親切").slice(0, 50);
  const offer = String(input.offer || "提供快速回覆與一對一需求評估").slice(0, 300);
  const aiFilterEnabled = input.ai_filter_enabled !== false;
  const filterRequirements = String(input.filter_requirements || "").trim().slice(0, 2000);
  if (aiFilterEnabled && filterRequirements.length < 10) {
    return NextResponse.json({ error: "請用至少 10 個字描述 AI 要保留與排除的內容" }, { status: 400 });
  }
  const aiConfidenceThreshold = Math.max(50, Math.min(95, Number(input.ai_confidence_threshold) || 75));
  await ensureSchema();
  const sql = db();
  const previousRows = await sql`SELECT ai_filter_enabled, filter_requirements, ai_confidence_threshold FROM collector_settings WHERE threads_user_id=${owner.userId} LIMIT 1`;
  const previous = previousRows[0];
  const rows = await sql`
    UPDATE collector_settings SET keywords=${JSON.stringify(keywords)}::jsonb, target_per_day=${target},
      schedule=${schedule}, tone=${tone}, offer=${offer}, active=${Boolean(input.active)},
      ai_filter_enabled=${aiFilterEnabled}, filter_requirements=${filterRequirements},
      ai_confidence_threshold=${aiConfidenceThreshold}, updated_at=NOW()
    WHERE threads_user_id=${owner.userId} RETURNING *`;
  const filterChanged = aiFilterEnabled && (
    previous?.ai_filter_enabled !== true ||
    previous?.filter_requirements !== filterRequirements ||
    Number(previous?.ai_confidence_threshold) !== aiConfidenceThreshold
  );
  let requeued = 0;
  if (filterChanged) {
    const requeuedRows = await sql`
      UPDATE leads SET ai_match=NULL, ai_confidence=NULL, relevance_reason='等待新的 AI 語意判定',
        classification_source='pending', classified_at=NULL
      WHERE threads_user_id=${owner.userId} AND published_at >= NOW() - INTERVAL '7 days'
      RETURNING id`;
    requeued = requeuedRows.length;
  }
  return NextResponse.json({ settings: rows[0], requeued, filterChanged });
}
