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

function parseProgressEntry(value: unknown): ProgressEntry | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const {
    cardId,
    direction,
    status,
    clientUpdatedAt,
    serverUpdatedAt,
    resetAt,
    schemaVersion,
  } = value as Record<string, unknown>;
  if (typeof cardId !== "string" || !CARD_ID_PATTERN.test(cardId)) return undefined;
  if (!isStudyDirection(direction)) return undefined;
  if (status !== "learning" && status !== "known") return undefined;
  if (schemaVersion !== 1 && schemaVersion !== 2) return undefined;
  if (!isNonNegativeInt(clientUpdatedAt)) return undefined;
  if (serverUpdatedAt !== null && !isNonNegativeInt(serverUpdatedAt)) return undefined;
  if (resetAt !== undefined && !isNonNegativeInt(resetAt)) return undefined;
  if (schemaVersion === 2 && resetAt === undefined) return undefined;

  return {
    cardId,
    direction,
    status,
    clientUpdatedAt,
    serverUpdatedAt,
    ...(resetAt === undefined ? {} : { resetAt }),
    schemaVersion,
  };
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
    const entry = parseProgressEntry(candidate);
    const expectedKey = entry ? `${entry.cardId}::${entry.direction}` : null;
    if (entry && entryKey === expectedKey) entries[entryKey] = entry;
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
