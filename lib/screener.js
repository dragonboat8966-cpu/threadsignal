import { classifyRelevanceBatch, RELEVANCE_BATCH_LIMIT } from "./ai-relevance";
import { usesLocalCodex } from "./ai-provider";
import { collectionWindowDays } from "./collection-window";
import { db, ensureSchema } from "./db";

const MAX_PER_REQUEST = 60;

function demandLevel(score) {
  return score >= 80 ? "高需求" : score >= 58 ? "中需求" : "低需求";
}
function chunks(values, size) {
  const output = [];
  for (let index = 0; index < values.length; index += size) output.push(values.slice(index, index + size));
  return output;
}

function publicOpenAIError(error) {
  const message = String(error?.message || error || "OpenAI 語意篩選失敗");
  if (error?.code === "insufficient_quota" || /quota|billing/i.test(message)) {
    return "OpenAI API 額度不足，候選內容仍維持隱藏；請到 OpenAI Platform 啟用付費額度後重試。";
  }
  if (error?.status === 401) return "OPENAI_API_KEY 無效，候選內容仍維持隱藏。";
  if (error?.status === 429) return "OpenAI API 目前流量受限，候選內容仍維持隱藏，請稍後重試。";
  return message.slice(0, 500);
}

/**
 * Screens a bounded page of pending candidates. Failed batches remain pending
 * and therefore invisible (fail closed); successful batches are persisted.
 */
export async function screenPendingLeads(userId, { limit = MAX_PER_REQUEST } = {}) {
  await ensureSchema();
  const sql = db();
  const settingRows = await sql`
    SELECT ai_filter_enabled, filter_requirements, ai_confidence_threshold, collection_days
    FROM collector_settings WHERE threads_user_id=${userId} LIMIT 1`;
  const settings = settingRows[0];
  const collectionDays = collectionWindowDays(settings?.collection_days);
  if (!settings?.ai_filter_enabled) {
    return { skipped: true, reason: "AI 語意篩選已關閉", screenedCount: 0, acceptedCount: 0, rejectedCount: 0, pendingCount: 0 };
  }
  if (usesLocalCodex()) {
    const countRows = await sql`
      SELECT COUNT(*)::int count FROM leads
      WHERE threads_user_id=${userId} AND classification_source='pending'
        AND published_at >= NOW() - (${collectionDays} * INTERVAL '1 day')`;
    return {
      skipped: true,
      reason: "候選內容等待本機 Codex 排程判定",
      screenedCount: 0,
      acceptedCount: 0,
      rejectedCount: 0,
      pendingCount: Number(countRows[0]?.count || 0)
    };
  }
  if (!process.env.OPENAI_API_KEY) {
    return {
      screenedCount: 0,
      acceptedCount: 0,
      rejectedCount: 0,
      failedBatches: 1,
      error: "尚未設定 OPENAI_API_KEY，候選內容仍維持隱藏。",
      pendingCount: Number((await sql`SELECT COUNT(*)::int count FROM leads WHERE threads_user_id=${userId} AND classification_source='pending' AND published_at >= NOW() - (${collectionDays} * INTERVAL '1 day')`)[0]?.count || 0)
    };
  }

  const boundedLimit = Math.max(1, Math.min(MAX_PER_REQUEST, Number(limit) || MAX_PER_REQUEST));
  const pending = await sql`
    SELECT id, body, content_type, keywords
    FROM leads
    WHERE threads_user_id=${userId}
      AND classification_source='pending'
      AND published_at >= NOW() - (${collectionDays} * INTERVAL '1 day')
    ORDER BY demand_score DESC, published_at DESC
    LIMIT ${boundedLimit}`;
  if (!pending.length) {
    return { screenedCount: 0, acceptedCount: 0, rejectedCount: 0, failedBatches: 0, pendingCount: 0 };
  }

  const batches = chunks(pending, RELEVANCE_BATCH_LIMIT);
  const settled = await Promise.allSettled(batches.map(batch => classifyRelevanceBatch(batch, {
    filterRequirements: settings.filter_requirements,
    confidenceThreshold: Number(settings.ai_confidence_threshold) || 75
  })));
  const results = settled.flatMap(result => result.status === "fulfilled" ? result.value : []);
  const errors = settled.filter(result => result.status === "rejected").map(result => publicOpenAIError(result.reason));

  if (results.length) {
    const updates = results.map(result => ({
      id: result.id,
      ai_match: result.accepted,
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
        classification_source='openai',
        classified_at=NOW(),
        demand_score=x.demand_score,
        demand_level=x.demand_level,
        demand_reason=x.demand_reason
      FROM jsonb_to_recordset(${JSON.stringify(updates)}::jsonb) AS x(
        id text, ai_match boolean, ai_confidence integer, relevance_reason text,
        demand_score integer, demand_level text, demand_reason text)
      WHERE l.threads_user_id=${userId} AND l.id=x.id::bigint AND l.classification_source='pending'`;
  }

  const acceptedCount = results.filter(result => result.accepted).length;
  const rejectedCount = results.length - acceptedCount;
  const countRows = await sql`
    SELECT COUNT(*)::int count FROM leads
    WHERE threads_user_id=${userId} AND classification_source='pending'
      AND published_at >= NOW() - (${collectionDays} * INTERVAL '1 day')`;
  return {
    screenedCount: results.length,
    acceptedCount,
    rejectedCount,
    failedBatches: errors.length,
    pendingCount: Number(countRows[0]?.count || 0),
    error: errors[0] || ""
  };
}
