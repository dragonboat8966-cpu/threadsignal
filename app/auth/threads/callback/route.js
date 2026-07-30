function page(title, message, token = "") {
  const safe = String(message).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const tokenBlock = token ? `<label>長效 Threads Access Token</label><textarea id="token" readonly>${token}</textarea><button onclick="navigator.clipboard.writeText(document.getElementById('token').value);this.textContent='已複製'">複製 Token</button><p class="note">請把 Token 貼到本機 .env 的 THREADS_ACCESS_TOKEN，且不要分享給任何人。</p>` : "";
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title><style>body{margin:0;background:#f5f2eb;color:#17211d;font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh}.box{background:white;border:1px solid #dedbd2;border-radius:22px;padding:36px;width:min(620px,86vw);box-shadow:0 20px 60px #17211d18}h1{font-family:Georgia,serif;font-weight:500}p{line-height:1.7;color:#5f6964}label{font-size:12px;font-weight:700}textarea{width:100%;height:120px;margin:10px 0;padding:12px;box-sizing:border-box;border:1px solid #ccc;border-radius:10px;word-break:break-all}button{border:0;background:#ff826a;color:white;padding:12px 20px;border-radius:10px;cursor:pointer}.note{font-size:12px}</style></head><body><main class="box"><h1>${title}</h1><p>${safe}</p>${tokenBlock}</main></body></html>`;
}

export async function GET(request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error_message") || url.searchParams.get("error");
  if (error) return new Response(page("Threads 授權未完成", error), { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } });
  if (!code) return new Response(page("等待 Threads 授權", "此頁是 ThreadSignal 的 OAuth 回呼端點。請從 Threads 授權流程進入。"), { headers: { "Content-Type": "text/html; charset=utf-8" } });
  const appId = process.env.THREADS_APP_ID;
  const secret = process.env.THREADS_APP_SECRET;
  const redirectUri = process.env.THREADS_REDIRECT_URI;
  if (!appId || !secret || !redirectUri) return new Response(page("伺服器設定未完成", "OAuth 環境變數尚未設定。"), { status: 500, headers: { "Content-Type": "text/html; charset=utf-8" } });
  try {
    const tokenUrl = new URL("https://graph.threads.net/oauth/access_token");
    tokenUrl.search = new URLSearchParams({ client_id: appId, client_secret: secret, code, grant_type: "authorization_code", redirect_uri: redirectUri });
    const shortResponse = await fetch(tokenUrl, { method: "POST" });
    const shortData = await shortResponse.json();
    if (!shortResponse.ok || !shortData.access_token) throw new Error(shortData.error?.message || "無法交換短效 Token");
    const longUrl = new URL("https://graph.threads.net/access_token");
    longUrl.search = new URLSearchParams({ grant_type: "th_exchange_token", client_secret: secret, access_token: shortData.access_token });
    const longResponse = await fetch(longUrl);
    const longData = await longResponse.json();
    if (!longResponse.ok || !longData.access_token) throw new Error(longData.error?.message || "無法交換長效 Token");
    return new Response(page("Threads 授權成功", "已取得長效 Token。請複製並保存到本機設定；此頁不會永久保存 Token。", longData.access_token), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
  } catch (err) {
    return new Response(page("Threads 授權失敗", err.message), { status: 500, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
  }
}
