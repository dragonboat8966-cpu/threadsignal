import crypto from "node:crypto";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request) {
  const appId = process.env.THREADS_APP_ID;
  if (!appId) {
    return NextResponse.json({ error: "THREADS_APP_ID is not configured." }, { status: 500 });
  }

  const origin = new URL(request.url).origin;
  const redirectUri = process.env.THREADS_REDIRECT_URI || `${origin}/auth/threads/callback`;
  const state = crypto.randomBytes(24).toString("base64url");
  const authorize = new URL("https://threads.net/oauth/authorize");
  authorize.search = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    scope: "threads_basic,threads_keyword_search",
    response_type: "code",
    state
  }).toString();

  const response = NextResponse.redirect(authorize);
  response.cookies.set("threadsignal_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60
  });
  return response;
}

