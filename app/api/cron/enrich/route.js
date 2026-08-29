import { NextResponse } from "next/server";
import { db, ensureSchema } from "../../../../lib/db";
import { generateCopyBatch } from "../../../../lib/ai-copy";
import { screenPendingLeads } from "../../../../lib/screener";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request) {
  const expected = process.env.CRON_SECRET;
  if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ ok: true, skipped: true, reason: "OPENAI_API_KEY 尚未設定；待判定候選內容維持隱藏，不會以關鍵字結果放行。" });
  }

  await ensureSchema();
  const sql = db();
  const accounts = await sql`
    SELECT a.threads_user_id, s.tone, s.offer, s.ai_filter_enabled, s.ai_confidence_threshold
    FROM threads_accounts a
    JOIN collector_settings s ON s.threads_user_id=a.threads_user_id
    WHERE a.role='owner' AND a.collection_enabled=TRUE AND s.active=TRUE`;
  const results = [];
  for (const account of accounts) {
    try {
      const accountStartedAt = Date.now();
      const screening = await screenPendingLeads(account.threads_user_id, { limit: 60 });
      if (screening.error || Date.now() - accountStartedAt > 10_000) {
        results.push({
          userId: account.threads_user_id,
          screening,
          enriched: 0,
          copySkipped: screening.error ? "語意篩選尚未完成" : "保留函式執行時間，文案將於下次批次處理"
        });
        continue;
      }
      const leads = await sql`
        SELECT id, body, demand_level FROM leads
        WHERE threads_user_id=${account.threads_user_id}
          AND published_at >= NOW() - INTERVAL '7 days'
          AND copy_source='rules'
          AND (${account.ai_filter_enabled}=FALSE OR (
            classification_source='openai' AND ai_match=TRUE
            AND ai_confidence >= ${Number(account.ai_confidence_threshold) || 75}
          ))
        ORDER BY demand_score DESC, collected_at ASC
        LIMIT 20`;
      const copies = await generateCopyBatch(leads, account);
      if (copies.length) {
        await sql`
          UPDATE leads AS l SET suggested_copy=x.copy, copy_source='openai'
          FROM jsonb_to_recordset(${JSON.stringify(copies)}::jsonb) AS x(id text, copy text)
          WHERE l.threads_user_id=${account.threads_user_id} AND l.id=x.id::bigint`;
      }
      results.push({ userId: account.threads_user_id, screening, enriched: copies.length });
    } catch (error) {
      results.push({ userId: account.threads_user_id, error: String(error.message || error).slice(0, 300) });
    }
  }
  return NextResponse.json({ ok: true, results });
}
