import { requireOwner } from "../../../../lib/cloud-auth";
import { collectionWindowDays } from "../../../../lib/collection-window";
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
  const settingRows = await sql`SELECT ai_filter_enabled, ai_confidence_threshold, collection_days FROM collector_settings WHERE threads_user_id=${owner.userId} LIMIT 1`;
  const aiFilterEnabled = settingRows[0]?.ai_filter_enabled !== false;
  const collectionDays = collectionWindowDays(settingRows[0]?.collection_days);
  const threshold = Math.max(50, Math.min(95, Number(settingRows[0]?.ai_confidence_threshold) || 75));
  const rows = await sql`
    SELECT * FROM leads
    WHERE threads_user_id=${owner.userId}
      AND published_at >= NOW() - (${collectionDays} * INTERVAL '1 day')
      AND (${aiFilterEnabled}=FALSE OR (classification_source IN ('openai','local_codex') AND ai_match=TRUE AND ai_confidence >= ${threshold}))
    ORDER BY published_at DESC LIMIT 5000`;
  const header = ["內容類型","AI符合度","AI符合原因","需求度","分數","關鍵字","帳號","內容","建議文案","狀態","時間","連結","母貼文ID","判定來源"];
  const csv = "\ufeff" + [header, ...rows.map(row => [row.content_type,row.ai_confidence ?? "",row.relevance_reason,row.demand_level,row.demand_score,(row.keywords || []).join("、"),row.username,row.body,row.suggested_copy,row.status,row.published_at,row.permalink,row.parent_threads_id,row.classification_source])].map(line => line.map(safeCell).join(",")).join("\r\n");
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=threadsignal.csv", "Cache-Control": "no-store" } });
}
