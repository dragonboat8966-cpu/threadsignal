# ThreadSignal

每日自動蒐集 Threads 關鍵字貼文、依需求強度分類，並為每篇貼文產生繁體中文回覆文案的本機 Web App。

## 立即啟動

需要 Node.js 18 以上：

```powershell
Copy-Item .env.example .env
node server.js
```

瀏覽器開啟 `http://localhost:8787`。未設定 API 金鑰時會自動使用 200 筆 Demo 資料與內建文案規則，所有介面都能操作。

## 串接真實 Threads 資料

1. 在 Meta for Developers 建立含 Threads use case 的 App。
2. 完成 OAuth，取得含 `threads_keyword_search` 權限的長期存取權杖。
3. 把權杖填入 `.env` 的 `THREADS_ACCESS_TOKEN`。
4. 若要使用 AI 客製文案，填入 `OPENAI_API_KEY`。
5. 重新啟動服務。

程式使用 Meta 官方 `GET https://graph.threads.net/keyword_search`，逐關鍵字查詢 `RECENT`、自動翻頁與去重。實際每日可取得筆數仍取決於關鍵字當日貼文量、Meta API 配額與授權狀態；「至少 200 筆」是每日目標，不應以複製或偽造資料補足。

## 每日自動化

App 內建排程器，服務持續運行時會在設定時間執行。正式環境建議以 Windows 工作排程器、PM2、Docker 或雲端服務確保 `node server.js` 常駐。

資料儲存在 `data/db.json`，最多保留 5,000 筆，可從商機池匯出 CSV。存取權杖只放在 `.env`，不會送到瀏覽器。

## 合規提醒

只處理公開且由官方 API 授權取得的內容；實際聯繫前應人工複核。請遵守 Meta Platform Terms、個資與反垃圾訊息規範，不要自動大量留言或私訊。
