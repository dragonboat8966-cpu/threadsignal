"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./admin.module.css";

const number = value => new Intl.NumberFormat("zh-TW").format(Number(value) || 0);
const time = value => value ? new Date(value).toLocaleString("zh-TW", { hour12: false }) : "尚無紀錄";

function statusLabel(item) {
  if (!item.collection_enabled) return "已斷開";
  if (!item.active) return "已暫停";
  return "運行中";
}

export default function AdminConsole() {
  const [data, setData] = useState(null);
  const [selectedId, setSelectedId] = useState("");
  const [view, setView] = useState("leads");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async userId => {
    setLoading(true);
    setError("");
    try {
      const query = userId ? `?userId=${encodeURIComponent(userId)}` : "";
      const response = await fetch(`/api/admin/state${query}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "管理後臺載入失敗");
      setData(result);
      const nextId = String(result.selected?.account?.threads_user_id || "");
      setSelectedId(nextId);
    } catch (loadError) {
      setError(loadError.message || "管理後臺載入失敗");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(""); }, [load]);

  const totals = useMemo(() => (data?.accounts || []).reduce((sum, account) => ({
    total: sum.total + Number(account.total_count || 0),
    pending: sum.pending + Number(account.pending_count || 0),
    accepted: sum.accepted + Number(account.accepted_count || 0)
  }), { total: 0, pending: 0, accepted: 0 }), [data]);
  const selected = data?.selected;
  const account = selected?.account;

  if (error) return <main className={styles.centerState}>
    <div className={styles.stateMark}>!</div><h1>無法開啟管理後臺</h1><p>{error}</p>
    <a href="/dashboard">返回工作台</a>
  </main>;
  if (!data || (loading && !data)) return <main className={styles.centerState}><span className={styles.spinner}/><h1>正在載入所有工作區</h1></main>;

  return <div className={styles.shell}>
    <aside className={styles.sidebar}>
      <div className={styles.brand}><span>TS</span><div><strong>ThreadSignal</strong><small>ADMIN CONTROL</small></div></div>
      <div className={styles.accountHeading}><span>已連線工作區</span><b>{data.accounts.length}</b></div>
      <nav className={styles.accountList} aria-label="Threads 工作區">
        {data.accounts.map(item => {
          const active = String(item.threads_user_id) === selectedId;
          return <button key={item.threads_user_id} className={active ? styles.selectedAccount : ""} onClick={() => load(String(item.threads_user_id))}>
            <span className={styles.avatar}>{String(item.username || "?").slice(0, 1).toUpperCase()}</span>
            <span><strong>@{item.username || "threads_user"}</strong><small>{statusLabel(item)} · {number(item.total_count)} 筆</small></span>
            {item.pending_count > 0 && <b className={styles.pendingBadge}>{number(item.pending_count)}</b>}
          </button>;
        })}
      </nav>
      <div className={styles.sidebarFoot}><a href="/dashboard">返回我的工作台</a><small>僅 owner 帳號可存取</small></div>
    </aside>

    <main className={styles.content}>
      <header className={styles.topbar}>
        <div><p>OPERATIONS OVERVIEW</p><h1>多工作區管理後臺</h1><span>集中查看每個 Threads 帳號的蒐集與 Codex 分析狀態</span></div>
        <button onClick={() => load(selectedId)} disabled={loading}>{loading ? "更新中…" : "重新整理"}</button>
      </header>

      <section className={styles.globalStats}>
        <article><span>帳號總數</span><strong>{number(data.accounts.length)}</strong><small>獨立工作區</small></article>
        <article><span>目前資料</span><strong>{number(totals.total)}</strong><small>所有帳號合計</small></article>
        <article><span>AI 已通過</span><strong>{number(totals.accepted)}</strong><small>本機 Codex 判定</small></article>
        <article className={totals.pending ? styles.attention : ""}><span>等待分析</span><strong>{number(totals.pending)}</strong><small>分散於帳號資料夾</small></article>
      </section>

      {account ? <>
        <section className={styles.workspaceHero}>
          <div className={styles.heroIdentity}><span className={styles.largeAvatar}>{String(account.username || "?").slice(0, 1).toUpperCase()}</span><div><p>SELECTED WORKSPACE</p><h2>@{account.username || "threads_user"}</h2><small>Threads ID：{account.threads_user_id}</small></div></div>
          <div className={styles.heroMeta}><span className={account.active ? styles.live : styles.paused}>{statusLabel(account)}</span><small>最近蒐集：{time(account.last_run_at)}</small><small>加入時間：{time(account.created_at)}</small></div>
        </section>

        <section className={styles.workspaceGrid}>
          <article><span>候選總數</span><strong>{number(account.total_count)}</strong></article>
          <article><span>符合條件</span><strong>{number(account.accepted_count)}</strong></article>
          <article><span>已排除</span><strong>{number(account.rejected_count)}</strong></article>
          <article><span>待 Codex</span><strong>{number(account.pending_count)}</strong></article>
        </section>

        <section className={styles.settingsCard}>
          <div><span>關鍵字</span><p>{(account.keywords || []).join("、") || "尚未設定"}</p></div>
          <div><span>蒐集範圍</span><p>近 {account.collection_days} 天／目標 {number(account.target_per_day)} 筆</p></div>
          <div><span>AI 門檻</span><p>{account.ai_filter_enabled ? `${account.ai_confidence_threshold}%` : "未啟用"}</p></div>
          <div className={styles.requirement}><span>AI 保留條件</span><p>{account.filter_requirements || "尚未設定"}</p></div>
        </section>

        <div className={styles.tabs}>
          <button className={view === "leads" ? styles.activeTab : ""} onClick={() => setView("leads")}>蒐集資料 <b>{selected.leads.length}</b></button>
          <button className={view === "runs" ? styles.activeTab : ""} onClick={() => setView("runs")}>執行紀錄 <b>{selected.runs.length}</b></button>
        </div>

        {view === "leads" ? <section className={styles.dataList}>
          {selected.leads.length ? selected.leads.map(lead => <article key={lead.id}>
            <div className={styles.dataMeta}><strong>@{lead.username || "threads_user"}</strong><span>{lead.content_type}</span><time>{time(lead.published_at)}</time><b className={lead.classification_source === "pending" ? styles.waiting : lead.ai_match ? styles.accepted : styles.rejected}>{lead.classification_source === "pending" ? "等待 Codex" : lead.ai_match ? `通過 ${lead.ai_confidence || 0}%` : "已排除"}</b></div>
            <p>{lead.body || "（無文字內容）"}</p>
            <small>{lead.relevance_reason || lead.demand_reason || "尚未產生分析理由"}</small>
            {lead.permalink && <a href={lead.permalink} target="_blank" rel="noreferrer">在 Threads 查看</a>}
          </article>) : <div className={styles.empty}>這個工作區目前沒有蒐集資料。</div>}
        </section> : <section className={styles.runTable}>
          <div className={styles.runHead}><span>時間</span><span>狀態</span><span>原始</span><span>新增</span><span>待分析</span><span>錯誤</span></div>
          {selected.runs.length ? selected.runs.map(run => <div key={run.id} className={styles.runRow}><span>{time(run.started_at)}</span><b>{run.status}</b><span>{number(run.raw_count)}</span><span>{number(run.inserted_count)}</span><span>{number(run.pending_count)}</span><small>{run.error || "—"}</small></div>) : <div className={styles.empty}>今天尚無執行紀錄。</div>}
        </section>}
      </> : <section className={styles.empty}>目前沒有已連線的 Threads 帳號。</section>}
    </main>
  </div>;
}
