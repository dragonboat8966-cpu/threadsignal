import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const siteUrl = String(process.env.THREADSIGNAL_SITE_URL || "https://threadsignal-m2w6.vercel.app").replace(/\/$/, "");
const secret = String(process.env.LOCAL_ANALYZER_SECRET || "").trim();
if (secret.length < 32) throw new Error("LOCAL_ANALYZER_SECRET 尚未設定或長度不足。請重新拉取 Vercel 環境變數。");

const localRoot = path.resolve("data", "local-ai");
const workspacesRoot = path.join(localRoot, "workspaces");

async function exists(file) {
  try { await fs.access(file); return true; }
  catch { return false; }
}

async function requestJson(apiPath, options = {}) {
  const response = await fetch(`${siteUrl}${apiPath}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${secret}`,
      Accept: "application/json",
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); }
  catch { throw new Error(`${apiPath} 回傳無法解析：HTTP ${response.status}`); }
  if (!response.ok) throw new Error(data.error || `${apiPath} 失敗：HTTP ${response.status}`);
  return data;
}

function workspaceDirectory(userId) {
  const normalized = String(userId || "");
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(normalized)) throw new Error("伺服器回傳無效的工作區帳號。");
  const target = path.resolve(workspacesRoot, normalized);
  if (path.dirname(target) !== path.resolve(workspacesRoot)) throw new Error("工作區路徑超出允許範圍。");
  return target;
}

async function writeJsonAtomic(file, data) {
  const temporary = `${file}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  await fs.rename(temporary, file);
}

async function parseResults(file) {
  const raw = await fs.readFile(file, "utf8");
  const normalized = raw.replace(/^\uFEFF/, "").replace(/^\+\s*(?=\{)/, "");
  return JSON.parse(normalized);
}

async function migrateLegacyOwner(workspaces) {
  const owner = workspaces.find(item => item.role === "owner");
  if (!owner) return;
  const destination = workspaceDirectory(owner.userId);
  await fs.mkdir(destination, { recursive: true });
  for (const name of ["pending.json", "results.json"]) {
    const legacy = path.join(localRoot, name);
    const next = path.join(destination, name);
    if (await exists(legacy) && !(await exists(next))) await fs.rename(legacy, next);
  }
}

async function uploadResults(workspace, directory) {
  const pendingPath = path.join(directory, "pending.json");
  const resultsPath = path.join(directory, "results.json");
  if (!(await exists(resultsPath))) return null;

  const results = await parseResults(resultsPath);
  const body = { ...results, version: 1, userId: workspace.userId };
  const rawBody = JSON.stringify(body);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  const uploaded = await requestJson("/api/local-analyzer/results", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-ThreadSignal-Timestamp": timestamp,
      "X-ThreadSignal-Signature": `sha256=${signature}`
    },
    body: rawBody
  });

  const archiveDir = path.join(directory, "archive");
  await fs.mkdir(archiveDir, { recursive: true });
  const stamp = new Date().toISOString().replaceAll(":", "-");
  if (await exists(pendingPath)) await fs.copyFile(pendingPath, path.join(archiveDir, `${stamp}-pending.json`));
  await fs.copyFile(resultsPath, path.join(archiveDir, `${stamp}-results.json`));
  await Promise.all([fs.rm(pendingPath, { force: true }), fs.rm(resultsPath, { force: true })]);
  return uploaded;
}

async function downloadPending(workspace, directory) {
  const data = await requestJson(`/api/local-analyzer/jobs?userId=${encodeURIComponent(workspace.userId)}`);
  await writeJsonAtomic(path.join(directory, "pending.json"), data);
  return Number(data.items?.length || 0);
}

async function syncWorkspace(workspace) {
  const directory = workspaceDirectory(workspace.userId);
  await fs.mkdir(directory, { recursive: true });
  await writeJsonAtomic(path.join(directory, "workspace.json"), {
    version: 1,
    userId: workspace.userId,
    username: workspace.username,
    role: workspace.role,
    active: workspace.active,
    aiFilterEnabled: workspace.aiFilterEnabled,
    syncedAt: new Date().toISOString()
  });

  const uploaded = await uploadResults(workspace, directory);
  const pendingPath = path.join(directory, "pending.json");
  if (await exists(pendingPath)) {
    try {
      const pending = JSON.parse(await fs.readFile(pendingPath, "utf8"));
      if (Array.isArray(pending.items) && pending.items.length) {
        return { userId: workspace.userId, username: workspace.username, uploaded, waiting: pending.items.length };
      }
    } catch {
      // A malformed or incomplete pending file is replaced atomically below.
    }
    await fs.rm(pendingPath, { force: true });
  }

  const downloaded = await downloadPending(workspace, directory);
  return { userId: workspace.userId, username: workspace.username, uploaded, downloaded };
}

await fs.mkdir(workspacesRoot, { recursive: true });
let collection;
try { collection = await requestJson("/api/local-analyzer/collect", { method: "POST" }); }
catch (error) { collection = { ok: false, error: String(error.message || error).slice(0, 500) }; }

const listing = await requestJson("/api/local-analyzer/workspaces");
const workspaces = Array.isArray(listing.workspaces) ? listing.workspaces : [];
await migrateLegacyOwner(workspaces);
const results = [];
for (const workspace of workspaces) {
  try { results.push(await syncWorkspace(workspace)); }
  catch (error) {
    results.push({ userId: workspace.userId, username: workspace.username, error: String(error.message || error).slice(0, 500) });
  }
}
console.log(JSON.stringify({ ok: true, collection, workspaceCount: workspaces.length, results }));
