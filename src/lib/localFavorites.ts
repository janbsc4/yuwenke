import { z } from "zod";

import type { FavoriteMap } from "../types";
import { createLocalStateStore } from "./localStateStore";

const GUEST_KEY = "yuwenke:guest-favorites:v1";
const USER_PREFIX = "yuwenke:user-favorites:v1:";
const OUTBOX_PREFIX = "yuwenke:favorite-outbox:v1:";

const entrySchema = z.object({
  cardId: z.string().regex(/^FC\d{3}$/),
  favorite: z.boolean(),
  clientUpdatedAt: z.number().int().nonnegative(),
  serverUpdatedAt: z.number().int().nonnegative().nullable(),
  resetAt: z.number().int().nonnegative().optional(),
  schemaVersion: z.union([z.literal(1), z.literal(2)]),
}).refine((entry) => entry.schemaVersion === 1 || entry.resetAt !== undefined);

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
    const parsed = entrySchema.safeParse(candidate);
    if (parsed.success && entryKey === parsed.data.cardId) {
      entries[entryKey] = parsed.data;
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
