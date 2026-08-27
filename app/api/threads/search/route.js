import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { decryptSession, THREADS_SESSION_COOKIE } from "../../../../lib/threads-session";
import { accountWithToken } from "../../../../lib/accounts";

export const runtime = "nodejs";

async function searchThreads(query, searchType, accessToken) {
  const url = new URL("https://graph.threads.net/keyword_search");
  url.search = new URLSearchParams({
    q: query,
    search_type: searchType,
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

  let recentItems;
  let topItems = [];
  try {
    recentItems = await searchThreads(query, "RECENT", accessToken);
    if (recentItems.length === 0) {
      topItems = await searchThreads(query, "TOP", accessToken);
    }
  } catch (error) {
    return NextResponse.json({
      error: error.message,
      metaCode: error.code || null
    }, { status: error.status || 502 });
  }

  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const seen = new Set();
  const sourceItems = recentItems.length > 0 ? recentItems : topItems;
  let missingTimestamp = 0;
  let olderThanSevenDays = 0;
  const results = sourceItems.filter(item => {
    if (!item.id || seen.has(item.id)) return false;
    seen.add(item.id);
    const timestamp = Date.parse(item.timestamp);
    if (!Number.isFinite(timestamp)) {
      missingTimestamp += 1;
      return false;
    }
    if (timestamp < cutoff) {
      olderThanSevenDays += 1;
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

  return NextResponse.json({
    query,
    results,
    diagnostics: {
      mode: recentItems.length > 0 ? "RECENT" : "TOP_FALLBACK",
      recentRawCount: recentItems.length,
      topRawCount: topItems.length,
      missingTimestamp,
      olderThanSevenDays
    }
  }, { headers: { "Cache-Control": "no-store" } });
}

