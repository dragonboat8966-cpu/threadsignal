import { requireOwner } from "../../../../lib/cloud-auth";
import { db, ensureSchema } from "../../../../lib/db";

function safeCell(value) {
  let text = String(value ?? "");
  if (/^[\s]*[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET() {
  const owner = await requireOwner();
  if (!owner) return new Response("Unauthorized", { status: 401 });
  await ensureSchema();
  const sql = db();
  const rows = await sql`SELECT * FROM leads WHERE threads_user_id=${owner.userId} AND published_at >= NOW() - INTERVAL '7 days' ORDER BY published_at DESC LIMIT 5000`;
  const header = ["內容類型","需求度","分數","關鍵字","帳號","內容","建議文案","狀態","時間","連結","母貼文ID"];
  const csv = "\ufeff" + [header, ...rows.map(row => [row.content_type,row.demand_level,row.demand_score,(row.keywords || []).join("、"),row.username,row.body,row.suggested_copy,row.status,row.published_at,row.permalink,row.parent_threads_id])].map(line => line.map(safeCell).join(",")).join("\r\n");
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=threadsignal.csv", "Cache-Control": "no-store" } });
}
