import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const envPath = path.resolve(".env.local");
let source = "";
try { source = await fs.readFile(envPath, "utf8"); }
catch (error) { if (error.code !== "ENOENT") throw error; }

const existing = source.match(/^LOCAL_ANALYZER_SECRET=(.*)$/m)?.[1]?.trim() || "";
const secret = existing.length >= 32 ? existing : crypto.randomBytes(32).toString("hex");
const line = `LOCAL_ANALYZER_SECRET=${secret}`;
const next = /^LOCAL_ANALYZER_SECRET=.*$/m.test(source)
  ? source.replace(/^LOCAL_ANALYZER_SECRET=.*$/m, line)
  : `${source.trimEnd()}${source.trim() ? "\n" : ""}${line}\n`;
const temporary = `${envPath}.tmp`;
await fs.writeFile(temporary, next, "utf8");
await fs.rename(temporary, envPath);

const targetDir = path.resolve("data", "local-ai");
await fs.mkdir(targetDir, { recursive: true });
const copyPath = path.join(targetDir, "LOCAL_ANALYZER_SECRET.txt");
await fs.writeFile(copyPath, `${secret}\n`, { encoding: "utf8", mode: 0o600 });
console.log(JSON.stringify({ ok: true, created: existing.length < 32, copyFrom: copyPath }));
