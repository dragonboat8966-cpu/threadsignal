function readOutputText(data) {
  if (typeof data?.output_text === "string") return data.output_text;
  return (Array.isArray(data?.output) ? data.output : [])
    .flatMap(item => Array.isArray(item?.content) ? item.content : [])
    .filter(item => item?.type === "output_text" && typeof item.text === "string")
    .map(item => item.text)
    .join("");
}

export async function callOpenAI(body, {
  timeoutMs = 45_000,
  emptyMessage = "OpenAI 沒有回傳內容。",
  timeoutMessage = "OpenAI 處理逾時。"
} = {}) {
  if (!process.env.OPENAI_API_KEY) throw new Error("尚未設定 OPENAI_API_KEY，無法執行 AI 功能。");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const responseText = await response.text();
    let data = {};
    try { data = responseText ? JSON.parse(responseText) : {}; }
    catch {
      if (!response.ok) throw new Error(`OpenAI API ${response.status}`);
      throw new Error("OpenAI 回傳格式無法解析。");
    }
    if (!response.ok) {
      const error = new Error(data.error?.message || `OpenAI API ${response.status}`);
      error.status = response.status;
      error.code = data.error?.code || "";
      throw error;
    }
    if (["failed", "cancelled", "incomplete"].includes(data.status)) {
      throw new Error(data.error?.message || `OpenAI 回覆狀態為 ${data.status}。`);
    }
    const rawText = readOutputText(data);
    const text = String(rawText || "").trim();
    if (!text) throw new Error(emptyMessage);
    return text;
  } catch (error) {
    if (error.name === "AbortError") throw new Error(timeoutMessage);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
