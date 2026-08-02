import { z } from "zod";

import type { CardPackState } from "../types";

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

export interface StorageResult<T> {
  value: T;
  available: boolean;
}

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    const marker = "__yuwenke_card_pack_storage_test__";
    window.localStorage.setItem(marker, marker);
    window.localStorage.removeItem(marker);
    return window.localStorage;
  } catch {
    return null;
  }
}

function read(key: string): StorageResult<CardPackState | null> {
  const target = storage();
  if (!target) return { value: null, available: false };
  try {
    const raw = target.getItem(key);
    if (!raw) return { value: null, available: true };
    const parsed = stateSchema.safeParse(JSON.parse(raw));
    return { value: parsed.success ? parsed.data : null, available: true };
  } catch {
    return { value: null, available: true };
  }
}

function write(key: string, state: CardPackState): boolean {
  const target = storage();
  if (!target) return false;
  try {
    target.setItem(key, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

function remove(key: string): boolean {
  const target = storage();
  if (!target) return false;
  try {
    target.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export const localCardPacks = {
  readGuest: () => read(GUEST_KEY),
  writeGuest: (state: CardPackState) => write(GUEST_KEY, state),
  clearGuest: () => remove(GUEST_KEY),
  readUser: (uid: string) => read(`${USER_PREFIX}${uid}`),
  writeUser: (uid: string, state: CardPackState) => write(`${USER_PREFIX}${uid}`, state),
  clearUser: (uid: string) => remove(`${USER_PREFIX}${uid}`),
  readOutbox: (uid: string) => read(`${OUTBOX_PREFIX}${uid}`),
  writeOutbox: (uid: string, state: CardPackState) => write(`${OUTBOX_PREFIX}${uid}`, state),
  clearOutbox: (uid: string) => remove(`${OUTBOX_PREFIX}${uid}`),
};
