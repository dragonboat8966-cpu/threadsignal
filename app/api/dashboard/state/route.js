import { NextResponse } from "next/server";
import { requireOwner } from "../../../../lib/cloud-auth";
import { db, ensureSchema } from "../../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const owner = await requireOwner();
  if (!owner) return NextResponse.json({ error: "未授權" }, { status: 401 });
  await ensureSchema();
  const sql = db();
  const url = new URL(request.url);
  const level = url.searchParams.get("level") || "";
  const type = url.searchParams.get("type") || "";
  const search = (url.searchParams.get("q") || "").trim().slice(0, 100);
  const limit = Math.max(1, Math.min(500, Number(url.searchParams.get("limit")) || 200));
  const offset = Math.max(0, Math.min(10000, Number(url.searchParams.get("offset")) || 0));
  const leads = await sql`
    SELECT id, threads_id, username, body, published_at, permalink, content_type, parent_threads_id,
      keywords, demand_score, demand_level, demand_reason, suggested_copy, copy_source, status, collected_at
    FROM leads
    WHERE threads_user_id=${owner.userId}
      AND published_at >= NOW() - INTERVAL '7 days'
      AND (${level}='' OR demand_level=${level})
      AND (${type}='' OR content_type=${type})
      AND (${search}='' OR body ILIKE ${`%${search}%`} OR username ILIKE ${`%${search}%`} OR keywords::text ILIKE ${`%${search}%`})
    ORDER BY published_at DESC LIMIT ${limit} OFFSET ${offset}`;
  const matchedRows = await sql`
    SELECT COUNT(*)::int total
    FROM leads
    WHERE threads_user_id=${owner.userId}
      AND published_at >= NOW() - INTERVAL '7 days'
      AND (${level}='' OR demand_level=${level})
      AND (${type}='' OR content_type=${type})
      AND (${search}='' OR body ILIKE ${`%${search}%`} OR username ILIKE ${`%${search}%`} OR keywords::text ILIKE ${`%${search}%`})`;
  const priorityLeads = await sql`
    SELECT id, threads_id, username, body, published_at, permalink, content_type, parent_threads_id,
      keywords, demand_score, demand_level, demand_reason, suggested_copy, copy_source, status, collected_at
    FROM leads
    WHERE threads_user_id=${owner.userId}
      AND published_at >= NOW() - INTERVAL '7 days'
      AND demand_level='高需求'
    ORDER BY demand_score DESC, published_at DESC LIMIT 3`;
  const settingRows = await sql`SELECT * FROM collector_settings WHERE threads_user_id=${owner.userId} LIMIT 1`;
  const runs = await sql`SELECT * FROM collection_runs WHERE threads_user_id=${owner.userId} ORDER BY started_at DESC LIMIT 20`;
  const statRows = await sql`
    SELECT COUNT(*)::int total,
      COUNT(*) FILTER (WHERE demand_level='高需求')::int high,
      COUNT(*) FILTER (WHERE content_type='留言')::int replies,
      COUNT(*) FILTER (WHERE suggested_copy IS NOT NULL AND suggested_copy <> '')::int ready,
      COUNT(*) FILTER (WHERE collected_at >= date_trunc('day', NOW() AT TIME ZONE 'Asia/Taipei') AT TIME ZONE 'Asia/Taipei')::int today
    FROM leads WHERE threads_user_id=${owner.userId} AND published_at >= NOW() - INTERVAL '7 days'`;
  return NextResponse.json({
    settings: settingRows[0],
    leads,
    priorityLeads,
    runs,
    stats: statRows[0],
    matchedTotal: matchedRows[0]?.total || 0,
    offset,
    limit,
    account: owner.account
  }, { headers: { "Cache-Control": "no-store" } });
}
