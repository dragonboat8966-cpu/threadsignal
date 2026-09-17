import { NextResponse } from "next/server";
import { authorizeLocalDownload } from "../../../../lib/local-analyzer-auth";
import { localAnalyzerOwner } from "../../../../lib/local-analyzer-owner";
import { collectionWindowDays } from "../../../../lib/collection-window";
import { db, ensureSchema } from "../../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request) {
  try {
    if (!authorizeLocalDownload(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  } catch {
    return NextResponse.json({ error: "本機分析密鑰尚未設定。" }, { status: 503 });
  }

  await ensureSchema();
  const sql = db();
  const requestedUserId = new URL(request.url).searchParams.get("userId") || "";
  if (requestedUserId && !/^[A-Za-z0-9_-]{1,128}$/.test(requestedUserId)) {
    return NextResponse.json({ error: "工作區帳號格式無效。" }, { status: 400 });
  }
  const userId = requestedUserId || await localAnalyzerOwner();
  if (!userId) return NextResponse.json({ error: "找不到已啟用的本機分析工作區。" }, { status: 404 });

  const settingRows = await sql`
    SELECT s.active, s.ai_provider, s.ai_filter_enabled, s.filter_requirements,
      s.ai_confidence_threshold, s.collection_days, a.username
    FROM collector_settings AS s
    JOIN threads_accounts AS a ON a.threads_user_id=s.threads_user_id
    WHERE s.threads_user_id=${userId} AND a.collection_enabled=TRUE
      AND s.ai_provider='local_codex'
    LIMIT 1`;
  const settings = settingRows[0];
  if (!settings) return NextResponse.json({ error: "找不到蒐集設定，請先在網站儲存設定。" }, { status: 404 });
  const collectionDays = collectionWindowDays(settings?.collection_days);
  const collection = { skipped: true, reason: "自動蒐集已由獨立的多人背景循環執行" };
  if (settings.active === false || !settings?.ai_filter_enabled) {
    return NextResponse.json({
      version: 1,
      userId,
      username: settings.username || "",
      generatedAt: new Date().toISOString(),
      collection,
      items: [],
      disabled: !settings?.ai_filter_enabled,
      paused: settings.active === false
    });
  }

  const rows = await sql`
    SELECT id, body, content_type, keywords
    FROM leads
    WHERE threads_user_id=${userId}
      AND classification_source='pending'
      AND published_at >= NOW() - (${collectionDays} * INTERVAL '1 day')
    ORDER BY demand_score DESC, published_at DESC
    LIMIT 60`;

  return NextResponse.json({
    version: 1,
    userId,
    username: settings.username || "",
    generatedAt: new Date().toISOString(),
    filterRequirements: settings.filter_requirements,
    confidenceThreshold: Number(settings.ai_confidence_threshold) || 75,
    collectionDays,
    collection,
    items: rows.map(row => ({
      id: String(row.id),
      body: String(row.body || "").slice(0, 4000),
      content_type: String(row.content_type || "貼文").slice(0, 40),
      keywords: Array.isArray(row.keywords) ? row.keywords.map(String).slice(0, 30) : []
    }))
  }, { headers: { "Cache-Control": "no-store" } });
}
