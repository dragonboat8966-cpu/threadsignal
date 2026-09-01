# ThreadSignal

每小時從 Threads 關鍵字搜尋取得公開貼文與留言候選，再由 AI 判斷語意是否真正符合需求，並為通過篩選的內容產生繁體中文回覆草稿的雲端 Web App。

正式網站：<https://threadsignal-m2w6.vercel.app/>

## 雲端功能

- Meta 官方 `threads_keyword_search` API，多關鍵字輪流分頁。
- 關鍵字只用來尋找候選內容；OpenAI 會依自訂篩選條件判斷語意相關性、需求意圖與信心分數，避免同字異義或無關語境進入名單。
- `/review-demo` 的手動搜尋會在同一次操作中完成 Threads 搜尋與 AI 語意分析，前端只收到通過門檻的結果。
- AI 篩選採 fail-closed：判定未通過、信心不足、OpenAI API 失敗或額度不足時，候選內容一律不顯示。
- 可在工作台設定保存最近 1–30 天資料（預設 7 天），以 Threads ID 與內容指紋雙重去重。
- 搜尋結果的 `is_reply` 為真時會以「留言」收錄，不使用未核准的留言權限。
- 通過 AI 語意篩選的資料才會進入可見名單；系統可再批次產生或優化待人工審核的文案。
- Neon Postgres 永久保存設定與搜尋資料；Threads 長效權杖以 AES-256-GCM 加密後保存。
- 可刪除單筆或全部資料、匯出 CSV，並以擁有者帳號保護工作台。
- 本機 Codex 每小時先自動蒐集再執行 AI 分析，失敗可安全重試，不會用重複或假資料補足設定目標。
- 工作台提供「每小時紀錄」，可查看當日每次新增候選及 AI 通過、排除、待判定結果；紀錄於台北時間跨日後由下一次工作清除。

## Vercel 必要環境變數

`DATABASE_URL` 由 Neon 整合自動建立。另需設定：

- `THREADS_APP_ID`
- `THREADS_APP_SECRET`
- `THREADS_REDIRECT_URI`
- `SESSION_SECRET`
- `TOKEN_ENCRYPTION_KEY`
- `CRON_SECRET`
- `OWNER_THREADS_USER_ID`（建議）或第一次綁定用的 `OWNER_THREADS_USERNAME`
- `AI_FILTER_PROVIDER`（`openai` 或 `local_codex`）
- `LOCAL_ANALYZER_SECRET`（`local_codex` 必要；網站與本機共用的獨立隨機密鑰）
- `THREADSIGNAL_SITE_URL`（本機分析器使用，正式值為 `https://threadsignal-m2w6.vercel.app`）
- `OPENAI_API_KEY`（只有網站端即時 OpenAI 模式與 AI 文案功能需要）
- `OPENAI_MODEL`（預設 `gpt-5-mini`）

部署後需以擁有者 Threads 帳號重新 OAuth 一次，讓長效權杖安全寫入 Neon，之後從 `/dashboard` 設定關鍵字、AI 篩選條件與最低信心分數，再手動測試一次。`local_codex` 模式會將候選內容留在待判定區，由本機排程下載、分析並以 HTTPS＋HMAC 驗證回傳；本機離線或判定失敗時不會將候選內容顯示為合格名單。

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
4. 選擇網站端 `OPENAI_API_KEY`，或依 `docs/local-codex-analyzer.md` 啟用本機 Codex 排程分析。
5. 重新啟動服務。

程式使用 Meta 官方 `GET https://graph.threads.net/keyword_search`，逐關鍵字查詢 `RECENT`、依設定帶入 `since`／`until` 並自動翻頁，只收錄設定天數內的候選內容。系統以貼文 ID 及帳號＋內容指紋跨關鍵字、跨頁與跨次執行去重，再把必要的公開文字交由 AI 做語意相關性與需求判定。只有通過自訂條件與最低信心門檻的內容才會顯示；同字異義、比喻、無實際需求或無關主題會被排除。實際每次可取得筆數仍取決於關鍵字貼文量、Meta API 配額、AI 服務與授權狀態；設定目標不會以複製或偽造資料補足。

## 每小時自動化

Windows 背景同步每 15 分鐘檢查一次本機佇列：上傳已完成的 AI 結果，或觸發本小時的 Threads 蒐集並下載候選。Codex 排程每小時只讀取本機候選完成語意判定，不直接使用受限的排程網路。Vercel Hobby 方案不允許小時級 Cron，因此 `vercel.json` 的每日工作只保留為備援；每小時主排程需要本機與 Codex 可執行。同一小時的重跑會防重，超過設定蒐集天數的資料會在工作中清理。

## 合規提醒

只處理公開且由官方 API 授權取得的內容；實際聯繫前應人工複核。請遵守 Meta Platform Terms、個資與反垃圾訊息規範，不要自動大量留言或私訊。
