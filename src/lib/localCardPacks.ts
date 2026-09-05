import type { CardPackState } from "../types";
import { createLocalStateStore, isNonNegativeInt } from "./localStateStore";

const GUEST_KEY = "yuwenke:guest-card-packs:v1";
const USER_PREFIX = "yuwenke:user-card-packs:v1:";
const OUTBOX_PREFIX = "yuwenke:card-pack-outbox:v1:";

const PACK_ID_PATTERN = /^CP\d{3}$/;

function isCardPackState(value: unknown): value is CardPackState {
  if (typeof value !== "object" || value === null) return false;
  const state = value as Record<string, unknown>;
  const { openPackIds } = state;
  if (!Array.isArray(openPackIds) || openPackIds.length === 0) return false;
  if (!openPackIds.every((id) => typeof id === "string" && PACK_ID_PATTERN.test(id))) {
    return false;
  }
  return (
    new Set(openPackIds).size === openPackIds.length &&
    isNonNegativeInt(state.clientUpdatedAt) &&
    (state.serverUpdatedAt === null || isNonNegativeInt(state.serverUpdatedAt)) &&
    isNonNegativeInt(state.resetAt) &&
    state.schemaVersion === 1
  );
}

export const localCardPacks = createLocalStateStore<CardPackState | null>({
  guestKey: GUEST_KEY,
  userPrefix: USER_PREFIX,
  outboxPrefix: OUTBOX_PREFIX,
  emptyValue: () => null,
  parse: (value) => (isCardPackState(value) ? value : undefined),
});
