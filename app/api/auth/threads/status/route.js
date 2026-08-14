import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { decryptSession, THREADS_SESSION_COOKIE } from "../../../../../lib/threads-session";

export const runtime = "nodejs";

export async function GET() {
  const store = await cookies();
  const session = decryptSession(store.get(THREADS_SESSION_COOKIE)?.value || "");
  return NextResponse.json({
    connected: Boolean(session),
    username: session?.username || "",
    expiresAt: session?.expiresAt || null
  }, { headers: { "Cache-Control": "no-store" } });
}

