import { NextResponse } from "next/server";
import { authorizeLocalUpload } from "../../../../lib/local-analyzer-auth";
import { localAnalyzerOwner } from "../../../../lib/local-analyzer-owner";
import { collectionWindowDays } from "../../../../lib/collection-window";
import { db, ensureSchema } from "../../../../lib/db";
import { isRelevanceAccepted, validateRelevanceBatchOutput } from "../../../../lib/ai-relevance";
import { LOCAL_CODEX_PROVIDER, usesLocalCodex } from "../../../../lib/ai-provider";

export const runtime = "nodejs";

function demandLevel(score) {
  return score >= 80 ? "高需求" : score >= 58 ? "中需求" : "低需求";
}

export async function POST(request) {
  const rawBody = await request.text();
  try {
    if (!usesLocalCodex()) return NextResponse.json({ error: "本機 Codex 分析模式尚未啟用。" }, { status: 409 });
    if (!authorizeLocalUpload(request, rawBody)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  } catch {
    return NextResponse.json({ error: "本機分析密鑰尚未設定。" }, { status: 503 });
  }

  let body;
  try { body = JSON.parse(rawBody); }
  catch { return NextResponse.json({ error: "結果不是有效 JSON。" }, { status: 400 }); }
  if (body?.version !== 1 || !Array.isArray(body.items) || !body.items.length || body.items.length > 60) {
    return NextResponse.json({ error: "結果格式或筆數無效。" }, { status: 400 });
  }

  await ensureSchema();
  const sql = db();
  const userId = await localAnalyzerOwner();
  if (!userId) return NextResponse.json({ error: "找不到已啟用的擁有者帳號。" }, { status: 404 });
  const settingRows = await sql`
    SELECT ai_confidence_threshold, collection_days FROM collector_settings
    WHERE threads_user_id=${userId} LIMIT 1`;
  const threshold = Number(settingRows[0]?.ai_confidence_threshold) || 75;
  const collectionDays = collectionWindowDays(settingRows[0]?.collection_days);
  const ids = body.items.map(item => String(item?.id || ""));
  const pending = await sql`
    SELECT id::text id FROM leads
    WHERE threads_user_id=${userId} AND classification_source='pending' AND id::text = ANY(${ids}::text[])
      AND published_at >= NOW() - (${collectionDays} * INTERVAL '1 day')`;
  const expectedIds = pending.map(row => row.id);
  const expectedIdSet = new Set(expectedIds);
  const eligibleItems = body.items.filter(item => expectedIdSet.has(String(item?.id || "")));
  const ignoredCount = body.items.length - eligibleItems.length;

  let results = [];
  if (eligibleItems.length) {
    try { results = validateRelevanceBatchOutput({ items: eligibleItems }, expectedIds); }
    catch (error) { return NextResponse.json({ error: String(error.message || error).slice(0, 500) }, { status: 400 }); }
  }

  const updates = results.map(result => ({
    id: result.id,
    ai_match: isRelevanceAccepted(result, threshold),
    ai_confidence: result.confidence,
    relevance_reason: result.relevance_reason,
    demand_score: result.demand_score,
    demand_level: demandLevel(result.demand_score),
    demand_reason: result.demand_reason
  }));
  await sql`
    UPDATE leads AS l SET
      ai_match=x.ai_match,
      ai_confidence=x.ai_confidence,
      relevance_reason=x.relevance_reason,
      classification_source=${LOCAL_CODEX_PROVIDER},
      classified_at=NOW(),
      demand_score=x.demand_score,
      demand_level=x.demand_level,
      demand_reason=x.demand_reason
    FROM jsonb_to_recordset(${JSON.stringify(updates)}::jsonb) AS x(
      id text, ai_match boolean, ai_confidence integer, relevance_reason text,
      demand_score integer, demand_level text, demand_reason text)
    WHERE l.threads_user_id=${userId} AND l.id=x.id::bigint AND l.classification_source='pending'`;

  const pendingRows = await sql`
    SELECT COUNT(*)::int count FROM leads
    WHERE threads_user_id=${userId} AND classification_source='pending'
      AND published_at >= NOW() - (${collectionDays} * INTERVAL '1 day')`;
  return NextResponse.json({
    ok: true,
    processedCount: updates.length,
    ignoredCount,
    acceptedCount: updates.filter(item => item.ai_match).length,
    rejectedCount: updates.filter(item => !item.ai_match).length,
    pendingCount: Number(pendingRows[0]?.count || 0)
  });
}
