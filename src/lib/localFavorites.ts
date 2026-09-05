import type { FavoriteEntry, FavoriteMap } from "../types";
import { createLocalStateStore, isNonNegativeInt } from "./localStateStore";

const GUEST_KEY = "yuwenke:guest-favorites:v1";
const USER_PREFIX = "yuwenke:user-favorites:v1:";
const OUTBOX_PREFIX = "yuwenke:favorite-outbox:v1:";

const CARD_ID_PATTERN = /^FC\d{3}$/;

function isFavoriteEntry(value: unknown): value is FavoriteEntry {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  if (typeof entry.cardId !== "string" || !CARD_ID_PATTERN.test(entry.cardId)) return false;
  if (typeof entry.favorite !== "boolean") return false;
  if (
    entry.schemaVersion !== 1 &&
    entry.schemaVersion !== 2
  ) return false;
  const resetAtValid = entry.resetAt === undefined || isNonNegativeInt(entry.resetAt);
  return (
    isNonNegativeInt(entry.clientUpdatedAt) &&
    (entry.serverUpdatedAt === null || isNonNegativeInt(entry.serverUpdatedAt)) &&
    resetAtValid &&
    (entry.schemaVersion === 1 || entry.resetAt !== undefined)
  );
}

interface StoredEnvelope {
  schemaVersion: 1;
  entries: FavoriteMap;
}

function parseFavorites(value: unknown): FavoriteMap | undefined {
  const envelope = value as Partial<StoredEnvelope> | null;
  if (envelope?.schemaVersion !== 1 || typeof envelope.entries !== "object") {
    return undefined;
  }

  const entries: FavoriteMap = {};
  for (const [entryKey, candidate] of Object.entries(envelope.entries ?? {})) {
    if (isFavoriteEntry(candidate) && entryKey === candidate.cardId) {
      entries[entryKey] = candidate;
    }
  }
  return entries;
}

export const localFavorites = createLocalStateStore<FavoriteMap>({
  guestKey: GUEST_KEY,
  userPrefix: USER_PREFIX,
  outboxPrefix: OUTBOX_PREFIX,
  emptyValue: () => ({}),
  parse: parseFavorites,
  serialize: (entries): StoredEnvelope => ({ schemaVersion: 1, entries }),
});
