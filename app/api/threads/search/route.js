import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { decryptSession, THREADS_SESSION_COOKIE } from "../../../../lib/threads-session";
import { accountWithToken } from "../../../../lib/accounts";
import { classifyRelevanceBatch, RELEVANCE_BATCH_LIMIT } from "../../../../lib/ai-relevance";
import { collectionCutoffTimestamp, collectionWindowDays } from "../../../../lib/collection-window";
import { db, ensureSchema } from "../../../../lib/db";
import { usesLocalCodex } from "../../../../lib/ai-provider";

export const runtime = "nodejs";
export const maxDuration = 60;

function chunks(values, size) {
  const output = [];
  for (let index = 0; index < values.length; index += size) output.push(values.slice(index, index + size));
  return output;
}

function publicAIError(error) {
  const message = String(error?.message || error || "AI 語意分析失敗");
  if (error?.code === "insufficient_quota" || /quota|billing|credit balance/i.test(message)) {
    return "OpenAI API 額度不足，為避免顯示不相關內容，本次搜尋不會顯示未經 AI 判定的結果。";
  }
  if (error?.status === 401) return "OPENAI_API_KEY 無效，本次搜尋結果未顯示。";
  if (error?.status === 429) return "AI 目前流量受限，請稍後再搜尋；未判定內容不會顯示。";
  return "AI 語意分析未完成，為避免顯示不相關內容，本次搜尋結果未顯示。";
}

async function searchThreads(query, searchType, accessToken, { since, until }) {
  const url = new URL("https://graph.threads.net/keyword_search");
  url.search = new URLSearchParams({
    q: query,
    search_type: searchType,
    since: String(Math.floor(since / 1000)),
    until: String(Math.floor(until / 1000)),
    limit: "25",
    fields: "id,username,text,timestamp,permalink,is_reply",
    access_token: accessToken
  }).toString();

  const response = await fetch(url, { cache: "no-store" });
  const body = await response.json();
  if (!response.ok) {
    const error = new Error(body.error?.message || "Threads keyword search failed.");
    error.status = response.status;
    error.code = body.error?.code;
    throw error;
  }
  return Array.isArray(body.data) ? body.data : [];
}

export async function GET(request) {
  const store = await cookies();
  const session = decryptSession(store.get(THREADS_SESSION_COOKIE)?.value || "");
  if (!session) {
    return NextResponse.json({ error: "Please connect a Threads account first." }, { status: 401 });
  }
  const accessToken = session.accessToken || (await accountWithToken(session.userId))?.accessToken;
  if (!accessToken) {
    return NextResponse.json({ error: "Please reconnect your Threads account." }, { status: 401 });
  }

  const query = new URL(request.url).searchParams.get("q")?.trim() || "";
  if (query.length < 1 || query.length > 100) {
    return NextResponse.json({ error: "Enter a keyword between 1 and 100 characters." }, { status: 400 });
  }

  await ensureSchema();
  const sql = db();
  const settingRows = await sql`
    SELECT ai_filter_enabled, filter_requirements, ai_confidence_threshold, collection_days
    FROM collector_settings WHERE threads_user_id=${session.userId} LIMIT 1`;
  const settings = settingRows[0];
  const collectionDays = collectionWindowDays(settings?.collection_days);
  const searchNow = Date.now();
  const cutoff = collectionCutoffTimestamp(collectionDays, searchNow);
  if (!settings?.ai_filter_enabled) {
    return NextResponse.json({
      error: "請先到商機工作台啟用 AI 語意篩選，再執行搜尋。",
      results: []
    }, { status: 409 });
  }
  if (usesLocalCodex()) {
    return NextResponse.json({
      error: "目前使用本機 Codex 排程分析。請到商機工作台按「立即蒐集」；候選內容完成本機判定後才會顯示。",
      results: []
    }, { status: 409 });
  }
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({
      error: "尚未設定 OPENAI_API_KEY；為避免顯示未經分析的內容，本次搜尋結果未顯示。",
      results: []
    }, { status: 503 });
  }

  let recentItems;
  let topItems = [];
  try {
    recentItems = await searchThreads(query, "RECENT", accessToken, { since: cutoff, until: searchNow });
    if (recentItems.length === 0) {
      topItems = await searchThreads(query, "TOP", accessToken, { since: cutoff, until: searchNow });
    }
  } catch (error) {
    return NextResponse.json({
      error: error.message,
      metaCode: error.code || null
    }, { status: error.status || 502 });
  }

  const seen = new Set();
  const sourceItems = recentItems.length > 0 ? recentItems : topItems;
  let missingTimestamp = 0;
  let outsideCollectionWindow = 0;
  const candidates = sourceItems.filter(item => {
    if (!item.id || seen.has(item.id)) return false;
    seen.add(item.id);
    const timestamp = Date.parse(item.timestamp);
    if (!Number.isFinite(timestamp)) {
      missingTimestamp += 1;
      return false;
    }
    if (timestamp < cutoff) {
      outsideCollectionWindow += 1;
      return false;
    }
    return true;
  }).map(item => ({
    id: item.id,
    username: item.username || "",
    text: item.text || "",
    timestamp: item.timestamp,
    permalink: item.permalink || "",
    contentType: item.is_reply ? "留言" : "貼文"
  }));

  let decisions = [];
  try {
    const batches = chunks(candidates, RELEVANCE_BATCH_LIMIT);
    decisions = (await Promise.all(batches.map(batch => classifyRelevanceBatch(
      batch.map(item => ({
        id: item.id,
        body: item.text,
        content_type: item.contentType,
        keywords: [query]
      })),
      {
        filterRequirements: settings.filter_requirements,
        confidenceThreshold: Number(settings.ai_confidence_threshold) || 75
      }
    )))).flat();
  } catch (error) {
    return NextResponse.json({
      error: publicAIError(error),
      results: [],
      diagnostics: {
        mode: recentItems.length > 0 ? "RECENT" : "TOP_FALLBACK",
        recentRawCount: recentItems.length,
        topRawCount: topItems.length,
        candidateCount: candidates.length,
        acceptedCount: 0,
        rejectedCount: 0,
        missingTimestamp,
        outsideCollectionWindow,
        collectionDays,
        aiStatus: "failed"
      }
    }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  const decisionsById = new Map(decisions.map(item => [item.id, item]));
  const results = candidates.flatMap(item => {
    const decision = decisionsById.get(item.id);
    if (!decision?.accepted) return [];
    return [{
      ...item,
      aiConfidence: decision.confidence,
      relevanceReason: decision.relevance_reason,
      demandScore: decision.demand_score,
      demandReason: decision.demand_reason
    }];
  });

  return NextResponse.json({
    query,
    results,
    diagnostics: {
      mode: recentItems.length > 0 ? "RECENT" : "TOP_FALLBACK",
      recentRawCount: recentItems.length,
      topRawCount: topItems.length,
      candidateCount: candidates.length,
      acceptedCount: results.length,
      rejectedCount: Math.max(0, candidates.length - results.length),
      missingTimestamp,
      outsideCollectionWindow,
      collectionDays,
      aiStatus: "complete",
      confidenceThreshold: Number(settings.ai_confidence_threshold) || 75
    }
  }, { headers: { "Cache-Control": "no-store" } });
}

