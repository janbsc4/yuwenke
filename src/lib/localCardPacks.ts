import { z } from "zod";

import type { CardPackState } from "../types";
import { createLocalStateStore } from "./localStateStore";

const GUEST_KEY = "yuwenke:guest-card-packs:v1";
const USER_PREFIX = "yuwenke:user-card-packs:v1:";
const OUTBOX_PREFIX = "yuwenke:card-pack-outbox:v1:";

const stateSchema = z
  .object({
    openPackIds: z.array(z.string().regex(/^CP\d{3}$/)).min(1),
    clientUpdatedAt: z.number().int().nonnegative(),
    serverUpdatedAt: z.number().int().nonnegative().nullable(),
    resetAt: z.number().int().nonnegative(),
    schemaVersion: z.literal(1),
  })
  .refine(
    (state) => new Set(state.openPackIds).size === state.openPackIds.length,
    "Los packs abiertos no pueden estar duplicados.",
  );

export const localCardPacks = createLocalStateStore<CardPackState | null>({
  guestKey: GUEST_KEY,
  userPrefix: USER_PREFIX,
  outboxPrefix: OUTBOX_PREFIX,
  emptyValue: () => null,
  parse: (value) => {
    const parsed = stateSchema.safeParse(value);
    return parsed.success ? parsed.data : undefined;
  },
});
