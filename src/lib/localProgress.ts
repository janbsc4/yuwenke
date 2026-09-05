import type { ProgressEntry, ProgressMap, StudyDirection } from "../types";
import { createLocalStateStore, isNonNegativeInt } from "./localStateStore";

const GUEST_KEY = "yuwenke:guest-progress:v1";
const USER_PREFIX = "yuwenke:user-progress:v1:";
const OUTBOX_PREFIX = "yuwenke:user-outbox:v1:";

const CARD_ID_PATTERN = /^FC\d{3}$/;
const DIRECTIONS: readonly StudyDirection[] = [
  "hanzi-es",
  "es-hanzi",
  "hanzi-meaning",
  "meaning-hanzi",
  "concept",
];

function isStudyDirection(value: unknown): value is StudyDirection {
  return typeof value === "string" && (DIRECTIONS as readonly string[]).includes(value);
}

function isProgressEntry(value: unknown): value is ProgressEntry {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  if (typeof entry.cardId !== "string" || !CARD_ID_PATTERN.test(entry.cardId)) return false;
  if (!isStudyDirection(entry.direction)) return false;
  if (entry.status !== "learning" && entry.status !== "known") return false;
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
  entries: ProgressMap;
}

function parseProgress(value: unknown): ProgressMap | undefined {
  const envelope = value as Partial<StoredEnvelope> | null;
  if (envelope?.schemaVersion !== 1 || typeof envelope.entries !== "object") {
    return undefined;
  }

  const entries: ProgressMap = {};
  for (const [entryKey, candidate] of Object.entries(envelope.entries ?? {})) {
    const expectedKey = isProgressEntry(candidate)
      ? `${candidate.cardId}::${candidate.direction}`
      : null;
    if (expectedKey && entryKey === expectedKey) entries[entryKey] = candidate;
  }
  return entries;
}

export const localProgress = createLocalStateStore<ProgressMap>({
  guestKey: GUEST_KEY,
  userPrefix: USER_PREFIX,
  outboxPrefix: OUTBOX_PREFIX,
  emptyValue: () => ({}),
  parse: parseProgress,
  serialize: (entries): StoredEnvelope => ({ schemaVersion: 1, entries }),
});
