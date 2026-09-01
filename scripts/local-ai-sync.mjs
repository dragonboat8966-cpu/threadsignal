import fs from "node:fs/promises";
import path from "node:path";

const targetDir = path.resolve("data", "local-ai");
const pendingPath = path.join(targetDir, "pending.json");
const resultsPath = path.join(targetDir, "results.json");

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

if (await exists(resultsPath)) {
  await import("./local-ai-upload.mjs");
}

if (await exists(pendingPath)) {
  try {
    const pending = JSON.parse(await fs.readFile(pendingPath, "utf8"));
    if (Array.isArray(pending.items) && pending.items.length) {
      console.log(JSON.stringify({ ok: true, waitingForAnalysis: true, count: pending.items.length }));
      process.exit(0);
    }
  } catch {
    // A malformed or incomplete local file is safely replaced from the server.
  }
  await fs.rm(pendingPath, { force: true });
}

await import("./local-ai-download.mjs");
