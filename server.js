const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

loadEnv();
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, "public");
const DATA = path.join(ROOT, "data");
const DB_FILE = path.join(DATA, "db.json");
const PORT = Number(process.env.PORT || 8787);
const DEFAULT_CONFIG = {
  keywords: ["徵求推薦", "有人可以", "急需", "求報價", "想找"],
  target: 200,
  schedule: process.env.COLLECT_AT || "08:30",
  tone: "專業親切",
  offer: "提供快速回覆與一對一需求評估",
  active: true
};
let running = false;
let lastScheduleKey = "";

fs.mkdirSync(DATA, { recursive: true });
if (!fs.existsSync(DB_FILE)) saveDb({ config: DEFAULT_CONFIG, posts: [], runs: [] });

function loadEnv() {
  const file = path.join(__dirname, ".env");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].trim();
  }
}
function readDb() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, "utf8")); }
  catch { return { config: DEFAULT_CONFIG, posts: [], runs: [] }; }
}
function saveDb(db) {
  const tmp = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
}
function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}
function body(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", chunk => {
      raw += chunk;
      if (raw.length > 1_000_000) reject(new Error("Request too large"));
    });
    req.on("end", () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error("JSON 格式錯誤")); }
    });
  });
}
function classify(text, keyword) {
  const t = text.toLowerCase();
  const urgent = ["急", "今天", "立刻", "馬上", "盡快", "預算", "報價", "私訊", "徵求"];
  const intent = ["想找", "需要", "推薦", "有人可以", "求", "尋找", "請問"];
  let score = 38 + Math.min(text.length, 80) / 5;
  score += urgent.filter(x => t.includes(x)).length * 10;
  score += intent.filter(x => t.includes(x)).length * 6;
  if (keyword && t.includes(keyword.toLowerCase())) score += 8;
  score = Math.max(12, Math.min(99, Math.round(score)));
  return {
    score,
    level: score >= 80 ? "高需求" : score >= 58 ? "中需求" : "低需求",
    reason: score >= 80 ? "包含明確需求與時間／報價訊號" : score >= 58 ? "有需求意圖，但條件尚未完整" : "偏向資訊探索或一般討論"
  };
}
function fallbackCopy(post, config) {
  const opener = post.score >= 80 ? "看到你正在找相關協助，這個需求我們可以快速幫上忙。" : "看到你的分享，這題剛好是我們熟悉的領域。";
  return `${opener}\n\n${config.offer || "可以先協助釐清需求並提供建議"}，會依你的情況給具體做法，不會硬推方案。方便的話可以私訊我需求、預算與希望完成的時間，我再幫你評估。`;
}
async function aiCopy(post, config) {
  if (!process.env.OPENAI_API_KEY) return fallbackCopy(post, config);
  const prompt = `你是台灣社群顧問。根據 Threads 貼文，寫一則可直接回覆的繁體中文文案。
語氣：${config.tone}。服務主張：${config.offer}。
限制：80-140字、不假裝與對方認識、不過度承諾、不使用標籤、先回應需求再自然邀請私訊。
貼文：${post.text}`;
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model: process.env.OPENAI_MODEL || "gpt-5-mini", input: prompt })
  });
  if (!response.ok) throw new Error(`OpenAI ${response.status}: ${(await response.text()).slice(0, 160)}`);
  const data = await response.json();
  return data.output_text || fallbackCopy(post, config);
}
function demoPosts(keywords, target) {
  const needs = [
    "最近正在找能協助品牌內容的人，希望這週能開始，有推薦嗎？",
    "想請問大家，有沒有值得合作的行銷團隊？想先了解報價。",
    "急需一位能處理社群內容的夥伴，預算可談，麻煩私訊作品。",
    "正在研究怎麼改善曝光，大家會建議從哪裡開始？",
    "有人可以推薦適合小品牌的服務嗎？希望能一對一討論。",
    "想找專業人士協助規劃，下個月要上線，時間有點趕。",
    "請問這類服務行情大概多少？還在收集資訊。",
    "剛開始做品牌，最近遇到內容產出卡關，想聽聽大家經驗。"
  ];
  const count = Math.max(1, Math.min(Number(target) || 200, 500));
  return Array.from({ length: count }, (_, i) => {
    const keyword = keywords[i % keywords.length];
    const text = `${needs[i % needs.length]}（關鍵字：${keyword}）`;
    return {
      id: `demo-${Date.now()}-${i}`,
      username: ["coffee.studio", "mori_select", "dayday_work", "tinybrand.tw", "hello_creator"][i % 5],
      text,
      timestamp: new Date(Date.now() - i * 240000).toISOString(),
      permalink: "https://www.threads.com/",
      keyword,
      source: "demo"
    };
  });
}
async function threadsPosts(keywords, target) {
  const token = process.env.THREADS_ACCESS_TOKEN;
  if (!token) return demoPosts(keywords, target);
  const posts = new Map();
  const perKeyword = Math.max(20, Math.ceil(target / keywords.length) + 10);
  for (const keyword of keywords) {
    let url = new URL("https://graph.threads.net/keyword_search");
    url.searchParams.set("q", keyword);
    url.searchParams.set("search_type", "RECENT");
    url.searchParams.set("limit", String(Math.min(perKeyword, 100)));
    url.searchParams.set("fields", "id,username,text,timestamp,permalink");
    url.searchParams.set("access_token", token);
    let pages = 0;
    while (url && posts.size < target && pages++ < 10) {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Threads API ${response.status}: ${(await response.text()).slice(0, 240)}`);
      const result = await response.json();
      for (const item of result.data || []) posts.set(item.id, { ...item, keyword, source: "threads" });
      url = result.paging?.next ? new URL(result.paging.next) : null;
    }
  }
  return [...posts.values()].slice(0, target);
}
async function collect(mode = "auto") {
  if (running) throw new Error("蒐集工作正在執行");
  running = true;
  const startedAt = new Date().toISOString();
  try {
    const db = readDb();
    const config = db.config || DEFAULT_CONFIG;
    const raw = mode === "demo" ? demoPosts(config.keywords, config.target) : await threadsPosts(config.keywords, config.target);
    const existing = new Set(db.posts.map(p => p.id));
    const prepared = raw.filter(p => !existing.has(p.id)).map(p => ({ ...p, ...classify(p.text || "", p.keyword), status: "待聯繫" }));
    for (const post of prepared) {
      try { post.copy = await aiCopy(post, config); }
      catch (error) { post.copy = fallbackCopy(post, config); post.aiError = error.message; }
    }
    db.posts = [...prepared, ...db.posts].slice(0, 5000);
    db.runs.unshift({ id: crypto.randomUUID(), startedAt, finishedAt: new Date().toISOString(), count: prepared.length, source: raw[0]?.source || "none", ok: true });
    db.runs = db.runs.slice(0, 60);
    saveDb(db);
    return { count: prepared.length, source: raw[0]?.source || "none" };
  } catch (error) {
    const db = readDb();
    db.runs.unshift({ id: crypto.randomUUID(), startedAt, finishedAt: new Date().toISOString(), count: 0, ok: false, error: error.message });
    saveDb(db);
    throw error;
  } finally { running = false; }
}
function stats(db) {
  const today = new Date().toISOString().slice(0, 10);
  const todays = db.posts.filter(p => String(p.timestamp).slice(0, 10) === today || String(p.id).includes(today));
  return {
    total: db.posts.length,
    today: db.runs[0]?.count || todays.length,
    high: db.posts.filter(p => p.level === "高需求").length,
    replyReady: db.posts.filter(p => p.copy).length,
    lastRun: db.runs[0] || null,
    configured: Boolean(process.env.THREADS_ACCESS_TOKEN),
    aiConfigured: Boolean(process.env.OPENAI_API_KEY),
    running
  };
}
async function api(req, res, url) {
  const db = readDb();
  if (req.method === "GET" && url.pathname === "/api/state") {
    return json(res, 200, { config: db.config, posts: db.posts.slice(0, 1000), runs: db.runs, stats: stats(db) });
  }
  if (req.method === "PUT" && url.pathname === "/api/config") {
    const input = await body(req);
    const keywords = Array.isArray(input.keywords) ? input.keywords.map(String).map(x => x.trim()).filter(Boolean).slice(0, 30) : [];
    if (!keywords.length) return json(res, 400, { error: "至少需要一個關鍵字" });
    db.config = {
      keywords,
      target: Math.max(1, Math.min(1000, Number(input.target) || 200)),
      schedule: /^\d{2}:\d{2}$/.test(input.schedule) ? input.schedule : "08:30",
      tone: String(input.tone || "專業親切").slice(0, 50),
      offer: String(input.offer || "").slice(0, 300),
      active: Boolean(input.active)
    };
    saveDb(db);
    return json(res, 200, { config: db.config });
  }
  if (req.method === "POST" && url.pathname === "/api/collect") {
    const input = await body(req);
    try { return json(res, 200, await collect(input.demo ? "demo" : "auto")); }
    catch (error) { return json(res, 500, { error: error.message }); }
  }
  if (req.method === "PATCH" && url.pathname.startsWith("/api/posts/")) {
    const id = decodeURIComponent(url.pathname.split("/").pop());
    const input = await body(req);
    const post = db.posts.find(p => p.id === id);
    if (!post) return json(res, 404, { error: "找不到貼文" });
    if (input.status) post.status = String(input.status).slice(0, 20);
    if (input.copy !== undefined) post.copy = String(input.copy).slice(0, 2000);
    saveDb(db);
    return json(res, 200, { post });
  }
  if (req.method === "POST" && url.pathname.match(/^\/api\/posts\/[^/]+\/regenerate$/)) {
    const id = decodeURIComponent(url.pathname.split("/")[3]);
    const post = db.posts.find(p => p.id === id);
    if (!post) return json(res, 404, { error: "找不到貼文" });
    try { post.copy = await aiCopy(post, db.config); saveDb(db); return json(res, 200, { post }); }
    catch (error) { return json(res, 500, { error: error.message }); }
  }
  if (req.method === "GET" && url.pathname === "/api/export.csv") {
    const q = s => `"${String(s ?? "").replaceAll('"', '""')}"`;
    const csv = "\ufeff" + ["需求度,分數,關鍵字,帳號,貼文,建議文案,狀態,時間,連結", ...db.posts.map(p =>
      [p.level, p.score, p.keyword, p.username, p.text, p.copy, p.status, p.timestamp, p.permalink].map(q).join(",")
    )].join("\r\n");
    res.writeHead(200, { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=threadsignal.csv" });
    return res.end(csv);
  }
  return json(res, 404, { error: "Not found" });
}
function serve(res, pathname) {
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const file = path.resolve(PUBLIC, relative);
  if (!file.startsWith(path.resolve(PUBLIC)) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); return res.end("Not found");
  }
  const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml" };
  res.writeHead(200, { "Content-Type": `${types[path.extname(file)] || "application/octet-stream"}; charset=utf-8` });
  fs.createReadStream(file).pipe(res);
}
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  try {
    if (url.pathname.startsWith("/api/")) return await api(req, res, url);
    return serve(res, url.pathname);
  } catch (error) { return json(res, 500, { error: error.message }); }
});
server.listen(PORT, () => console.log(`ThreadSignal 已啟動：http://localhost:${PORT}`));
setInterval(() => {
  const db = readDb(), now = new Date();
  const hm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const key = `${now.toISOString().slice(0, 10)}-${hm}`;
  if (db.config?.active && hm === db.config.schedule && key !== lastScheduleKey) {
    lastScheduleKey = key;
    collect().catch(error => console.error("排程蒐集失敗：", error.message));
  }
}, 30_000);
