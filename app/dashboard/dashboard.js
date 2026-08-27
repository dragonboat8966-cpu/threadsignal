"use client";

import { useEffect, useState } from "react";
import styles from "./dashboard.module.css";

const defaults = { keywords: [], target_per_day: 200, schedule: "08:30", tone: "專業親切", offer: "提供快速回覆與一對一需求評估", active: true };

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [settings, setSettings] = useState(defaults);
  const [status, setStatus] = useState("正在載入…");
  const [busy, setBusy] = useState(false);

  async function load() {
    const response = await fetch("/api/dashboard/state", { cache: "no-store" });
    if (response.status === 401) {
      setData({ unauthorized: true });
      setStatus("請先使用擁有者 Threads 帳號重新連線。");
      return;
    }
    const next = await response.json();
    if (!response.ok) throw new Error(next.error || "載入失敗");
    setData(next);
    setSettings(next.settings || defaults);
    setStatus("");
  }

  useEffect(() => { load().catch(error => setStatus(error.message)); }, []);

  async function save(event) {
    event.preventDefault(); setBusy(true); setStatus("正在儲存設定…");
    try {
      const response = await fetch("/api/dashboard/config", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...settings, schedule: "08:30", target: settings.target_per_day }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "儲存失敗");
      setSettings(result.settings); setStatus("設定已儲存。");
    } catch (error) { setStatus(error.message); } finally { setBusy(false); }
  }

  async function collect() {
    setBusy(true); setStatus("正在向 Threads 蒐集公開內容，請稍候…");
    try {
      const response = await fetch("/api/dashboard/collect", { method: "POST" });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "蒐集失敗");
      setStatus(result.skipped ? result.reason : `完成：新增 ${result.insertedCount} 筆，重複 ${result.duplicateCount} 筆，距離目標尚差 ${result.shortfall} 筆。`);
      await load();
    } catch (error) { setStatus(error.message); } finally { setBusy(false); }
  }

  async function remove(id) {
    if (!confirm("確定刪除這筆資料？近 7 天內不會重新收錄。")) return;
    const response = await fetch(`/api/dashboard/leads/${id}`, { method: "DELETE" });
    if (response.ok) await load(); else setStatus("刪除失敗。");
  }

  async function removeAll() {
    if (!confirm("確定刪除全部搜尋資料？關鍵字設定會保留。")) return;
    const response = await fetch("/api/dashboard/leads", { method: "DELETE" });
    if (response.ok) await load(); else setStatus("全部刪除失敗。");
  }

  async function regenerate(id) {
    setBusy(true); setStatus("正在產生 AI 文案…");
    try {
      const response = await fetch(`/api/dashboard/leads/${id}/regenerate`, { method: "POST" });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "文案產生失敗");
      setStatus("AI 文案已更新。"); await load();
    } catch (error) { setStatus(error.message); } finally { setBusy(false); }
  }

  if (!data) return <p className={styles.loading}>{status}</p>;
  if (data.unauthorized) return <section className={styles.connect}><h1>商機工作台</h1><p>{status}</p><a href="/api/auth/threads/start">使用 Threads 重新連線</a></section>;
  const stats = data.stats || {};
  return <>
    <section className={styles.hero}>
      <div><p className={styles.eyebrow}>THREADS LEAD WORKSPACE</p><h1>商機工作台</h1><p>已連線：@{data.account?.username}。每日自動整理近 7 天且不重複的公開貼文與留言。</p></div>
      <div className={styles.actions}><button onClick={collect} disabled={busy}>立即蒐集</button><a href="/api/dashboard/export">匯出 CSV</a><button className={styles.danger} onClick={removeAll} disabled={busy}>全部刪除</button></div>
    </section>
    <section className={styles.stats}>
      <article><b>{stats.total || 0}</b><span>近 7 日資料</span></article><article><b>{stats.today || 0}</b><span>今日新增</span></article><article><b>{stats.high || 0}</b><span>高需求</span></article><article><b>{stats.replies || 0}</b><span>留言</span></article>
    </section>
    <section className={styles.panel}>
      <div><h2>蒐集設定</h2><p>關鍵字每行一個，最多 30 組。每日目標不足時會顯示差額，不會用重複資料補足。Vercel 免費方案會在每日台北時間約 08:30–09:29 執行。</p></div>
      <form onSubmit={save} className={styles.form}>
        <label>關鍵字<textarea value={(settings.keywords || []).join("\n")} onChange={event => setSettings({ ...settings, keywords: event.target.value.split("\n") })} /></label>
        <div className={styles.formRow}><label>每日目標<input type="number" min="1" max="1000" value={settings.target_per_day} onChange={event => setSettings({ ...settings, target_per_day: Number(event.target.value) })} /></label><label>預定執行時段（台北時間）<input type="text" value="08:30–09:29" disabled aria-describedby="fixed-schedule-note" /><small id="fixed-schedule-note">免費方案由 Vercel 在這一小時內觸發，不保證精確分鐘。</small></label></div>
        <label>回覆語氣<input value={settings.tone} onChange={event => setSettings({ ...settings, tone: event.target.value })} /></label>
        <label>服務主張<textarea value={settings.offer} onChange={event => setSettings({ ...settings, offer: event.target.value })} /></label>
        <label className={styles.check}><input type="checkbox" checked={settings.active} onChange={event => setSettings({ ...settings, active: event.target.checked })} />啟用每日自動蒐集</label>
        <button disabled={busy}>儲存設定</button>
      </form>
      {status && <p className={styles.notice}>{status}</p>}
    </section>
    <section className={styles.list}>
      <div className={styles.listHead}><h2>搜尋資料</h2><span>{data.leads?.length || 0} 筆顯示中</span></div>
      {(data.leads || []).map(lead => <article key={lead.id}>
        <div className={styles.meta}><strong>@{lead.username || "threads_user"}</strong><span>{lead.content_type}</span><span className={lead.demand_level === "高需求" ? styles.high : lead.demand_level === "中需求" ? styles.medium : styles.low}>{lead.demand_level} · {lead.demand_score}</span><time>{new Date(lead.published_at).toLocaleString("zh-TW")}</time></div>
        <p>{lead.body || "（沒有文字內容）"}</p>
        <div className={styles.copy}><b>建議文案</b><p>{lead.suggested_copy}</p></div>
        <div className={styles.rowActions}><div>{lead.permalink && <a href={lead.permalink} target="_blank" rel="noreferrer">在 Threads 查看</a>}</div><div><button className={styles.dangerText} onClick={() => regenerate(lead.id)} disabled={busy}>AI 重寫</button><button className={styles.dangerText} onClick={() => remove(lead.id)}>刪除</button></div></div>
      </article>)}
      {!data.leads?.length && <p className={styles.empty}>尚無資料。設定關鍵字後按「立即蒐集」。</p>}
    </section>
  </>;
}
