const siteUrl = String(process.env.THREADSIGNAL_SITE_URL || "https://threadsignal-m2w6.vercel.app").replace(/\/$/, "");
const secret = String(process.env.LOCAL_ANALYZER_SECRET || "").trim();
if (secret.length < 32) throw new Error("LOCAL_ANALYZER_SECRET 尚未設定或長度不足。請重新拉取 Vercel 環境變數。");

async function run(path) {
  const response = await fetch(`${siteUrl}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}`, Accept: "application/json" }
  });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); }
  catch { throw new Error(`${path} 回傳無法解析：HTTP ${response.status}`); }
  if (!response.ok) throw new Error(data.error || `${path} 失敗：HTTP ${response.status}`);
  return data;
}

const collection = await run("/api/local-analyzer/collect");
const screening = await run("/api/local-analyzer/screen");
console.log(JSON.stringify({ ok: true, collection, screening }));
