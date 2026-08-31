export const DEFAULT_COLLECTION_DAYS = 7;
export const MIN_COLLECTION_DAYS = 1;
export const MAX_COLLECTION_DAYS = 30;

export function collectionWindowDays(value) {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return DEFAULT_COLLECTION_DAYS;
  return Math.max(MIN_COLLECTION_DAYS, Math.min(MAX_COLLECTION_DAYS, parsed));
}

export function collectionCutoffTimestamp(value, now = Date.now()) {
  return now - collectionWindowDays(value) * 24 * 60 * 60 * 1000;
}
