import { db, ensureSchema } from "./db";
import { decryptToken, encryptToken } from "./token-vault";

async function ownerRole(sql, userId, username) {
  const ownerId = String(process.env.OWNER_THREADS_USER_ID || "").trim();
  if (ownerId && ownerId === userId) return "owner";

  const existing = await sql`SELECT role FROM threads_accounts WHERE threads_user_id=${userId} LIMIT 1`;
  if (existing[0]?.role === "owner") return "owner";

  // Username is used only once to bootstrap the first owner. After that, the
  // immutable Threads user ID stored in the database is authoritative.
  const bootstrapName = String(process.env.OWNER_THREADS_USERNAME || "").trim().toLowerCase();
  if (bootstrapName && bootstrapName === String(username || "").toLowerCase()) {
    const owners = await sql`SELECT 1 FROM threads_accounts WHERE role='owner' LIMIT 1`;
    if (!owners.length) return "owner";
  }
  return "user";
}

export async function saveAuthorizedAccount({ userId, username, accessToken, expiresAt }) {
  await ensureSchema();
  const sql = db();
  if (!userId) throw new Error("Threads did not return a user ID.");
  const role = await ownerRole(sql, userId, username);
  const cipher = encryptToken(accessToken);
  await sql`
    INSERT INTO threads_accounts (threads_user_id, username, role, token_cipher, token_expires_at)
    VALUES (${userId}, ${username}, ${role}, ${cipher}, ${new Date(expiresAt).toISOString()})
    ON CONFLICT (threads_user_id) DO UPDATE SET
      username = EXCLUDED.username,
      role = EXCLUDED.role,
      token_cipher = EXCLUDED.token_cipher,
      token_expires_at = EXCLUDED.token_expires_at,
      collection_enabled = TRUE,
      updated_at = NOW()`;
  await sql`
    INSERT INTO collector_settings (threads_user_id)
    VALUES (${userId})
    ON CONFLICT (threads_user_id) DO NOTHING`;
}

export async function deleteAuthorizedAccount(userId) {
  if (!userId) return;
  await ensureSchema();
  const sql = db();
  await sql`UPDATE threads_accounts SET collection_enabled=FALSE, updated_at=NOW() WHERE threads_user_id=${userId}`;
  await sql`DELETE FROM collection_locks WHERE threads_user_id=${userId}`;
  await sql`DELETE FROM dismissed_items WHERE threads_user_id=${userId}`;
  await sql`DELETE FROM threads_accounts WHERE threads_user_id=${userId}`;
}

export async function accountWithToken(userId) {
  await ensureSchema();
  const sql = db();
  const rows = await sql`
    SELECT threads_user_id, username, role, token_cipher, token_expires_at, collection_enabled
    FROM threads_accounts WHERE threads_user_id = ${userId} LIMIT 1`;
  if (!rows[0]) return null;
  return { ...rows[0], accessToken: decryptToken(rows[0].token_cipher) };
}

export async function refreshAccountToken(account) {
  const expiresAt = new Date(account.token_expires_at).getTime();
  if (expiresAt - Date.now() > 7 * 24 * 60 * 60 * 1000) return account;
  const url = new URL("https://graph.threads.net/refresh_access_token");
  url.search = new URLSearchParams({ grant_type: "th_refresh_token", access_token: account.accessToken }).toString();
  const response = await fetch(url, { cache: "no-store" });
  const data = await response.json();
  if (!response.ok || !data.access_token) throw new Error(data.error?.message || "Threads token refresh failed.");
  const nextExpiresAt = Date.now() + (Number(data.expires_in) || 60 * 24 * 60 * 60) * 1000;
  const cipher = encryptToken(data.access_token);
  const sql = db();
  await sql`UPDATE threads_accounts SET token_cipher=${cipher}, token_expires_at=${new Date(nextExpiresAt).toISOString()}, updated_at=NOW() WHERE threads_user_id=${account.threads_user_id}`;
  return { ...account, accessToken: data.access_token, token_expires_at: new Date(nextExpiresAt).toISOString() };
}
