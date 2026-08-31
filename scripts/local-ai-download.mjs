import fs from "node:fs/promises";
import path from "node:path";

const siteUrl = String(process.env.THREADSIGNAL_SITE_URL || "https://threadsignal-m2w6.vercel.app").replace(/\/$/, "");
const secret = String(process.env.LOCAL_ANALYZER_SECRET || "").trim();
if (secret.length < 32) throw new Error("LOCAL_ANALYZER_SECRET 尚未設定或長度不足。請重新拉取 Vercel 環境變數。");

const response = await fetch(`${siteUrl}/api/local-analyzer/jobs`, {
  headers: { Authorization: `Bearer ${secret}`, Accept: "application/json" }
});
const text = await response.text();
let data;
try { data = JSON.parse(text); }
catch { throw new Error(`網站回傳無法解析：HTTP ${response.status}`); }
if (!response.ok) throw new Error(data.error || `下載失敗：HTTP ${response.status}`);

const targetDir = path.resolve("data", "local-ai");
await fs.mkdir(targetDir, { recursive: true });
const target = path.join(targetDir, "pending.json");
const temporary = `${target}.tmp`;
await fs.writeFile(temporary, `${JSON.stringify(data, null, 2)}\n`, "utf8");
await fs.rename(temporary, target);
console.log(JSON.stringify({ ok: true, count: data.items?.length || 0, file: target }));
