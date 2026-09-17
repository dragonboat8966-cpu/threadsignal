import { NextResponse } from "next/server";
import { requireAdminOwner } from "../../../../lib/cloud-auth";
import { db, ensureSchema } from "../../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const admin = await requireAdminOwner();
  if (!admin) return NextResponse.json({ error: "只有擁有者可以使用管理後臺。" }, { status: 403 });
  await ensureSchema();
  const sql = db();

  const accounts = await sql`
    SELECT a.threads_user_id, a.username, a.role, a.collection_enabled, a.created_at, a.updated_at,
      s.active, s.keywords, s.target_per_day, s.collection_days, s.ai_filter_enabled,
      s.ai_confidence_threshold, s.filter_requirements,
      (SELECT COUNT(*)::int FROM leads l
        WHERE l.threads_user_id=a.threads_user_id
          AND l.published_at >= NOW() - (s.collection_days * INTERVAL '1 day')) AS total_count,
      (SELECT COUNT(*)::int FROM leads l
        WHERE l.threads_user_id=a.threads_user_id AND l.classification_source='pending'
          AND l.published_at >= NOW() - (s.collection_days * INTERVAL '1 day')) AS pending_count,
      (SELECT COUNT(*)::int FROM leads l
        WHERE l.threads_user_id=a.threads_user_id AND l.ai_match=TRUE
          AND l.classification_source='local_codex'
          AND l.published_at >= NOW() - (s.collection_days * INTERVAL '1 day')) AS accepted_count,
      (SELECT COUNT(*)::int FROM leads l
        WHERE l.threads_user_id=a.threads_user_id AND l.ai_match=FALSE
          AND l.classification_source='local_codex'
          AND l.published_at >= NOW() - (s.collection_days * INTERVAL '1 day')) AS rejected_count,
      (SELECT MAX(r.started_at) FROM collection_runs r
        WHERE r.threads_user_id=a.threads_user_id) AS last_run_at
    FROM threads_accounts a
    JOIN collector_settings s ON s.threads_user_id=a.threads_user_id
    ORDER BY CASE WHEN a.role='owner' THEN 0 ELSE 1 END, LOWER(a.username), a.created_at`;

  const url = new URL(request.url);
  const requested = url.searchParams.get("userId") || admin.userId;
  const selectedAccount = accounts.find(account => String(account.threads_user_id) === requested) || accounts[0];
  if (!selectedAccount) return NextResponse.json({ accounts: [], selected: null });
  const selectedUserId = String(selectedAccount.threads_user_id);
  const collectionDays = Math.max(1, Math.min(30, Number(selectedAccount.collection_days) || 7));

  const leads = await sql`
    SELECT id, threads_id, username, body, published_at, permalink, content_type, keywords,
      demand_score, demand_level, demand_reason, ai_match, ai_confidence, relevance_reason,
      classification_source, status, collected_at
    FROM leads
    WHERE threads_user_id=${selectedUserId}
      AND published_at >= NOW() - (${collectionDays} * INTERVAL '1 day')
    ORDER BY collected_at DESC, published_at DESC
    LIMIT 250`;
  const runs = await sql`
    SELECT id, trigger_type, status, target_count, raw_count, inserted_count, duplicate_count,
      too_old_count, accepted_count, rejected_count, pending_count, error, started_at, finished_at
    FROM collection_runs
    WHERE threads_user_id=${selectedUserId}
    ORDER BY started_at DESC
    LIMIT 30`;

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    accounts,
    selected: {
      account: selectedAccount,
      leads,
      runs
    }
  }, { headers: { "Cache-Control": "no-store" } });
}
