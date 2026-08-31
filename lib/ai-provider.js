export const LOCAL_CODEX_PROVIDER = "local_codex";

export function aiFilterProvider() {
  return String(process.env.AI_FILTER_PROVIDER || LOCAL_CODEX_PROVIDER).trim().toLowerCase();
}

export function usesLocalCodex() {
  return aiFilterProvider() === LOCAL_CODEX_PROVIDER;
}

export function isAIClassificationSource(value) {
  return value === "openai" || value === LOCAL_CODEX_PROVIDER;
}
