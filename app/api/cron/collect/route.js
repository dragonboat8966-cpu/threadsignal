import { NextResponse } from "next/server";
import { collectAccount } from "../../../../lib/collector";
import { db, ensureSchema } from "../../../../lib/db";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request) {
  const expected = process.env.CRON_SECRET;
  if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await ensureSchema();
  const sql = db();
  await sql`
    DELETE FROM leads AS l USING collector_settings AS s
    WHERE l.threads_user_id=s.threads_user_id
      AND l.published_at < NOW() - (s.collection_days * INTERVAL '1 day')`;
  await sql`DELETE FROM dismissed_items WHERE expires_at < NOW()`;
  const accounts = await sql`
    SELECT a.threads_user_id FROM threads_accounts a
    JOIN collector_settings s ON s.threads_user_id=a.threads_user_id
    WHERE a.role='owner' AND a.collection_enabled=TRUE AND s.active=TRUE`;
  const results = [];
  for (const account of accounts) {
    try { results.push({ userId: account.threads_user_id, ...(await collectAccount(account.threads_user_id, { triggerType: "cron" })) }); }
    catch (error) { results.push({ userId: account.threads_user_id, error: error.message }); }
  }
  return NextResponse.json({ ok: true, results });
}
