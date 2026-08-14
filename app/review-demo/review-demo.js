"use client";

import { useEffect, useState } from "react";
import styles from "./review-demo.module.css";

export default function ReviewDemo() {
  const [session, setSession] = useState({ connected: false, username: "" });
  const [query, setQuery] = useState("空氣清淨機");
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const error = params.get("error");
    if (error) setStatus(error);
    fetch("/api/auth/threads/status", { cache: "no-store" })
      .then(response => response.json())
      .then(setSession)
      .catch(() => setStatus("無法確認 Threads 連線狀態。"))
      .finally(() => setLoading(false));
  }, []);

  async function search(event) {
    event.preventDefault();
    setLoading(true);
    setStatus("");
    setResults([]);
    try {
      const response = await fetch(`/api/threads/search?q=${encodeURIComponent(query)}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "搜尋失敗。");
      setResults(data.results || []);
      const diagnostics = data.diagnostics || {};
      const rawCount = (diagnostics.recentRawCount || 0) + (diagnostics.topRawCount || 0);
      setStatus(`找到 ${data.results?.length || 0} 筆近 7 日內且不重複的公開結果。Meta 原始回傳 ${rawCount} 筆（模式：${diagnostics.mode || "未知"}；超過 7 日：${diagnostics.olderThanSevenDays || 0}；缺少日期：${diagnostics.missingTimestamp || 0}）。`);
    } catch (error) {
      setStatus(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function disconnect() {
    await fetch("/api/auth/threads/logout", { method: "POST" });
    setSession({ connected: false, username: "" });
    setResults([]);
    setStatus("已斷開 Threads 帳號。");
  }

  return (
    <main className={styles.page}>
      <section className={styles.intro}>
        <p className={styles.eyebrow}>META APP REVIEW DEMO</p>
        <h1>Threads 關鍵字搜尋</h1>
        <p>ThreadSignal 由伊鑽企業社營運。使用者授權後，可依自訂關鍵字搜尋公開 Threads 內容。</p>
      </section>
      <section className={styles.panel}>
        <div className={styles.connection}>
          <div><span className={session.connected ? styles.online : styles.offline} />{loading ? "正在確認連線…" : session.connected ? `已連線 Threads${session.username ? `：@${session.username}` : ""}` : "尚未連線 Threads"}</div>
          {session.connected ? <button className={styles.secondary} onClick={disconnect}>斷開連線</button> : <a className={styles.primary} href="/api/auth/threads/start">使用 Threads 連線</a>}
        </div>
        <form className={styles.search} onSubmit={search}>
          <label htmlFor="keyword">搜尋關鍵字</label>
          <div><input id="keyword" value={query} onChange={event => setQuery(event.target.value)} maxLength={100} disabled={!session.connected} /><button className={styles.primary} disabled={!session.connected || loading || !query.trim()}>{loading ? "處理中…" : "搜尋公開貼文"}</button></div>
        </form>
        {status && <p className={styles.status}>{status}</p>}
      </section>
      <section className={styles.results} aria-live="polite">
        {results.map(item => <article key={item.id}><div className={styles.meta}><strong>@{item.username || "threads_user"}</strong><span>{item.contentType}</span><time>{new Date(item.timestamp).toLocaleString("zh-TW")}</time></div><p>{item.text || "（此結果沒有文字內容）"}</p>{item.permalink && <a href={item.permalink} target="_blank" rel="noreferrer">在 Threads 查看公開貼文</a>}</article>)}
      </section>
      <p className={styles.notice}>本示範僅顯示近 7 日內的公開內容，不會自動發布、留言或私訊。</p>
    </main>
  );
}

