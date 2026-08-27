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
  await ensureSchema();
  const sql = db();
  const rows = await sql`
    UPDATE collector_settings SET keywords=${JSON.stringify(keywords)}::jsonb, target_per_day=${target},
      schedule=${schedule}, tone=${tone}, offer=${offer}, active=${Boolean(input.active)}, updated_at=NOW()
    WHERE threads_user_id=${owner.userId} RETURNING *`;
  return NextResponse.json({ settings: rows[0] });
}
