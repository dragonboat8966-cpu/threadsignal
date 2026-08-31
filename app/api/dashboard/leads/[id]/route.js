import { NextResponse } from "next/server";
import { requireOwner } from "../../../../../lib/cloud-auth";
import { collectionWindowDays } from "../../../../../lib/collection-window";
import { db, ensureSchema } from "../../../../../lib/db";
import { dismissalFingerprint } from "../../../../../lib/collector";

export const runtime = "nodejs";

export async function DELETE(_request, { params }) {
  const owner = await requireOwner();
  if (!owner) return NextResponse.json({ error: "未授權" }, { status: 401 });
  const { id } = await params;
  await ensureSchema();
  const sql = db();
  const settingRows = await sql`SELECT collection_days FROM collector_settings WHERE threads_user_id=${owner.userId} LIMIT 1`;
  const collectionDays = collectionWindowDays(settingRows[0]?.collection_days);
  const rows = await sql`SELECT threads_id FROM leads WHERE id=${Number(id)} AND threads_user_id=${owner.userId} LIMIT 1`;
  if (!rows.length) return NextResponse.json({ error: "找不到資料" }, { status: 404 });
  const fingerprint = dismissalFingerprint(owner.userId, rows[0].threads_id);
  await sql`INSERT INTO dismissed_items (threads_user_id, fingerprint, expires_at) VALUES (${owner.userId}, ${fingerprint}, NOW() + (${collectionDays} * INTERVAL '1 day')) ON CONFLICT (threads_user_id, fingerprint) DO UPDATE SET expires_at=EXCLUDED.expires_at`;
  await sql`DELETE FROM leads WHERE id=${Number(id)} AND threads_user_id=${owner.userId}`;
  return NextResponse.json({ deleted: 1 });
}

export async function PATCH(request, { params }) {
  const owner = await requireOwner();
  if (!owner) return NextResponse.json({ error: "未授權" }, { status: 401 });
  const { id } = await params;
  const input = await request.json();
  const status = String(input.status || "待聯繫").slice(0, 20);
  const copy = String(input.suggested_copy || "").slice(0, 2000);
  await ensureSchema();
  const sql = db();
  const rows = await sql`UPDATE leads SET status=${status}, suggested_copy=${copy} WHERE id=${Number(id)} AND threads_user_id=${owner.userId} RETURNING *`;
  return rows.length ? NextResponse.json({ lead: rows[0] }) : NextResponse.json({ error: "找不到資料" }, { status: 404 });
}
