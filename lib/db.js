import { neon } from "@neondatabase/serverless";

let client;
let initialized;

export function db() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured.");
  if (!client) client = neon(process.env.DATABASE_URL);
  return client;
}

export async function ensureSchema() {
  if (!initialized) initialized = createSchema().catch(error => {
    initialized = null;
    throw error;
  });
  return initialized;
}

async function createSchema() {
  const sql = db();
  await sql`
    CREATE TABLE IF NOT EXISTS threads_accounts (
      threads_user_id TEXT PRIMARY KEY,
      username TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('owner','user')),
      token_cipher TEXT NOT NULL,
      token_expires_at TIMESTAMPTZ NOT NULL,
      collection_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
  await sql`
    CREATE TABLE IF NOT EXISTS collector_settings (
      threads_user_id TEXT PRIMARY KEY REFERENCES threads_accounts(threads_user_id) ON DELETE CASCADE,
      keywords JSONB NOT NULL DEFAULT '["空氣清淨機","空清","過敏","PM2.5","新家入住"]'::jsonb,
      target_per_day INTEGER NOT NULL DEFAULT 200 CHECK (target_per_day BETWEEN 1 AND 1000),
      schedule TEXT NOT NULL DEFAULT '08:30',
      timezone TEXT NOT NULL DEFAULT 'Asia/Taipei',
      tone TEXT NOT NULL DEFAULT '專業親切',
      offer TEXT NOT NULL DEFAULT '提供快速回覆與一對一需求評估',
      active BOOLEAN NOT NULL DEFAULT TRUE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
  await sql`
    CREATE TABLE IF NOT EXISTS leads (
      id BIGSERIAL PRIMARY KEY,
      threads_user_id TEXT NOT NULL REFERENCES threads_accounts(threads_user_id) ON DELETE CASCADE,
      threads_id TEXT NOT NULL,
      username TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL DEFAULT '',
      published_at TIMESTAMPTZ NOT NULL,
      permalink TEXT NOT NULL DEFAULT '',
      content_type TEXT NOT NULL DEFAULT '貼文',
      parent_threads_id TEXT NOT NULL DEFAULT '',
      keywords JSONB NOT NULL DEFAULT '[]'::jsonb,
      content_hash TEXT NOT NULL,
      demand_score INTEGER NOT NULL DEFAULT 0,
      demand_level TEXT NOT NULL DEFAULT '低需求',
      demand_reason TEXT NOT NULL DEFAULT '',
      suggested_copy TEXT NOT NULL DEFAULT '',
      copy_source TEXT NOT NULL DEFAULT 'rules',
      status TEXT NOT NULL DEFAULT '待聯繫',
      collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (threads_user_id, threads_id),
      UNIQUE (threads_user_id, content_hash)
    )`;
  await sql`CREATE INDEX IF NOT EXISTS leads_user_published_idx ON leads(threads_user_id, published_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS leads_user_level_idx ON leads(threads_user_id, demand_level)`;
  await sql`
    CREATE TABLE IF NOT EXISTS collection_runs (
      id TEXT PRIMARY KEY,
      threads_user_id TEXT NOT NULL REFERENCES threads_accounts(threads_user_id) ON DELETE CASCADE,
      idempotency_key TEXT UNIQUE,
      trigger_type TEXT NOT NULL,
      status TEXT NOT NULL,
      target_count INTEGER NOT NULL DEFAULT 200,
      raw_count INTEGER NOT NULL DEFAULT 0,
      inserted_count INTEGER NOT NULL DEFAULT 0,
      duplicate_count INTEGER NOT NULL DEFAULT 0,
      too_old_count INTEGER NOT NULL DEFAULT 0,
      details JSONB NOT NULL DEFAULT '{}'::jsonb,
      error TEXT,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      finished_at TIMESTAMPTZ
    )`;
  await sql`
    CREATE TABLE IF NOT EXISTS collection_locks (
      threads_user_id TEXT PRIMARY KEY REFERENCES threads_accounts(threads_user_id) ON DELETE CASCADE,
      locked_until TIMESTAMPTZ NOT NULL,
      run_id TEXT NOT NULL
    )`;
  await sql`
    CREATE TABLE IF NOT EXISTS dismissed_items (
      threads_user_id TEXT NOT NULL REFERENCES threads_accounts(threads_user_id) ON DELETE CASCADE,
      fingerprint TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      PRIMARY KEY (threads_user_id, fingerprint)
    )`;
}
