import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const siteUrl = String(process.env.THREADSIGNAL_SITE_URL || "https://threadsignal-m2w6.vercel.app").replace(/\/$/, "");
const secret = String(process.env.LOCAL_ANALYZER_SECRET || "").trim();
if (secret.length < 32) throw new Error("LOCAL_ANALYZER_SECRET 尚未設定或長度不足。請重新拉取 Vercel 環境變數。");

const targetDir = path.resolve("data", "local-ai");
const pendingPath = path.join(targetDir, "pending.json");
const resultsPath = path.join(targetDir, "results.json");
const results = JSON.parse(await fs.readFile(resultsPath, "utf8"));
const rawBody = JSON.stringify(results);
const timestamp = String(Math.floor(Date.now() / 1000));
const signature = crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
const response = await fetch(`${siteUrl}/api/local-analyzer/results`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-ThreadSignal-Timestamp": timestamp,
    "X-ThreadSignal-Signature": `sha256=${signature}`
  },
  body: rawBody
});
const text = await response.text();
let data;
try { data = JSON.parse(text); }
catch { throw new Error(`網站回傳無法解析：HTTP ${response.status}`); }
if (!response.ok) throw new Error(data.error || `回傳失敗：HTTP ${response.status}`);

const archiveDir = path.join(targetDir, "archive");
await fs.mkdir(archiveDir, { recursive: true });
const stamp = new Date().toISOString().replaceAll(":", "-");
await Promise.all([
  fs.copyFile(pendingPath, path.join(archiveDir, `${stamp}-pending.json`)),
  fs.copyFile(resultsPath, path.join(archiveDir, `${stamp}-results.json`))
]);
await Promise.all([fs.rm(pendingPath, { force: true }), fs.rm(resultsPath, { force: true })]);
console.log(JSON.stringify({ ok: true, ...data }));
