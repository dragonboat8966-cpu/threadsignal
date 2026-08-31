import crypto from "node:crypto";

function secret() {
  const value = String(process.env.LOCAL_ANALYZER_SECRET || "").trim();
  if (value.length < 32) throw new Error("LOCAL_ANALYZER_SECRET is not configured securely.");
  return value;
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function authorizeLocalDownload(request) {
  const authorization = request.headers.get("authorization") || "";
  return safeEqual(authorization, `Bearer ${secret()}`);
}

export function authorizeLocalUpload(request, rawBody) {
  const timestamp = request.headers.get("x-threadsignal-timestamp") || "";
  const signature = request.headers.get("x-threadsignal-signature") || "";
  const seconds = Number(timestamp);
  if (!Number.isInteger(seconds) || Math.abs(Date.now() - seconds * 1000) > 5 * 60 * 1000) return false;
  const expected = crypto.createHmac("sha256", secret()).update(`${timestamp}.${rawBody}`).digest("hex");
  return safeEqual(signature, `sha256=${expected}`);
}
