import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { decryptSession, THREADS_SESSION_COOKIE } from "../../../../lib/threads-session";

export const runtime = "nodejs";

export async function GET(request) {
  const store = await cookies();
  const session = decryptSession(store.get(THREADS_SESSION_COOKIE)?.value || "");
  if (!session) {
    return NextResponse.json({ error: "Please connect a Threads account first." }, { status: 401 });
  }

  const query = new URL(request.url).searchParams.get("q")?.trim() || "";
  if (query.length < 1 || query.length > 100) {
    return NextResponse.json({ error: "Enter a keyword between 1 and 100 characters." }, { status: 400 });
  }

  const url = new URL("https://graph.threads.net/keyword_search");
  url.search = new URLSearchParams({
    q: query,
    search_type: "RECENT",
    limit: "25",
    fields: "id,username,text,timestamp,permalink,is_reply",
    access_token: session.accessToken
  }).toString();

  const response = await fetch(url, { cache: "no-store" });
  const body = await response.json();
  if (!response.ok) {
    return NextResponse.json({
      error: body.error?.message || "Threads keyword search failed."
    }, { status: response.status });
  }

  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const seen = new Set();
  const results = (body.data || []).filter(item => {
    if (!item.id || seen.has(item.id)) return false;
    seen.add(item.id);
    const timestamp = Date.parse(item.timestamp);
    return Number.isFinite(timestamp) && timestamp >= cutoff;
  }).map(item => ({
    id: item.id,
    username: item.username || "",
    text: item.text || "",
    timestamp: item.timestamp,
    permalink: item.permalink || "",
    contentType: item.is_reply ? "留言" : "貼文"
  }));

  return NextResponse.json({ query, results }, { headers: { "Cache-Control": "no-store" } });
}

