import type { CardPackState } from "../types";
import { createLocalStateStore, isNonNegativeInt } from "./localStateStore";

const GUEST_KEY = "yuwenke:guest-card-packs:v1";
const USER_PREFIX = "yuwenke:user-card-packs:v1:";
const OUTBOX_PREFIX = "yuwenke:card-pack-outbox:v1:";

const PACK_ID_PATTERN = /^CP\d{3}$/;

function parseCardPackState(value: unknown): CardPackState | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const {
    openPackIds,
    clientUpdatedAt,
    serverUpdatedAt,
    resetAt,
    schemaVersion,
  } = value as Record<string, unknown>;
  if (!Array.isArray(openPackIds) || openPackIds.length === 0) return undefined;
  if (!openPackIds.every((id): id is string =>
    typeof id === "string" && PACK_ID_PATTERN.test(id))) return undefined;
  if (new Set(openPackIds).size !== openPackIds.length) return undefined;
  if (!isNonNegativeInt(clientUpdatedAt)) return undefined;
  if (serverUpdatedAt !== null && !isNonNegativeInt(serverUpdatedAt)) return undefined;
  if (!isNonNegativeInt(resetAt) || schemaVersion !== 1) return undefined;

  return {
    openPackIds: [...openPackIds],
    clientUpdatedAt,
    serverUpdatedAt,
    resetAt,
    schemaVersion,
  };
}

export const localCardPacks = createLocalStateStore<CardPackState | null>({
  guestKey: GUEST_KEY,
  userPrefix: USER_PREFIX,
  outboxPrefix: OUTBOX_PREFIX,
  emptyValue: () => null,
  parse: parseCardPackState,
});
