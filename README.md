# ThreadSignal

每日自動蒐集 Threads 關鍵字公開貼文與留言、依需求強度分類，並為每筆內容產生繁體中文回覆草稿的雲端 Web App。

正式網站：<https://threadsignal-m2w6.vercel.app/>

## 雲端功能

- Meta 官方 `threads_keyword_search` API，多關鍵字輪流分頁。
- 只保存最近 7 天資料，以 Threads ID 與內容指紋雙重去重。
- 搜尋結果的 `is_reply` 為真時會以「留言」收錄，不使用未核准的留言權限。
- 每筆資料立即產生內容式規則草稿；設定 OpenAI API 後，雲端排程會再批次優化文案。
- Neon Postgres 永久保存設定與搜尋資料；Threads 長效權杖以 AES-256-GCM 加密後保存。
- 可刪除單筆或全部資料、匯出 CSV，並以擁有者帳號保護工作台。
- Vercel Cron 每日自動蒐集，失敗可安全重試，不會用重複或假資料補足 200 筆目標。

## Vercel 必要環境變數

`DATABASE_URL` 由 Neon 整合自動建立。另需設定：

- `THREADS_APP_ID`
- `THREADS_APP_SECRET`
- `THREADS_REDIRECT_URI`
- `SESSION_SECRET`
- `TOKEN_ENCRYPTION_KEY`
- `CRON_SECRET`
- `OWNER_THREADS_USER_ID`（建議）或第一次綁定用的 `OWNER_THREADS_USERNAME`
- `OPENAI_API_KEY`（選填；留空仍會產生內容式規則草稿）
- `OPENAI_MODEL`（預設 `gpt-5-mini`）

部署後需以擁有者 Threads 帳號重新 OAuth 一次，讓長效權杖安全寫入 Neon，之後從 `/dashboard` 設定關鍵字並手動測試一次。

## 立即啟動

需要 Node.js 20 以上：

```powershell
Copy-Item .env.example .env
node server.js
```

瀏覽器開啟 `http://localhost:8787`。這個舊版入口保留作為單機備援；正式自動化使用 Next.js、Vercel 與 Neon。

## 串接真實 Threads 資料

1. 在 Meta for Developers 建立含 Threads use case 的 App。
2. 完成 OAuth，取得含 `threads_keyword_search` 權限的長期存取權杖。
3. 把權杖填入 `.env` 的 `THREADS_ACCESS_TOKEN`。
4. 若要使用 AI 客製文案，填入 `OPENAI_API_KEY`。
5. 重新啟動服務。

程式使用 Meta 官方 `GET https://graph.threads.net/keyword_search`，逐關鍵字查詢 `RECENT`、自動翻頁，並只收錄最近 7 天的內容。系統以貼文 ID及帳號＋內容指紋跨關鍵字、跨頁與跨日去重。實際每日可取得筆數仍取決於關鍵字當日貼文量、Meta API 配額與授權狀態；「200 筆」是每日目標，不會以複製或偽造資料補足。

## 每日自動化

Vercel 免費方案於每日台北時間約 08:30–09:29 執行蒐集，約 09:30–10:29 執行 OpenAI 文案優化；免費方案不保證精確分鐘。資料超過 7 天會由每日工作清理。

## 合規提醒

只處理公開且由官方 API 授權取得的內容；實際聯繫前應人工複核。請遵守 Meta Platform Terms、個資與反垃圾訊息規範，不要自動大量留言或私訊。
