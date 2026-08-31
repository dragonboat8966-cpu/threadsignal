import { NextResponse } from "next/server";
import { authorizeLocalDownload } from "../../../../lib/local-analyzer-auth";
import { localAnalyzerOwner } from "../../../../lib/local-analyzer-owner";
import { db, ensureSchema } from "../../../../lib/db";
import { usesLocalCodex } from "../../../../lib/ai-provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    if (!usesLocalCodex()) return NextResponse.json({ error: "本機 Codex 分析模式尚未啟用。" }, { status: 409 });
    if (!authorizeLocalDownload(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  } catch {
    return NextResponse.json({ error: "本機分析密鑰尚未設定。" }, { status: 503 });
  }

  await ensureSchema();
  const sql = db();
  const userId = await localAnalyzerOwner();
  if (!userId) return NextResponse.json({ error: "找不到已啟用的擁有者帳號。" }, { status: 404 });

  const settingRows = await sql`
    SELECT ai_filter_enabled, filter_requirements, ai_confidence_threshold
    FROM collector_settings WHERE threads_user_id=${userId} LIMIT 1`;
  const settings = settingRows[0];
  if (!settings?.ai_filter_enabled) {
    return NextResponse.json({ version: 1, generatedAt: new Date().toISOString(), items: [], disabled: true });
  }

  const rows = await sql`
    SELECT id, body, content_type, keywords
    FROM leads
    WHERE threads_user_id=${userId}
      AND classification_source='pending'
      AND published_at >= NOW() - INTERVAL '7 days'
    ORDER BY demand_score DESC, published_at DESC
    LIMIT 60`;

  return NextResponse.json({
    version: 1,
    generatedAt: new Date().toISOString(),
    filterRequirements: settings.filter_requirements,
    confidenceThreshold: Number(settings.ai_confidence_threshold) || 75,
    items: rows.map(row => ({
      id: String(row.id),
      body: String(row.body || "").slice(0, 4000),
      content_type: String(row.content_type || "貼文").slice(0, 40),
      keywords: Array.isArray(row.keywords) ? row.keywords.map(String).slice(0, 30) : []
    }))
  }, { headers: { "Cache-Control": "no-store" } });
}
