"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./dashboard.module.css";

const defaultFilterRequirements = "只保留與居家空氣品質、過敏症狀困擾、空氣清淨機選購或使用、裝潢異味或 PM2.5 改善直接相關，且原文包含問題、需求、求助、比較、推薦、預算或購買意圖的內容。排除戰爭、政治、軍事、國際新聞、同字異義、比喻、純轉貼、品牌廣告、抽獎與沒有實際需求的閒聊。";

const defaults = {
  keywords: [],
  target_per_day: 200,
  schedule: "08:30",
  tone: "專業親切",
  offer: "提供快速回覆與一對一需求評估",
  ai_filter_enabled: true,
  filter_requirements: defaultFilterRequirements,
  ai_confidence_threshold: 75,
  active: true
};

const viewLabels = {
  overview: { eyebrow: "THREADS LEAD INTELLIGENCE", title: "今天的商機雷達" },
  leads: { eyebrow: "OPPORTUNITY WORKSPACE", title: "商機池" },
  settings: { eyebrow: "COLLECTION PREFERENCES", title: "蒐集設定" }
};

function Icon({ name, size = 20 }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true
  };

  if (name === "overview") return <svg {...common}><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></svg>;
  if (name === "leads") return <svg {...common}><path d="M4 4h16v16H4z"/><path d="M8 9h8M8 13h8M8 17h5"/></svg>;
  if (name === "settings") return <svg {...common}><path d="M4 6h10M18 6h2M4 12h3M11 12h9M4 18h8M16 18h4"/><circle cx="16" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="14" cy="18" r="2"/></svg>;
  if (name === "refresh") return <svg {...common}><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>;
  if (name === "sparkles") return <svg {...common}><path d="m12 3 1.1 3.1L16 7.5l-2.9 1.4L12 12l-1.1-3.1L8 7.5l2.9-1.4L12 3Z"/><path d="m18.5 13 .8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z"/><path d="m5.5 13 .7 1.8L8 15.5l-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8Z"/></svg>;
  if (name === "search") return <svg {...common}><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>;
  if (name === "download") return <svg {...common}><path d="M12 3v12m0 0 4-4m-4 4-4-4"/><path d="M4 19h16"/></svg>;
  if (name === "trash") return <svg {...common}><path d="M4 7h16M9 7V4h6v3m3 0-1 14H7L6 7"/><path d="M10 11v6M14 11v6"/></svg>;
  if (name === "external") return <svg {...common}><path d="M14 4h6v6M20 4l-9 9"/><path d="M18 13v6H5V6h6"/></svg>;
  if (name === "copy") return <svg {...common}><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/></svg>;
  if (name === "close") return <svg {...common}><path d="m6 6 12 12M18 6 6 18"/></svg>;
  if (name === "post") return <svg {...common}><path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5"/></svg>;
  if (name === "reply") return <svg {...common}><path d="M9 7 4 12l5 5"/><path d="M5 12h8a6 6 0 0 1 6 6"/></svg>;
  if (name === "check") return <svg {...common}><path d="m5 12 4 4L19 6"/></svg>;
  return null;
}

function normalizeKeywords(value) {
  if (Array.isArray(value)) return value.map(String).map(item => item.trim()).filter(Boolean);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
    } catch {
      return value.split(",").map(item => item.trim()).filter(Boolean);
    }
  }
  return [];
}

function formatDate(value, short = false) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "時間未提供";
  return new Intl.DateTimeFormat("zh-TW", short
    ? { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }
    : { year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }
  ).format(date);
}

function demandClass(level) {
  if (level === "高需求") return styles.high;
  if (level === "中需求") return styles.medium;
  return styles.low;
}

function DemandBadge({ lead }) {
  return <span className={`${styles.demandBadge} ${demandClass(lead.demand_level)}`}>
    {lead.demand_level || "未分類"}<b>{Number(lead.demand_score) || 0}</b>
  </span>;
}

function AiMatchBadge({ lead }) {
  const confidence = Number(lead.ai_confidence);
  if (!["openai", "local_codex"].includes(lead.classification_source) || !Number.isFinite(confidence)) return null;
  return <span className={styles.aiMatchBadge}><Icon name="sparkles" size={12}/>AI 符合 {Math.round(confidence)}%</span>;
}

function isAIClassified(lead) {
  return ["openai", "local_codex"].includes(lead?.classification_source);
}

function filterSettingsChanged(previous = {}, next = {}) {
  return Boolean(previous.ai_filter_enabled) !== Boolean(next.ai_filter_enabled)
    || String(previous.filter_requirements || "").trim() !== String(next.filter_requirements || "").trim()
    || Number(previous.ai_confidence_threshold || 75) !== Number(next.ai_confidence_threshold || 75);
}

function resultCount(result, ...keys) {
  for (const key of keys) {
    const value = Number(result?.[key]);
    if (Number.isFinite(value)) return value;
  }
  return 0;
}

function EmptyState({ title, body, action, onAction }) {
  return <div className={styles.emptyState}>
    <span className={styles.emptyMark}><Icon name="sparkles" size={25} /></span>
    <h3>{title}</h3>
    <p>{body}</p>
    {action && <button type="button" className={styles.secondaryButton} onClick={onAction}>{action}</button>}
  </div>;
}

function trapFocus(event) {
  if (event.key !== "Tab") return;
  const controls = [...event.currentTarget.querySelectorAll("button:not(:disabled), a[href], textarea:not(:disabled), input:not(:disabled)")];
  if (!controls.length) return;
  const first = controls[0];
  const last = controls[controls.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [settings, setSettings] = useState(defaults);
  const [view, setView] = useState("overview");
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [keywordDraft, setKeywordDraft] = useState("");
  const [busyAction, setBusyAction] = useState("");
  const [loadError, setLoadError] = useState("");
  const [toast, setToast] = useState(null);
  const [activeLead, setActiveLead] = useState(null);
  const [copyDraft, setCopyDraft] = useState("");
  const [pendingDelete, setPendingDelete] = useState(null);
  const copyCloseRef = useRef(null);
  const deleteCancelRef = useRef(null);
  const loadRequestRef = useRef(0);

  function notify(message, type = "success") {
    setToast({ message, type, id: Date.now() });
  }

  async function load({ quiet = false, append = false, filters } = {}) {
    const requestId = ++loadRequestRef.current;
    if (!quiet && !data) setBusyAction("loading");
    setLoadError("");
    const effective = filters || { query: search, level: levelFilter, type: typeFilter };
    const params = new URLSearchParams({
      limit: "200",
      offset: append ? String(data?.leads?.length || 0) : "0"
    });
    if (effective.query) params.set("q", effective.query);
    if (effective.level) params.set("level", effective.level);
    if (effective.type) params.set("type", effective.type);
    const response = await fetch(`/api/dashboard/state?${params.toString()}`, { cache: "no-store" });
    if (requestId !== loadRequestRef.current) return;
    if (response.status === 401) {
      setData({ unauthorized: true });
      setBusyAction("");
      return;
    }
    const next = await response.json();
    if (!response.ok) throw new Error(next.error || "載入失敗");
    if (requestId !== loadRequestRef.current) return;
    setData(current => append && current
      ? { ...next, leads: [...(current.leads || []), ...(next.leads || [])] }
      : next);
    if (!append) setSettings({ ...defaults, ...(next.settings || {}), keywords: normalizeKeywords(next.settings?.keywords) });
    setBusyAction("");
  }

  useEffect(() => {
    load({ filters: { query: "", level: "", type: "" } }).catch(error => {
      setBusyAction("");
      setLoadError(error.message || "工作台載入失敗");
    });
    // The initial fetch should only run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!data || data.unauthorized) return undefined;
    const timer = window.setTimeout(() => {
      setBusyAction("filter");
      load({ quiet: true, filters: { query: search, level: levelFilter, type: typeFilter } }).catch(error => {
        setBusyAction("");
        notify(error.message, "error");
      });
    }, 260);
    return () => window.clearTimeout(timer);
    // Data is intentionally excluded so loading a page does not trigger another request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, levelFilter, typeFilter]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key !== "Escape") return;
      setActiveLead(null);
      setPendingDelete(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const modalKey = activeLead ? "copy" : pendingDelete ? "delete" : "";
  useEffect(() => {
    if (!modalKey) return undefined;
    const previous = document.activeElement;
    const timer = window.setTimeout(() => {
      if (modalKey === "copy") copyCloseRef.current?.focus();
      else deleteCancelRef.current?.focus();
    }, 0);
    return () => {
      window.clearTimeout(timer);
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, [modalKey]);

  const leads = data?.leads || [];
  const stats = data?.stats || {};
  const localCodex = data?.capabilities?.aiProvider === "local_codex";
  const matchedTotal = Number(data?.matchedTotal ?? leads.length);
  const priorityLeads = data?.priorityLeads || [];

  function updateLead(updated) {
    setData(current => current ? {
      ...current,
      leads: (current.leads || []).map(lead => lead.id === updated.id ? updated : lead),
      priorityLeads: (current.priorityLeads || []).map(lead => lead.id === updated.id ? updated : lead)
    } : current);
  }

  async function loadMore() {
    setBusyAction("more");
    try {
      await load({ quiet: true, append: true });
    } catch (error) {
      setBusyAction("");
      notify(error.message, "error");
    }
  }

  async function refresh() {
    setBusyAction("refresh");
    try {
      await load({ quiet: true });
      notify("工作台資料已更新。");
    } catch (error) {
      setBusyAction("");
      notify(error.message, "error");
    }
  }

  async function screenCandidates() {
    const summary = { screenedCount: 0, acceptedCount: 0, rejectedCount: 0, pendingCount: undefined };
    for (let pass = 0; pass < 10; pass += 1) {
      const response = await fetch("/api/dashboard/screen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 60 })
      });
      const result = await response.json();
      summary.screenedCount += resultCount(result, "screenedCount");
      summary.acceptedCount += resultCount(result, "acceptedCount", "keptCount", "accepted");
      summary.rejectedCount += resultCount(result, "rejectedCount", "droppedCount", "rejected");
      if (result.pendingCount !== undefined || result.remainingCount !== undefined) {
        summary.pendingCount = Number(result.pendingCount ?? result.remainingCount) || 0;
      }
      if (!response.ok || result.error || Number(result.failedBatches) > 0) {
        const error = new Error(result.error || "AI 語意篩選失敗");
        error.screeningSummary = summary;
        throw error;
      }
      if (result.skipped || summary.pendingCount === 0 || resultCount(result, "screenedCount") === 0) break;
    }
    return summary;
  }

  async function rescreenPending() {
    setBusyAction("screen");
    try {
      const screened = await screenCandidates();
      notify(`重新篩選完成：通過 ${resultCount(screened, "acceptedCount")} 筆、排除 ${resultCount(screened, "rejectedCount")} 筆、待判定 ${resultCount(screened, "pendingCount")} 筆。`);
    } catch (screenError) {
      const screened = screenError.screeningSummary || {};
      notify(`重新篩選未完成：已通過 ${resultCount(screened, "acceptedCount")} 筆、已排除 ${resultCount(screened, "rejectedCount")} 筆、待判定 ${screened.pendingCount === undefined ? "其餘" : (Number(screened.pendingCount) || 0)} 筆。${screenError.message} 待判定內容不會顯示。`, "error");
    } finally {
      try {
        await load({ quiet: true });
      } catch (loadFailure) {
        notify(loadFailure.message || "工作台更新失敗", "error");
      }
      setBusyAction("");
    }
  }

  async function collect() {
    setBusyAction("collect");
    try {
      const response = await fetch("/api/dashboard/collect", { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "蒐集失敗");
      if (result.skipped) {
        notify(result.reason || "本次蒐集已略過。", "info");
      } else if (settings.ai_filter_enabled && localCodex) {
        const candidateCount = resultCount(result, "candidateCount", "insertedCount");
        notify(`已加入 ${candidateCount} 筆候選內容，等待本機 Codex 排程分析；完成前不會顯示。`, "info");
      } else if (settings.ai_filter_enabled) {
        const candidateCount = resultCount(result, "candidateCount", "insertedCount");
        try {
          const screened = await screenCandidates();
          const acceptedCount = resultCount(screened, "acceptedCount");
          const rejectedCount = resultCount(screened, "rejectedCount");
          const pendingFallback = Math.max(0, candidateCount - acceptedCount - rejectedCount);
          const pendingValue = screened.pendingCount;
          const pendingCount = pendingValue === undefined ? pendingFallback : (Number(pendingValue) || 0);
          notify(`AI 篩選完成：候選 ${candidateCount} 筆、通過 ${acceptedCount} 筆、排除 ${rejectedCount} 筆、待判定 ${pendingCount} 筆。`);
        } catch (screenError) {
          const screened = screenError.screeningSummary || {};
          const acceptedCount = resultCount(screened, "acceptedCount");
          const rejectedCount = resultCount(screened, "rejectedCount");
          const pendingCount = screened.pendingCount === undefined
            ? Math.max(0, candidateCount - acceptedCount - rejectedCount)
            : (Number(screened.pendingCount) || 0);
          notify(`AI 篩選未完成：候選 ${candidateCount} 筆、已通過 ${acceptedCount} 筆、已排除 ${rejectedCount} 筆、待判定 ${pendingCount} 筆。${screenError.message} 待判定內容不會顯示。`, "error");
        }
      } else {
        notify(`蒐集完成：新增 ${result.insertedCount || 0} 筆、排除重複 ${result.duplicateCount || 0} 筆，距目標尚差 ${result.shortfall || 0} 筆。`);
      }
      await load({ quiet: true });
    } catch (error) {
      setBusyAction("");
      notify(error.message, "error");
    }
  }

  async function save(event) {
    event.preventDefault();
    setBusyAction("save");
    const previousSettings = { ...defaults, ...(data?.settings || {}) };
    try {
      const response = await fetch("/api/dashboard/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...settings, schedule: "08:30", target: settings.target_per_day })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "儲存失敗");
      const nextSettings = { ...defaults, ...result.settings, keywords: normalizeKeywords(result.settings?.keywords) };
      setSettings(nextSettings);
      setData(current => current ? { ...current, settings: result.settings } : current);
      if (nextSettings.ai_filter_enabled && filterSettingsChanged(previousSettings, nextSettings)) {
        try {
          const screened = await screenCandidates();
          const acceptedCount = resultCount(screened, "acceptedCount");
          const rejectedCount = resultCount(screened, "rejectedCount");
          const pendingCount = resultCount(screened, "pendingCount");
          notify(`設定已儲存並重新篩選：通過 ${acceptedCount} 筆、排除 ${rejectedCount} 筆、待判定 ${pendingCount} 筆。`);
          await load({ quiet: true });
        } catch (screenError) {
          const screened = screenError.screeningSummary || {};
          notify(`設定已儲存，但 AI 尚未完成判定：已通過 ${resultCount(screened, "acceptedCount")} 筆、已排除 ${resultCount(screened, "rejectedCount")} 筆、待判定 ${screened.pendingCount === undefined ? "其餘" : (Number(screened.pendingCount) || 0)} 筆。${screenError.message} 待判定內容不會顯示。`, "error");
          await load({ quiet: true });
        }
      } else {
        notify("蒐集設定已儲存。");
      }
    } catch (error) {
      notify(error.message, "error");
    } finally {
      setBusyAction("");
    }
  }

  function addKeyword() {
    const value = keywordDraft.trim().replace(/^#+/, "");
    if (!value) return;
    if ((settings.keywords || []).length >= 30) {
      notify("關鍵字最多 30 組。", "error");
      return;
    }
    if ((settings.keywords || []).some(item => item.toLocaleLowerCase("zh-TW") === value.toLocaleLowerCase("zh-TW"))) {
      setKeywordDraft("");
      return;
    }
    setSettings(current => ({ ...current, keywords: [...(current.keywords || []), value] }));
    setKeywordDraft("");
  }

  function removeKeyword(keyword) {
    setSettings(current => ({ ...current, keywords: (current.keywords || []).filter(item => item !== keyword) }));
  }

  function openCopy(lead) {
    setActiveLead(lead);
    setCopyDraft(lead.suggested_copy || "");
  }

  async function saveCopy({ copyToClipboard = false } = {}) {
    if (!activeLead) return;
    setBusyAction("copy");
    try {
      const response = await fetch(`/api/dashboard/leads/${activeLead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suggested_copy: copyDraft, status: "已準備" })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "文案儲存失敗");
      updateLead(result.lead);
      setActiveLead(result.lead);
      if (copyToClipboard) {
        await navigator.clipboard.writeText(copyDraft);
        notify("文案已儲存並複製到剪貼簿。");
      } else {
        notify("文案已儲存。");
      }
    } catch (error) {
      notify(error.message || "文案處理失敗", "error");
    } finally {
      setBusyAction("");
    }
  }

  async function regenerate() {
    if (!activeLead) return;
    setBusyAction("regenerate");
    try {
      const response = await fetch(`/api/dashboard/leads/${activeLead.id}/regenerate`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "文案產生失敗");
      updateLead(result.lead);
      setActiveLead(result.lead);
      setCopyDraft(result.lead.suggested_copy || "");
      notify("已依貼文內容重新產生文案。");
    } catch (error) {
      notify(error.message, "error");
    } finally {
      setBusyAction("");
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setBusyAction("delete");
    try {
      const isAll = pendingDelete === "all";
      const response = await fetch(isAll ? "/api/dashboard/leads" : `/api/dashboard/leads/${pendingDelete.id}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "刪除失敗");
      setPendingDelete(null);
      notify(isAll ? `已清除 ${result.deleted || 0} 筆搜尋資料。` : "此筆資料已刪除，近 7 天內不會再收錄。");
      await load({ quiet: true });
    } catch (error) {
      notify(error.message, "error");
      setBusyAction("");
    }
  }

  if (!data && loadError) return <div className={styles.dashboardRoot} data-dashboard-root>
    <section className={styles.connectCard}>
      <div className={styles.brandMark}>!</div>
      <p className={styles.eyebrow}>WORKSPACE TEMPORARILY UNAVAILABLE</p>
      <h1>工作台載入失敗</h1>
      <p>{loadError}</p>
      <button type="button" className={styles.retryButton} onClick={() => load({ filters: { query: "", level: "", type: "" } }).catch(error => setLoadError(error.message))}>再試一次</button>
    </section>
  </div>;

  if (!data) return <div className={styles.dashboardRoot} data-dashboard-root><div className={styles.loadingCard}><span className={styles.spinner}/><p>正在整理你的商機工作台…</p></div></div>;

  if (data.unauthorized) return <div className={styles.dashboardRoot} data-dashboard-root>
    <section className={styles.connectCard}>
      <div className={styles.brandMark}>TS</div>
      <p className={styles.eyebrow}>THREADS CONNECTION REQUIRED</p>
      <h1>重新連線後繼續</h1>
      <p>為了保護搜尋資料，請使用已核准的擁有者 Threads 帳號重新授權。</p>
      <a href="/api/auth/threads/start">使用 Threads 重新連線</a>
    </section>
  </div>;

  const greetingHour = new Date().getHours();
  const greeting = greetingHour < 11 ? "早安" : greetingHour < 18 ? "午安" : "晚安";
  const title = viewLabels[view];
  const latestRun = data.runs?.[0];
  const copyReady = Number(stats.ready) || 0;
  const pendingAiCount = Number(stats.pending) || 0;
  const rejectedAiCount = Number(stats.rejected) || 0;
  const modalOpen = Boolean(activeLead || pendingDelete);

  return <div className={styles.dashboardRoot} data-dashboard-root>
    <aside className={styles.sidebar} aria-hidden={modalOpen || undefined} inert={modalOpen || undefined}>
      <div className={styles.brand}>
        <span className={styles.brandIcon}><span/><i/></span>
        <span><strong>ThreadSignal</strong><small>商機雷達</small></span>
      </div>
      <nav className={styles.nav} aria-label="工作台導覽">
        <button type="button" className={view === "overview" ? styles.activeNav : ""} aria-current={view === "overview" ? "page" : undefined} onClick={() => setView("overview")}>
          <Icon name="overview"/><span>總覽</span>
        </button>
        <button type="button" className={view === "leads" ? styles.activeNav : ""} aria-current={view === "leads" ? "page" : undefined} onClick={() => setView("leads")}>
          <Icon name="leads"/><span>商機池</span><b>{stats.total || 0}</b>
        </button>
        <button type="button" className={view === "settings" ? styles.activeNav : ""} aria-current={view === "settings" ? "page" : undefined} onClick={() => setView("settings")}>
          <Icon name="settings"/><span>蒐集設定</span>
        </button>
      </nav>
      <div className={styles.sidebarFoot}>
        <div><span className={settings.active ? styles.liveDot : styles.offDot}/><strong>{settings.active ? "每日自動運行" : "自動蒐集已暫停"}</strong></div>
        <small>下次執行：約 08:30–09:29</small>
        <small>Threads：@{data.account?.username || "已連線"}</small>
      </div>
    </aside>

    <main className={styles.content} aria-hidden={modalOpen || undefined} inert={modalOpen || undefined}>
      <header className={styles.workspaceHeader}>
        <div>
          <p className={styles.eyebrow}>{title.eyebrow}</p>
          <h1>{view === "overview" ? `${greeting}，${title.title}` : title.title}</h1>
        </div>
        <div className={styles.headerActions}>
          <span className={styles.monitorPill}><i/>監測中</span>
          <button type="button" className={styles.iconButton} onClick={refresh} disabled={Boolean(busyAction)} aria-label="重新整理工作台" title="重新整理">
            <Icon name="refresh"/>
          </button>
        </div>
      </header>

      {view === "overview" && <div className={styles.view}>
        <section className={styles.radarHero}>
          <div>
            <p>今日雷達</p>
            <strong><b>{stats.today || 0}</b> 筆新商機</strong>
            <span>{latestRun ? `最近一次蒐集：${formatDate(latestRun.started_at, true)}` : "尚未執行蒐集，按下右側按鈕開始。"}</span>
          </div>
          <button type="button" className={styles.collectButton} onClick={collect} disabled={Boolean(busyAction)}>
            <Icon name="sparkles"/>{busyAction === "collect" ? "蒐集中…" : "立即蒐集"}
          </button>
        </section>

        <section className={styles.statsGrid} aria-label="商機統計">
          <article className={styles.statCard}><span className={styles.statMint}><Icon name="leads"/></span><div><b>{stats.total || 0}</b><small>資料庫貼文</small></div><em>近 7 天且不重複</em></article>
          <article className={styles.statCard}><span className={styles.statCoral}><Icon name="sparkles"/></span><div><b>{stats.high || 0}</b><small>高需求商機</small></div><em>優先聯繫名單</em></article>
          <article className={styles.statCard}><span className={styles.statPurple}><Icon name="check"/></span><div><b>{copyReady}</b><small>文案已就緒</small></div><em>可直接調整與複製</em></article>
          <article className={styles.statCard}><span className={styles.statAmber}><Icon name="reply"/></span><div><b>{stats.replies || 0}</b><small>留言訊號</small></div><em>貼文與留言一起整理</em></article>
        </section>

        {settings.ai_filter_enabled && <section className={styles.aiStatusStrip} aria-label="AI 語意篩選狀態">
          <span><Icon name="sparkles" size={17}/></span>
          <div><strong>{localCodex ? "本機 Codex 語意篩選已啟用" : "AI 語意篩選已啟用"}</strong><small>關鍵字只負責找候選；只有 AI 判定符合且信心達 {Number(settings.ai_confidence_threshold) || 75}% 的內容才會顯示。{localCodex ? " 本機排程約每 15 分鐘處理一次。" : ""}</small></div>
          <dl><div><dt>待判定</dt><dd>{pendingAiCount}</dd></div><div><dt>已排除</dt><dd>{rejectedAiCount}</dd></div></dl>
          <button type="button" className={styles.aiScreenButton} onClick={rescreenPending} disabled={localCodex || !pendingAiCount || Boolean(busyAction)}><Icon name="refresh" size={15}/>{localCodex ? "等待本機排程" : busyAction === "screen" ? "判定中…" : "重新篩選待判定"}</button>
        </section>}

        <section className={styles.prioritySection}>
          <div className={styles.sectionHeading}>
            <div><p className={styles.eyebrow}>PRIORITY OPPORTUNITIES</p><h2>高需求優先</h2></div>
            <button type="button" className={styles.textButton} onClick={() => { setLevelFilter("高需求"); setView("leads"); }}>查看全部高需求</button>
          </div>
          {priorityLeads.length ? <div className={styles.priorityGrid}>
            {priorityLeads.map((lead, index) => <article className={styles.priorityCard} key={lead.id}>
              <div className={styles.priorityTop}><span>0{index + 1}</span><DemandBadge lead={lead}/></div>
              <div className={styles.sourceLine}><span className={styles.sourceIcon}><Icon name={lead.content_type === "留言" ? "reply" : "post"} size={16}/></span><strong>@{lead.username || "threads_user"}</strong><time>{formatDate(lead.published_at, true)}</time></div>
              <p>{lead.body || "（沒有文字內容）"}</p>
              <div className={styles.keywordLine}>{normalizeKeywords(lead.keywords).slice(0, 3).map(keyword => <span key={keyword}>#{keyword}</span>)}</div>
              {isAIClassified(lead) && <div className={styles.semanticEvidence}><AiMatchBadge lead={lead}/><small>{lead.relevance_reason || "AI 已確認內容符合篩選需求"}</small></div>}
              <footer><button type="button" onClick={() => openCopy(lead)}>查看建議文案</button>{lead.permalink && <a href={lead.permalink} target="_blank" rel="noreferrer" aria-label="在 Threads 查看"><Icon name="external" size={18}/></a>}</footer>
            </article>)}
          </div> : (
            <EmptyState title="還沒有高需求商機" body="設定關鍵字後立即蒐集；新資料會依需求強度自動排序。" action="前往蒐集設定" onAction={() => setView("settings")}/>
          )}
        </section>
      </div>}

      {view === "leads" && <div className={styles.view}>
        <section className={styles.leadsIntro}>
          <div><h2>近 7 天公開商機</h2><p>貼文與留言一起整理，超過 7 天自動排除，同一內容不重複收錄。</p></div>
          <div className={styles.leadTopActions}>
            <button type="button" className={styles.ghostDanger} onClick={() => setPendingDelete("all")} disabled={!leads.length || Boolean(busyAction)}><Icon name="trash" size={17}/>清除全部</button>
            <a className={styles.exportButton} href="/api/dashboard/export"><Icon name="download" size={17}/>匯出 CSV</a>
          </div>
        </section>

        <section className={styles.filterBar}>
          <label className={styles.searchBox}><Icon name="search"/><input value={search} onChange={event => setSearch(event.target.value)} disabled={Boolean(busyAction && busyAction !== "filter")} placeholder="搜尋帳號、貼文內容或關鍵字"/><span>{busyAction === "filter" ? "搜尋中…" : `${matchedTotal} 筆`}</span></label>
          <div className={styles.filterGroups}>
            <div className={styles.segmented} aria-label="需求程度篩選">
              {[{ value: "", label: "全部" }, { value: "高需求", label: "高" }, { value: "中需求", label: "中" }, { value: "低需求", label: "低" }].map(item => <button type="button" key={item.value || "all"} className={levelFilter === item.value ? styles.selectedSegment : ""} aria-pressed={levelFilter === item.value} disabled={Boolean(busyAction)} onClick={() => setLevelFilter(item.value)}>{item.label}</button>)}
            </div>
            <div className={styles.segmented} aria-label="內容類型篩選">
              {[{ value: "", label: "全部內容" }, { value: "貼文", label: "貼文" }, { value: "留言", label: "留言" }].map(item => <button type="button" key={item.value || "all-type"} className={typeFilter === item.value ? styles.selectedSegment : ""} aria-pressed={typeFilter === item.value} disabled={Boolean(busyAction)} onClick={() => setTypeFilter(item.value)}>{item.label}</button>)}
            </div>
          </div>
        </section>

        <section className={styles.leadList} aria-live="polite">
          {leads.map(lead => <article className={styles.leadRow} key={lead.id}>
            <div className={styles.avatar}>{(lead.username || "T").slice(0, 1).toUpperCase()}</div>
            <div className={styles.leadBody}>
              <div className={styles.leadMeta}><strong>@{lead.username || "threads_user"}</strong><span><Icon name={lead.content_type === "留言" ? "reply" : "post"} size={13}/>{lead.content_type || "貼文"}</span><time>{formatDate(lead.published_at)}</time></div>
              <p>{lead.body || "（沒有文字內容）"}</p>
              <div className={styles.keywordLine}>{normalizeKeywords(lead.keywords).slice(0, 5).map(keyword => <span key={keyword}>#{keyword}</span>)}</div>
            </div>
            <div className={styles.leadScore}>
              <div className={styles.scoreBadges}><DemandBadge lead={lead}/><AiMatchBadge lead={lead}/></div>
              {isAIClassified(lead) && <small className={styles.relevanceReason}>{lead.relevance_reason || "AI 已確認內容符合篩選需求"}</small>}
              <small>{lead.demand_reason || "已完成需求判斷"}</small>
            </div>
            <div className={styles.leadActions}>
              <button type="button" className={styles.copyButton} onClick={() => openCopy(lead)} disabled={Boolean(busyAction)}><Icon name="sparkles" size={17}/>文案</button>
              {lead.permalink && <a href={lead.permalink} target="_blank" rel="noreferrer" aria-label="在 Threads 查看" title="在 Threads 查看"><Icon name="external" size={18}/></a>}
              <button type="button" className={styles.trashButton} onClick={() => setPendingDelete(lead)} disabled={Boolean(busyAction)} aria-label="刪除這筆資料" title="刪除"><Icon name="trash" size={18}/></button>
            </div>
          </article>)}
          {!leads.length && (
            <EmptyState title={leads.length ? "沒有符合篩選條件的資料" : "商機池目前是空的"} body={leads.length ? "試著清除搜尋字詞，或切換需求程度與內容類型。" : "先到蒐集設定加入關鍵字，再按「立即蒐集」。"} action={leads.length ? "清除篩選" : "前往蒐集設定"} onAction={() => { if (leads.length) { setSearch(""); setLevelFilter(""); setTypeFilter(""); } else setView("settings"); }}/>
          )}
          {leads.length < matchedTotal && <div className={styles.loadMoreRow}><button type="button" className={styles.secondaryButton} onClick={loadMore} disabled={Boolean(busyAction)}>{busyAction === "more" ? "載入中…" : `載入更多（尚有 ${matchedTotal - leads.length} 筆）`}</button></div>}
        </section>
      </div>}

      {view === "settings" && <div className={`${styles.view} ${styles.settingsView}`}>
        <form className={styles.settingsForm} onSubmit={save}>
          <section className={styles.settingsCard}>
            <div className={styles.settingHead}><span>01</span><div><h2>搜尋關鍵字</h2><p>輸入後按 Enter 新增，最多 30 組。關鍵字可以隨時更換。</p></div></div>
            <div className={styles.chipEditor}>
              {(settings.keywords || []).map(keyword => <span className={styles.keywordChip} key={keyword}>#{keyword}<button type="button" onClick={() => removeKeyword(keyword)} aria-label={`移除 ${keyword}`}><Icon name="close" size={13}/></button></span>)}
              <input value={keywordDraft} onChange={event => setKeywordDraft(event.target.value)} onKeyDown={event => { if (event.key === "Enter" || event.key === ",") { event.preventDefault(); addKeyword(); } }} onBlur={addKeyword} placeholder={(settings.keywords || []).length ? "再新增關鍵字…" : "例如：創業、網站設計、行銷"}/>
            </div>
            <small className={styles.fieldNote}>{(settings.keywords || []).length} / 30 組關鍵字</small>
          </section>

          <section className={`${styles.settingsCard} ${styles.semanticSettingsCard}`}>
            <div className={styles.settingHead}><span>02</span><div><h2>AI 語意篩選</h2><p>讓關鍵字只負責找候選，再由 AI 讀懂全文、語境與真實需求。</p></div></div>
            <div className={styles.filterLogic}>
              <span><Icon name="search" size={17}/><b>關鍵字找候選</b></span><i>→</i><span><Icon name="sparkles" size={17}/><b>AI 判斷語意</b></span><i>→</i><span><Icon name="check" size={17}/><b>只顯示符合內容</b></span>
            </div>
            <label className={styles.switchRow}><span><strong>啟用 AI 語意篩選</strong><small>建議保持開啟。AI 失敗或無法確定時，該候選內容不會被放行。</small></span><input type="checkbox" checked={Boolean(settings.ai_filter_enabled)} onChange={event => setSettings(current => ({ ...current, ai_filter_enabled: event.target.checked }))}/><i/></label>
            <label className={styles.fullField}><span>你真正想找的內容</span><textarea value={settings.filter_requirements || ""} onChange={event => setSettings(current => ({ ...current, filter_requirements: event.target.value }))} maxLength={2000} placeholder="描述應保留與排除的主題、情境和需求…"/><small>{(settings.filter_requirements || "").length} / 2000 字</small></label>
            <label className={styles.thresholdField}>
              <span><strong>最低符合信心</strong><small>越高越嚴格；建議 75%。</small></span>
              <input type="range" min="50" max="95" step="1" value={Math.min(95, Math.max(50, Number(settings.ai_confidence_threshold) || 75))} onChange={event => setSettings(current => ({ ...current, ai_confidence_threshold: Number(event.target.value) }))}/>
              <output>{Math.min(95, Math.max(50, Number(settings.ai_confidence_threshold) || 75))}%</output>
            </label>
            <p className={styles.safetyNote}><Icon name="check" size={16}/><span><strong>嚴格放行</strong>：同樣出現「過敏」兩字，戰爭、政治、比喻或其他無關語境會直接排除。只有符合你的描述且超過門檻的內容才進入商機池。</span></p>
          </section>

          <section className={styles.settingsCard}>
            <div className={styles.settingHead}><span>03</span><div><h2>每日蒐集</h2><p>以台北時間執行；達不到目標時顯示差額，不會用重複資料補足。</p></div></div>
            <div className={styles.twoFields}>
              <label><span>每日目標筆數</span><input type="number" min="1" max="1000" value={settings.target_per_day} onChange={event => setSettings(current => ({ ...current, target_per_day: Number(event.target.value) }))}/></label>
              <label><span>預定執行時段</span><input value="08:30–09:29" disabled/><small>Vercel 免費方案會在這一小時內觸發。</small></label>
            </div>
            <label className={styles.switchRow}><span><strong>啟用每日自動蒐集</strong><small>關閉後仍可使用上方的「立即蒐集」。</small></span><input type="checkbox" checked={Boolean(settings.active)} onChange={event => setSettings(current => ({ ...current, active: event.target.checked }))}/><i/></label>
          </section>

          <section className={styles.settingsCard}>
            <div className={styles.settingHead}><span>04</span><div><h2>文案偏好</h2><p>文案會依每篇內容、需求強度與下列語氣個別產生。</p></div></div>
            <label className={styles.fullField}><span>回覆語氣</span><input list="tone-options" value={settings.tone || ""} onChange={event => setSettings(current => ({ ...current, tone: event.target.value }))}/><datalist id="tone-options"><option value="專業親切"/><option value="簡潔直接"/><option value="溫暖自然"/><option value="顧問式"/></datalist></label>
            <label className={styles.fullField}><span>你的服務主張</span><textarea value={settings.offer || ""} onChange={event => setSettings(current => ({ ...current, offer: event.target.value }))} maxLength={300}/><small>{(settings.offer || "").length} / 300 字</small></label>
          </section>

          <section className={styles.integrationGrid}>
            <article><span className={styles.integrationIcon}>@</span><div><small>THREADS</small><strong>已連線 @{data.account?.username || "threads_user"}</strong><p>已核准關鍵字搜尋與近 7 日公開內容蒐集。</p></div><i className={styles.okStatus}><Icon name="check" size={14}/>正常</i></article>
            <article><span className={`${styles.integrationIcon} ${styles.aiIcon}`}><Icon name="sparkles"/></span><div><small>{localCodex ? "CODEX 本機" : "OPENAI"}</small><strong>{settings.ai_filter_enabled ? "AI 語意篩選已啟用" : "AI 語意篩選已暫停"}</strong><p>{settings.ai_filter_enabled ? localCodex ? `本機排程分析，只顯示符合度達 ${Number(settings.ai_confidence_threshold) || 75}% 的內容。` : `只顯示符合度達 ${Number(settings.ai_confidence_threshold) || 75}% 的內容；判定失敗不放行。` : "目前關鍵字候選不經 AI 語意判斷。"}</p></div><i className={settings.ai_filter_enabled ? styles.okStatus : styles.pausedStatus}><Icon name={settings.ai_filter_enabled ? "check" : "close"} size={14}/>{settings.ai_filter_enabled ? localCodex ? "本機排程" : "嚴格篩選" : "已暫停"}</i></article>
          </section>

          <div className={styles.saveBar}><p>所有資料只供此擁有者帳號查看。</p><button type="submit" disabled={Boolean(busyAction)}>{busyAction === "save" ? "儲存中…" : "儲存設定"}</button></div>
        </form>
      </div>}
    </main>

    {activeLead && <div className={styles.modalBackdrop} role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setActiveLead(null); }}>
      <section className={styles.copyModal} role="dialog" aria-modal="true" aria-labelledby="copy-dialog-title" onKeyDown={trapFocus}>
        <header><div><p className={styles.eyebrow}>CONTENT-AWARE RESPONSE</p><h2 id="copy-dialog-title">建議回覆文案</h2></div><button ref={copyCloseRef} type="button" onClick={() => setActiveLead(null)} aria-label="關閉"><Icon name="close"/></button></header>
        <div className={styles.originalPost}><div><strong>@{activeLead.username || "threads_user"}</strong><DemandBadge lead={activeLead}/></div><p>{activeLead.body || "（沒有文字內容）"}</p></div>
        <label className={styles.copyEditor}><span>可直接修改後複製</span><textarea value={copyDraft} onChange={event => setCopyDraft(event.target.value)} maxLength={2000}/><small>{copyDraft.length} / 2000 字</small></label>
        <footer><button type="button" className={styles.regenerateButton} onClick={regenerate} disabled={Boolean(busyAction)}><Icon name="refresh" size={17}/>{busyAction === "regenerate" ? "產生中…" : "重新產生"}</button><div><button type="button" className={styles.secondaryButton} onClick={() => saveCopy()} disabled={Boolean(busyAction)}>儲存</button><button type="button" className={styles.primaryButton} onClick={() => saveCopy({ copyToClipboard: true })} disabled={Boolean(busyAction)}><Icon name="copy" size={17}/>儲存並複製</button></div></footer>
      </section>
    </div>}

    {pendingDelete && <div className={styles.modalBackdrop} role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setPendingDelete(null); }}>
      <section className={styles.deleteModal} role="alertdialog" aria-modal="true" aria-labelledby="delete-dialog-title" aria-describedby="delete-dialog-description" onKeyDown={trapFocus}>
        <span className={styles.deleteIcon}><Icon name="trash" size={23}/></span>
        <h2 id="delete-dialog-title">{pendingDelete === "all" ? "清除全部搜尋資料？" : "刪除這筆搜尋資料？"}</h2>
        <p id="delete-dialog-description">{pendingDelete === "all" ? "這會刪除目前商機池的所有資料，但會保留關鍵字與蒐集設定。" : "刪除後，這筆內容在近 7 天內不會被重新收錄。"}</p>
        <div><button ref={deleteCancelRef} type="button" className={styles.secondaryButton} onClick={() => setPendingDelete(null)}>取消</button><button type="button" className={styles.confirmDeleteButton} onClick={confirmDelete} disabled={Boolean(busyAction)}>{busyAction === "delete" ? "刪除中…" : "確認刪除"}</button></div>
      </section>
    </div>}

    {toast && <div className={`${styles.toast} ${toast.type === "error" ? styles.errorToast : toast.type === "info" ? styles.infoToast : ""}`} role="status"><span>{toast.type === "error" ? "!" : <Icon name="check" size={15}/>}</span><p>{toast.message}</p><button type="button" onClick={() => setToast(null)} aria-label="關閉通知"><Icon name="close" size={16}/></button></div>}
  </div>;
}
