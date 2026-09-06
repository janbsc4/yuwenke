import type { FavoriteEntry, FavoriteMap } from "../types";
import { createLocalStateStore, isNonNegativeInt } from "./localStateStore";

const GUEST_KEY = "yuwenke:guest-favorites:v1";
const USER_PREFIX = "yuwenke:user-favorites:v1:";
const OUTBOX_PREFIX = "yuwenke:favorite-outbox:v1:";

const CARD_ID_PATTERN = /^FC\d{3}$/;

function parseFavoriteEntry(value: unknown): FavoriteEntry | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const {
    cardId,
    favorite,
    clientUpdatedAt,
    serverUpdatedAt,
    resetAt,
    schemaVersion,
  } = value as Record<string, unknown>;
  if (typeof cardId !== "string" || !CARD_ID_PATTERN.test(cardId)) return undefined;
  if (typeof favorite !== "boolean") return undefined;
  if (schemaVersion !== 1 && schemaVersion !== 2) return undefined;
  if (!isNonNegativeInt(clientUpdatedAt)) return undefined;
  if (serverUpdatedAt !== null && !isNonNegativeInt(serverUpdatedAt)) return undefined;
  if (resetAt !== undefined && !isNonNegativeInt(resetAt)) return undefined;
  if (schemaVersion === 2 && resetAt === undefined) return undefined;

  return {
    cardId,
    favorite,
    clientUpdatedAt,
    serverUpdatedAt,
    ...(resetAt === undefined ? {} : { resetAt }),
    schemaVersion,
  };
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
    const entry = parseFavoriteEntry(candidate);
    if (entry && entryKey === entry.cardId) entries[entryKey] = entry;
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
