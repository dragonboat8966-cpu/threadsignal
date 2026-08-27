import { NextResponse } from "next/server";
import { db, ensureSchema } from "../../../../lib/db";
import { generateCopyBatch } from "../../../../lib/ai-copy";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request) {
  const expected = process.env.CRON_SECRET;
  if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ ok: true, skipped: true, reason: "OPENAI_API_KEY 尚未設定，所有資料仍保有內容式規則草稿。" });
  }

  await ensureSchema();
  const sql = db();
  const accounts = await sql`
    SELECT a.threads_user_id, s.tone, s.offer
    FROM threads_accounts a
    JOIN collector_settings s ON s.threads_user_id=a.threads_user_id
    WHERE a.role='owner' AND a.collection_enabled=TRUE AND s.active=TRUE`;
  const results = [];
  for (const account of accounts) {
    try {
      const leads = await sql`
        SELECT id, body, demand_level FROM leads
        WHERE threads_user_id=${account.threads_user_id}
          AND published_at >= NOW() - INTERVAL '7 days'
          AND copy_source='rules'
        ORDER BY demand_score DESC, collected_at ASC
        LIMIT 20`;
      const copies = await generateCopyBatch(leads, account);
      if (copies.length) {
        await sql`
          UPDATE leads AS l SET suggested_copy=x.copy, copy_source='openai'
          FROM jsonb_to_recordset(${JSON.stringify(copies)}::jsonb) AS x(id text, copy text)
          WHERE l.threads_user_id=${account.threads_user_id} AND l.id=x.id::bigint`;
      }
      results.push({ userId: account.threads_user_id, enriched: copies.length });
    } catch (error) {
      results.push({ userId: account.threads_user_id, error: String(error.message || error).slice(0, 300) });
    }
  }
  return NextResponse.json({ ok: true, results });
}
