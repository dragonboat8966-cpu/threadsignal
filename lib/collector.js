import crypto from "node:crypto";
import { accountWithToken, refreshAccountToken } from "./accounts";
import { collectionCutoffTimestamp, collectionWindowDays } from "./collection-window";
import { db, ensureSchema } from "./db";

function classify(text, keyword) {
  const normalized = String(text || "").toLowerCase();
  const urgent = ["急", "今天", "立刻", "馬上", "盡快", "預算", "報價", "私訊", "徵求", "urgent", "asap", "quote", "budget"];
  const intent = ["想找", "需要", "推薦", "有人可以", "求", "尋找", "請問", "looking for", "need", "recommend"];
  let score = 38 + Math.min(normalized.length, 80) / 5;
  score += urgent.filter(term => normalized.includes(term)).length * 10;
  score += intent.filter(term => normalized.includes(term)).length * 6;
  if (keyword && normalized.includes(keyword.toLowerCase())) score += 8;
  score = Math.max(12, Math.min(99, Math.round(score)));
  return {
    score,
    level: score >= 80 ? "高需求" : score >= 58 ? "中需求" : "低需求",
    reason: score >= 80 ? "包含明確需求與時間或報價訊號" : score >= 58 ? "有需求意圖，但條件尚未完整" : "偏向資訊探索或一般討論"
  };
}

function fallbackCopy(item, settings) {
  const opener = item.demand_score >= 80 ? "看到你正在找相關協助，這個需求我們可以快速幫上忙。" : "看到你的分享，這題剛好是我們熟悉的領域。";
  const normalized = String(item.body || "").replace(/\s+/g, " ").trim();
  const subject = normalized ? `你提到「${normalized.slice(0, 56)}${normalized.length > 56 ? "…" : ""}」` : "你目前關心的問題";
  const keywordHint = item.keywords?.[0] ? `，尤其是「${item.keywords[0]}」這一塊` : "";
  return `${opener}\n\n針對${subject}${keywordHint}，${settings.offer || "可以先協助釐清需求並提供建議"}，會依實際情況提供具體方向，不會硬推方案。方便的話可以分享需求、預算與希望完成的時間，我再協助評估。`;
}

function contentHash(username, text) {
  return crypto.createHash("sha256").update(`${String(username || "").toLowerCase()}|${String(text || "").trim()}`).digest("hex");
}

function dismissalFingerprint(userId, threadsId) {
  return crypto.createHmac("sha256", process.env.TOKEN_ENCRYPTION_KEY || process.env.SESSION_SECRET).update(`${userId}|${threadsId}`).digest("hex");
}

function safePermalink(value) {
  try {
    const url = new URL(value || "");
    return ["threads.net", "www.threads.net", "threads.com", "www.threads.com"].includes(url.hostname) ? url.href : "";
  } catch {
    return "";
  }
}

function taipeiHour() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date());
  const value = type => parts.find(part => part.type === type)?.value || "";
  return `${value("year")}-${value("month")}-${value("day")}T${value("hour")}`;
}

async function fetchThreadsPage(url) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6_000);
    try {
      const response = await fetch(url, { cache: "no-store", signal: controller.signal });
      const result = await response.json();
      if (response.ok) return result;
      const error = new Error(result.error?.message || `Threads API ${response.status}`);
      error.retryable = response.status === 429 || response.status >= 500;
      throw error;
    } catch (error) {
      lastError = error.name === "AbortError" ? new Error("Threads API 連線逾時") : error;
      if (attempt === 1 || error.retryable === false) break;
      await new Promise(resolve => setTimeout(resolve, 350 * (attempt + 1)));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError || new Error("Threads API 搜尋失敗");
}

export async function collectAccount(userId, { triggerType = "manual" } = {}) {
  await ensureSchema();
  const sql = db();
  const runId = crypto.randomUUID();
  const idempotencyKey = ["cron", "local_hourly"].includes(triggerType)
    ? `hourly:${userId}:${taipeiHour()}`
    : null;
  const runRows = await sql`
    INSERT INTO collection_runs (id, threads_user_id, idempotency_key, trigger_type, status)
    VALUES (${runId}, ${userId}, ${idempotencyKey}, ${triggerType}, 'running')
    ON CONFLICT (idempotency_key) DO UPDATE SET
      id=EXCLUDED.id,
      trigger_type=EXCLUDED.trigger_type,
      status='running',
      raw_count=0,
      inserted_count=0,
      duplicate_count=0,
      too_old_count=0,
      accepted_count=0,
      rejected_count=0,
      pending_count=0,
      details='{}'::jsonb,
      error=NULL,
      started_at=NOW(),
      finished_at=NULL
    WHERE collection_runs.status IN ('failed','skipped')
       OR collection_runs.started_at < NOW() - INTERVAL '5 minutes'
    RETURNING id`;
  if (!runRows.length) return { skipped: true, reason: "本小時的自動蒐集已執行" };

  const lockRows = await sql`
    INSERT INTO collection_locks (threads_user_id, locked_until, run_id)
    VALUES (${userId}, NOW() + INTERVAL '4 minutes', ${runId})
    ON CONFLICT (threads_user_id) DO UPDATE SET locked_until=EXCLUDED.locked_until, run_id=EXCLUDED.run_id
    WHERE collection_locks.locked_until < NOW()
    RETURNING run_id`;
  if (!lockRows.length) {
    await sql`UPDATE collection_runs SET status='skipped', error='另一個蒐集工作正在執行', finished_at=NOW() WHERE id=${runId}`;
    return { skipped: true, reason: "另一個蒐集工作正在執行" };
  }

  let rawCount = 0, duplicateCount = 0, tooOldCount = 0;
  const started = Date.now();
  try {
    let account = await accountWithToken(userId);
    if (!account?.collection_enabled) throw new Error("Threads 自動蒐集尚未啟用，請重新連線。");
    account = await refreshAccountToken(account);
    const settingRows = await sql`SELECT * FROM collector_settings WHERE threads_user_id=${userId} LIMIT 1`;
    const settings = settingRows[0];
    const keywords = (Array.isArray(settings?.keywords) ? settings.keywords : []).map(String).map(value => value.trim()).filter(Boolean).slice(0, 30);
    if (!keywords.length) throw new Error("請先設定至少一個關鍵字。");
    const target = Math.max(1, Math.min(1000, Number(settings.target_per_day) || 200));
    const collectionDays = collectionWindowDays(settings.collection_days);
    const semanticFilterEnabled = settings.ai_filter_enabled !== false;
    // Keyword search only creates candidates. When semantic filtering is on,
    // Oversample so AI rejection does not leave the configured run target starved.
    const fetchTarget = semanticFilterEnabled ? Math.min(1000, Math.max(target * 3, target + 100)) : target;
    await sql`UPDATE collection_runs SET target_count=${target} WHERE id=${runId}`;
    await sql`DELETE FROM leads WHERE threads_user_id=${userId} AND published_at < NOW() - (${collectionDays} * INTERVAL '1 day')`;
    await sql`DELETE FROM dismissed_items WHERE threads_user_id=${userId} AND expires_at < NOW()`;

    const existingRows = await sql`SELECT threads_id, content_hash FROM leads WHERE threads_user_id=${userId}`;
    const existingIds = new Set(existingRows.map(row => row.threads_id));
    const existingHashes = new Set(existingRows.map(row => row.content_hash));
    const dismissedRows = await sql`SELECT fingerprint FROM dismissed_items WHERE threads_user_id=${userId}`;
    const dismissed = new Set(dismissedRows.map(row => row.fingerprint));
    const items = new Map();
    const searchNow = Date.now();
    const cutoff = collectionCutoffTimestamp(collectionDays, searchNow);
    const states = keywords.map(keyword => {
      const url = new URL("https://graph.threads.net/keyword_search");
      url.search = new URLSearchParams({
        q: keyword,
        search_type: "RECENT",
        since: String(Math.floor(cutoff / 1000)),
        until: String(Math.floor(searchNow / 1000)),
        limit: "100",
        fields: "id,username,text,timestamp,permalink,is_reply,root_post,replied_to",
        access_token: account.accessToken
      }).toString();
      return { keyword, url, pages: 0, done: false, error: null };
    });

    while (items.size < fetchTarget && states.some(state => !state.done) && Date.now() - started < 48_000) {
      for (const state of states) {
        if (state.done || items.size >= fetchTarget || Date.now() - started >= 48_000) continue;
        try {
          const result = await fetchThreadsPage(state.url);
          const page = Array.isArray(result.data) ? result.data : [];
          rawCount += page.length;
          for (const item of page) {
            const threadsId = String(item.id || "");
            const published = Date.parse(item.timestamp);
            if (!threadsId || !Number.isFinite(published) || published < cutoff || published > Date.now() + 5 * 60 * 1000) {
              tooOldCount += 1;
              continue;
            }
            const hash = contentHash(item.username, item.text);
            if (existingIds.has(threadsId) || existingHashes.has(hash) || dismissed.has(dismissalFingerprint(userId, threadsId))) {
              duplicateCount += 1;
              continue;
            }
            const prior = items.get(threadsId);
            if (prior) {
              prior.keywords = [...new Set([...prior.keywords, state.keyword])];
              duplicateCount += 1;
              continue;
            }
            const demand = classify(item.text || "", state.keyword);
            const prepared = {
              threads_id: threadsId,
              username: String(item.username || "").slice(0, 200),
              body: String(item.text || "").slice(0, 10000),
              published_at: new Date(published).toISOString(),
              permalink: safePermalink(item.permalink),
              content_type: item.is_reply ? "留言" : "貼文",
              parent_threads_id: String(item.root_post?.id || item.replied_to?.id || ""),
              keywords: [state.keyword],
              content_hash: hash,
              demand_score: demand.score,
              demand_level: demand.level,
              demand_reason: demand.reason,
              ai_match: semanticFilterEnabled ? null : true,
              ai_confidence: semanticFilterEnabled ? null : 100,
              relevance_reason: semanticFilterEnabled ? "等待 AI 語意判定" : "AI 語意篩選已關閉",
              classification_source: semanticFilterEnabled ? "pending" : "rules"
            };
            prepared.suggested_copy = fallbackCopy(prepared, settings);
            items.set(threadsId, prepared);
          }
          state.pages += 1;
          state.url = result.paging?.next && state.pages < 10 ? new URL(result.paging.next) : null;
          state.done = !state.url || page.length === 0;
        } catch (error) {
          state.error = String(error.message || error).slice(0, 300);
          state.done = true;
        }
      }
    }

    if (states.every(state => state.error)) {
      throw new Error(`所有關鍵字搜尋都失敗：${states[0]?.error || "Threads API 無回應"}`);
    }

    const rows = [...items.values()];
    let insertedCount = 0;
    if (rows.length) {
      const inserted = await sql`
        INSERT INTO leads (threads_user_id, threads_id, username, body, published_at, permalink, content_type,
          parent_threads_id, keywords, content_hash, demand_score, demand_level, demand_reason, suggested_copy,
          ai_match, ai_confidence, relevance_reason, classification_source, classified_at)
        SELECT ${userId}, x.threads_id, x.username, x.body, x.published_at::timestamptz, x.permalink,
          x.content_type, x.parent_threads_id, x.keywords, x.content_hash, x.demand_score,
          x.demand_level, x.demand_reason, x.suggested_copy, x.ai_match, x.ai_confidence,
          x.relevance_reason, x.classification_source,
          CASE WHEN x.classification_source='rules' THEN NOW() ELSE NULL END
        FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS x(
          threads_id text, username text, body text, published_at text, permalink text, content_type text,
          parent_threads_id text, keywords jsonb, content_hash text, demand_score integer,
          demand_level text, demand_reason text, suggested_copy text, ai_match boolean,
          ai_confidence integer, relevance_reason text, classification_source text)
        ON CONFLICT DO NOTHING RETURNING id`;
      insertedCount = inserted.length;
    }
    const acceptedCount = semanticFilterEnabled ? 0 : insertedCount;
    const pendingCount = semanticFilterEnabled ? insertedCount : 0;
    const details = {
      keywordErrors: states.filter(state => state.error).map(state => ({ keyword: state.keyword, error: state.error })),
      exhausted: states.every(state => state.done),
      semanticFilterEnabled,
      collectionDays,
      fetchTarget
    };
    await sql`UPDATE collection_runs SET status='complete', raw_count=${rawCount}, inserted_count=${insertedCount}, duplicate_count=${duplicateCount}, too_old_count=${tooOldCount}, accepted_count=${acceptedCount}, pending_count=${pendingCount}, details=${JSON.stringify(details)}::jsonb, finished_at=NOW() WHERE id=${runId}`;
    return {
      runId,
      target,
      collectionDays,
      rawCount,
      insertedCount,
      candidateCount: insertedCount,
      acceptedCount,
      rejectedCount: 0,
      pendingCount,
      duplicateCount,
      tooOldCount,
      shortfall: semanticFilterEnabled ? target : Math.max(0, target - insertedCount),
      details
    };
  } catch (error) {
    await sql`UPDATE collection_runs SET status='failed', raw_count=${rawCount}, duplicate_count=${duplicateCount}, too_old_count=${tooOldCount}, error=${String(error.message || error).slice(0, 500)}, finished_at=NOW() WHERE id=${runId}`;
    throw error;
  } finally {
    await sql`DELETE FROM collection_locks WHERE threads_user_id=${userId} AND run_id=${runId}`;
  }
}

export { dismissalFingerprint };
