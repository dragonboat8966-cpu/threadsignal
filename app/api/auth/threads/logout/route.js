import { NextResponse } from "next/server";
import { THREADS_SESSION_COOKIE } from "../../../../../lib/threads-session";

export async function POST(request) {
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

