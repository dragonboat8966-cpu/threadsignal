import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { decryptSession, THREADS_SESSION_COOKIE } from "../../../../../lib/threads-session";
import { deleteAuthorizedAccount } from "../../../../../lib/accounts";

export const runtime = "nodejs";

export async function POST() {
  const store = await cookies();
  const session = decryptSession(store.get(THREADS_SESSION_COOKIE)?.value || "");
  if (session?.userId) await deleteAuthorizedAccount(session.userId);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(THREADS_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0
  });
  return response;
}

