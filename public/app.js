let state={config:{keywords:[]},posts:[],stats:{}},level="",activePost=null;
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const time=s=>s?new Intl.DateTimeFormat("zh-TW",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"}).format(new Date(s)):"—";
function toast(msg){const el=$("#toast");el.textContent=msg;el.classList.add("show");setTimeout(()=>el.classList.remove("show"),2600)}
async function request(url,options){const r=await fetch(url,{headers:{"Content-Type":"application/json"},...options});const data=await r.json();if(!r.ok)throw new Error(data.error||"操作失敗");return data}
function badge(level){return `<span class="badge ${level==="高需求"?"high":level==="中需求"?"medium":"low"}">${esc(level)}</span>`}
function card(p){return `<article class="lead-card"><div class="card-top"><div class="profile"><span class="avatar">${esc((p.username||"?")[0].toUpperCase())}</span><div><strong>@${esc(p.username||"unknown")}</strong><small>${time(p.timestamp)}</small></div></div>${badge(p.level)}</div><p class="post-text">${esc(p.text)}</p><span class="keyword"># ${esc(p.keyword)}</span><div class="score"><span>需求分數</span><b>${p.score} / 100</b></div><button class="card-action" data-copy="${esc(p.id)}">查看建議文案 ✦</button></article>`}
function row(p){return `<article class="lead-row"><div class="profile"><span class="avatar">${esc((p.username||"?")[0].toUpperCase())}</span><div><strong>@${esc(p.username||"unknown")}</strong><small>${time(p.timestamp)}</small></div></div><div><p class="post-text">${esc(p.text)}</p><span class="keyword">${esc(p.keyword)}</span></div>${badge(p.level)}<div class="row-actions"><button data-copy="${esc(p.id)}" title="查看文案">✦</button><button data-open="${esc(p.permalink)}" title="開啟貼文">↗</button></div></article>`}
function render(){
  const s=state.stats,c=state.config;
  $("#todayBig").textContent=s.today||0;$("#totalStat").textContent=s.total||0;$("#highStat").textContent=s.high||0;$("#copyStat").textContent=s.replyReady||0;
  $("#scheduleStat").textContent=c.schedule||"--:--";$("#nextRun").textContent=`每日 ${c.schedule||"--:--"}`;$("#navCount").textContent=s.total||0;
  const high=state.posts.filter(p=>p.level==="高需求").slice(0,3);$("#priorityGrid").innerHTML=high.length?high.map(card).join(""):`<div class="empty">尚無資料，按「立即蒐集」建立第一批商機。</div>`;
  renderList();renderForm();
}
function renderList(){
  const q=$("#searchInput").value.toLowerCase();
  const posts=state.posts.filter(p=>(!level||p.level===level)&&(!q||[p.text,p.username,p.keyword].join(" ").toLowerCase().includes(q)));
  $("#leadList").innerHTML=posts.length?posts.map(row).join(""):`<div class="empty">沒有符合條件的貼文。</div>`;
}
function renderForm(){
  const c=state.config;$("#targetInput").value=c.target||200;$("#scheduleInput").value=c.schedule||"08:30";$("#toneInput").value=c.tone||"專業親切";$("#offerInput").value=c.offer||"";$("#activeInput").checked=!!c.active;
  const input=$("#keywordInput");$("#keywordBox").innerHTML=c.keywords.map((k,i)=>`<span class="tag">${esc(k)} <button type="button" data-remove-key="${i}">×</button></span>`).join("");$("#keywordBox").append(input);
  $("#integrationStatus").innerHTML=`Threads API：<b>${state.stats.configured?"已連線":"尚未設定（目前使用 Demo 資料）"}</b>　 AI：<b>${state.stats.aiConfigured?"OpenAI 已連線":"使用內建文案規則"}</b>`;
}
async function load(){state=await request("/api/state");render()}
function go(view){$$(".view,.nav").forEach(x=>x.classList.remove("active"));$(`#${view}`).classList.add("active");$(`.nav[data-view="${view}"]`).classList.add("active");$("#pageTitle").textContent=view==="dashboard"?"早安，今天也來找到真正需要你的人。":view==="leads"?"把訊號變成真正的對話。":"讓雷達照你的方式工作。"}
async function collect(){
  const btn=$("#collectBtn");btn.disabled=true;btn.innerHTML="<b>蒐集中…</b><small>正在分類與生成文案</small>";
  try{const result=await request("/api/collect",{method:"POST",body:JSON.stringify({demo:!state.stats.configured})});toast(`完成：新增 ${result.count} 筆商機`);await load()}
  catch(e){toast(e.message)}finally{btn.disabled=false;btn.innerHTML="<span>↗</span><b>立即蒐集</b><small>使用目前關鍵字</small>"}
}
function openCopy(id){activePost=state.posts.find(p=>p.id===id);if(!activePost)return;$("#dialogTitle").textContent=`@${activePost.username} · ${activePost.level}`;$("#dialogPost").textContent=activePost.text;$("#dialogCopy").value=activePost.copy||"";$("#copyDialog").showModal()}
document.addEventListener("click",async e=>{
  const nav=e.target.closest("[data-view]"),goto=e.target.closest("[data-go]"),copy=e.target.closest("[data-copy]"),open=e.target.closest("[data-open]"),remove=e.target.closest("[data-remove-key]");
  if(nav)go(nav.dataset.view);if(goto)go(goto.dataset.go);if(copy)openCopy(copy.dataset.copy);if(open)window.open(open.dataset.open,"_blank","noopener");
  if(remove){state.config.keywords.splice(Number(remove.dataset.removeKey),1);renderForm()}
});
$$(".segmented button").forEach(b=>b.onclick=()=>{$$(".segmented button").forEach(x=>x.classList.remove("selected"));b.classList.add("selected");level=b.dataset.level;renderList()});
$("#searchInput").addEventListener("input",renderList);$("#collectBtn").onclick=collect;$("#refreshBtn").onclick=()=>load().then(()=>toast("已更新"));
$("#keywordInput").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();const v=e.target.value.trim();if(v&&!state.config.keywords.includes(v)&&state.config.keywords.length<30)state.config.keywords.push(v);e.target.value="";renderForm()}});
$("#configForm").onsubmit=async e=>{e.preventDefault();try{const data=await request("/api/config",{method:"PUT",body:JSON.stringify({keywords:state.config.keywords,target:$("#targetInput").value,schedule:$("#scheduleInput").value,tone:$("#toneInput").value,offer:$("#offerInput").value,active:$("#activeInput").checked})});state.config=data.config;render();toast("設定已儲存")}catch(err){toast(err.message)}};
$("#closeDialog").onclick=()=>$("#copyDialog").close();
$("#copyBtn").onclick=async()=>{await navigator.clipboard.writeText($("#dialogCopy").value);await request(`/api/posts/${encodeURIComponent(activePost.id)}`,{method:"PATCH",body:JSON.stringify({copy:$("#dialogCopy").value,status:"已準備"})});toast("文案已複製")};
$("#regenBtn").onclick=async()=>{try{$("#regenBtn").textContent="生成中…";const d=await request(`/api/posts/${encodeURIComponent(activePost.id)}/regenerate`,{method:"POST",body:"{}"});$("#dialogCopy").value=d.post.copy;toast("已重新生成")}catch(e){toast(e.message)}finally{$("#regenBtn").textContent="重新生成 ✦"}};
load().catch(e=>toast(e.message));
