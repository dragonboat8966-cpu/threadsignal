import { cookies } from "next/headers";
import { decryptSession, THREADS_SESSION_COOKIE } from "./threads-session";
import { db, ensureSchema } from "./db";

export async function currentSession() {
  const store = await cookies();
  return decryptSession(store.get(THREADS_SESSION_COOKIE)?.value || "");
}

export async function requireOwner() {
  const session = await currentSession();
  if (!session?.userId) return null;
  await ensureSchema();
  const sql = db();
  const rows = await sql`SELECT threads_user_id, username, role FROM threads_accounts WHERE threads_user_id = ${session.userId} LIMIT 1`;
  if (rows[0]?.role !== "owner") return null;
  return { ...session, account: rows[0] };
}
