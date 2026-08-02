import { z } from "zod";

import type { ProgressMap } from "../types";
import { createLocalStateStore } from "./localStateStore";

const GUEST_KEY = "yuwenke:guest-progress:v1";
const USER_PREFIX = "yuwenke:user-progress:v1:";
const OUTBOX_PREFIX = "yuwenke:user-outbox:v1:";

const entrySchema = z.object({
  cardId: z.string().regex(/^FC\d{3}$/),
  direction: z.enum(["hanzi-es", "es-hanzi"]),
  status: z.enum(["learning", "known"]),
  clientUpdatedAt: z.number().int().nonnegative(),
  serverUpdatedAt: z.number().int().nonnegative().nullable(),
  resetAt: z.number().int().nonnegative().optional(),
  schemaVersion: z.union([z.literal(1), z.literal(2)]),
}).refine((entry) => entry.schemaVersion === 1 || entry.resetAt !== undefined);

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
    const parsed = entrySchema.safeParse(candidate);
    const expectedKey = parsed.success
      ? `${parsed.data.cardId}::${parsed.data.direction}`
      : null;
    if (parsed.success && entryKey === expectedKey) entries[entryKey] = parsed.data;
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
