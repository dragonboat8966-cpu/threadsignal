import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { encryptSession, THREADS_SESSION_COOKIE } from "../../../../lib/threads-session";
import { saveAuthorizedAccount } from "../../../../lib/accounts";

export const runtime = "nodejs";

function redirectWithError(origin, message) {
  const url = new URL("/review-demo", origin);
  url.searchParams.set("error", message);
  return NextResponse.redirect(url);
}

export async function GET(request) {
  const requestUrl = new URL(request.url);
  const origin = requestUrl.origin;
  const code = requestUrl.searchParams.get("code");
  const returnedState = requestUrl.searchParams.get("state");
  const oauthError = requestUrl.searchParams.get("error_message") || requestUrl.searchParams.get("error");
  const store = await cookies();
  const expectedState = store.get("threadsignal_oauth_state")?.value;

  if (oauthError) return redirectWithError(origin, oauthError);
  if (!code) return redirectWithError(origin, "Threads did not return an authorization code.");
  if (!returnedState || !expectedState || returnedState !== expectedState) {
    return redirectWithError(origin, "OAuth state validation failed. Please try connecting again.");
  }

  const appId = process.env.THREADS_APP_ID;
  const secret = process.env.THREADS_APP_SECRET;
  const redirectUri = process.env.THREADS_REDIRECT_URI || `${origin}/auth/threads/callback`;
  if (!appId || !secret) return redirectWithError(origin, "The Threads OAuth server configuration is incomplete.");

  try {
    const tokenUrl = new URL("https://graph.threads.net/oauth/access_token");
    tokenUrl.search = new URLSearchParams({
      client_id: appId,
      client_secret: secret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri
    }).toString();
    const shortResponse = await fetch(tokenUrl, { method: "POST", cache: "no-store" });
    const shortData = await shortResponse.json();
    if (!shortResponse.ok || !shortData.access_token) {
      throw new Error(shortData.error?.message || "Unable to exchange the authorization code.");
    }

    const longUrl = new URL("https://graph.threads.net/access_token");
    longUrl.search = new URLSearchParams({
      grant_type: "th_exchange_token",
      client_secret: secret,
      access_token: shortData.access_token
    }).toString();
    const longResponse = await fetch(longUrl, { cache: "no-store" });
    const longData = await longResponse.json();
    if (!longResponse.ok || !longData.access_token) {
      throw new Error(longData.error?.message || "Unable to exchange the long-lived token.");
    }

    let username = "";
    let profileId = String(shortData.user_id || "");
    const profileUrl = new URL("https://graph.threads.net/me");
    profileUrl.search = new URLSearchParams({
      fields: "id,username",
      access_token: longData.access_token
    }).toString();
    const profileResponse = await fetch(profileUrl, { cache: "no-store" });
    if (profileResponse.ok) {
      const profile = await profileResponse.json();
      username = profile.username || "";
      profileId = String(profile.id || profileId);
    }

    const expiresIn = Number(longData.expires_in) || 60 * 24 * 60 * 60;
    await saveAuthorizedAccount({
      userId: profileId,
      username,
      accessToken: longData.access_token,
      expiresAt: Date.now() + expiresIn * 1000
    });
    const session = encryptSession({
      userId: profileId,
      username,
      expiresAt: Date.now() + expiresIn * 1000
    });
    const response = NextResponse.redirect(new URL("/review-demo?connected=1", origin));
    response.cookies.set(THREADS_SESSION_COOKIE, session, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: expiresIn
    });
    response.cookies.set("threadsignal_oauth_state", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0
    });
    return response;
  } catch (error) {
    console.error("Threads OAuth callback failed", error);
    return redirectWithError(origin, "Threads 連線失敗，請稍後再試；若持續發生，請聯絡服務管理者。");
  }
}

