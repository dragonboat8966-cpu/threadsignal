# ThreadSignal

每日從 Threads 關鍵字搜尋取得公開貼文與留言候選，再由 AI 判斷語意是否真正符合需求，並為通過篩選的內容產生繁體中文回覆草稿的雲端 Web App。

正式網站：<https://threadsignal-m2w6.vercel.app/>

## 雲端功能

- Meta 官方 `threads_keyword_search` API，多關鍵字輪流分頁。
- 關鍵字只用來尋找候選內容；OpenAI 會依自訂篩選條件判斷語意相關性、需求意圖與信心分數，避免同字異義或無關語境進入名單。
- `/review-demo` 的手動搜尋會在同一次操作中完成 Threads 搜尋與 AI 語意分析，前端只收到通過門檻的結果。
- AI 篩選採 fail-closed：判定未通過、信心不足、OpenAI API 失敗或額度不足時，候選內容一律不顯示。
- 只保存最近 7 天資料，以 Threads ID 與內容指紋雙重去重。
- 搜尋結果的 `is_reply` 為真時會以「留言」收錄，不使用未核准的留言權限。
- 通過 AI 語意篩選的資料才會進入可見名單；系統可再批次產生或優化待人工審核的文案。
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
- `OPENAI_API_KEY`（必要；必須屬於已啟用 API 計費或仍有可用額度的 OpenAI 專案）
- `OPENAI_MODEL`（預設 `gpt-5-mini`）

部署後需以擁有者 Threads 帳號重新 OAuth 一次，讓長效權杖安全寫入 Neon，之後從 `/dashboard` 設定關鍵字、AI 篩選條件與最低信心分數，再手動測試一次。若 OpenAI 金鑰無效、API 額度不足或判定失敗，系統會保留候選內容供後續重試，但不會將它們顯示為合格名單。

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
4. 填入具有效 API 額度的 `OPENAI_API_KEY`，供語意相關性與需求判定使用。
5. 重新啟動服務。

程式使用 Meta 官方 `GET https://graph.threads.net/keyword_search`，逐關鍵字查詢 `RECENT`、自動翻頁，並只收錄最近 7 天的候選內容。系統以貼文 ID 及帳號＋內容指紋跨關鍵字、跨頁與跨日去重，再把必要的公開文字送至 OpenAI API 做語意相關性與需求判定。只有通過自訂條件與最低信心門檻的內容才會顯示；同字異義、比喻、無實際需求或無關主題會被排除。實際每日可取得筆數仍取決於關鍵字當日貼文量、Meta API 配額、OpenAI API 額度與授權狀態；「200 筆」是每日目標，不會以複製或偽造資料補足。

## 每日自動化

Vercel 免費方案於每日台北時間約 08:30–09:29 執行候選內容蒐集，約 09:30–10:29 執行 OpenAI 語意篩選與文案優化；免費方案不保證精確分鐘。資料超過 7 天會由每日工作清理。

## 合規提醒

只處理公開且由官方 API 授權取得的內容；實際聯繫前應人工複核。請遵守 Meta Platform Terms、個資與反垃圾訊息規範，不要自動大量留言或私訊。
