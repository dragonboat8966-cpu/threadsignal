import { NextResponse } from "next/server";
import { requireOwner } from "../../../../../../lib/cloud-auth";
import { db, ensureSchema } from "../../../../../../lib/db";
import { generateCopy } from "../../../../../../lib/ai-copy";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(_request, { params }) {
  const owner = await requireOwner();
  if (!owner) return NextResponse.json({ error: "未授權" }, { status: 401 });
  const { id } = await params;
  await ensureSchema();
  const sql = db();
  const leads = await sql`SELECT * FROM leads WHERE id=${Number(id)} AND threads_user_id=${owner.userId} LIMIT 1`;
  if (!leads.length) return NextResponse.json({ error: "找不到資料" }, { status: 404 });
  const settings = await sql`SELECT * FROM collector_settings WHERE threads_user_id=${owner.userId} LIMIT 1`;
  try {
    const copy = await generateCopy(leads[0], settings[0] || {});
    const rows = await sql`UPDATE leads SET suggested_copy=${copy}, copy_source='openai' WHERE id=${Number(id)} AND threads_user_id=${owner.userId} RETURNING *`;
    return NextResponse.json({ lead: rows[0] });
  } catch (error) {
    return NextResponse.json({ error: error.message || "文案產生失敗" }, { status: 500 });
  }
}
