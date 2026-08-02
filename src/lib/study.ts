import {
  STUDY_DIRECTIONS,
  type FavoriteEntry,
  type FavoriteMap,
  type CardPackState,
  type Filters,
  type Flashcard,
  type ProgressEntry,
  type ProgressMap,
  type PackIdByCardId,
  type StudyDirection,
  type StudyUnit,
  type StudyView,
} from "../types";

export function unitKey(cardId: string, direction: StudyDirection): string {
  return `${cardId}::${direction}`;
}

export function progressDocumentId(cardId: string, direction: StudyDirection): string {
  return `${cardId}_${direction}`;
}

export function createStudyUnits(cards: Flashcard[]): StudyUnit[] {
  return cards.flatMap((card) =>
    (card.tipo === "concepto" ? STUDY_DIRECTIONS.slice(0, 1) : STUDY_DIRECTIONS).map((direction) => ({
      key: unitKey(card.id, direction),
      cardId: card.id,
      direction,
      card,
    })),
  );
}

export function progressForStudyUnits(
  cards: Flashcard[],
  progress: ProgressMap,
): ProgressMap {
  let compatible = progress;

  for (const card of cards) {
    if (card.tipo !== "concepto") continue;
    const canonicalKey = unitKey(card.id, "hanzi-es");
    const legacyKey = unitKey(card.id, "es-hanzi");
    const canonical = progress[canonicalKey];
    const legacy = progress[legacyKey];
    if (
      legacy &&
      (!canonical || legacy.clientUpdatedAt > canonical.clientUpdatedAt)
    ) {
      if (compatible === progress) compatible = { ...progress };
      compatible[canonicalKey] = {
        ...legacy,
        direction: "hanzi-es",
      };
    }
  }

  return compatible;
}

export function tagsFor(card: Flashcard): string[] {
  return card.etiquetas
    .split(";")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .trim();
}

export function matchesFilters(card: Flashcard, filters: Filters): boolean {
  if (filters.topic !== "all" && card.tema !== filters.topic) return false;
  if (filters.type !== "all" && card.tipo !== filters.type) return false;

  const query = normalizeSearch(filters.query);
  if (!query) return true;

  return normalizeSearch(
    [
      card.hanzi,
      card.pinyin,
      card.espanol,
      card.explicacion,
      card.ejemplo_hanzi,
      card.ejemplo_pinyin,
      card.ejemplo_espanol,
      card.etiquetas,
      card.tema,
    ].join(" "),
  ).includes(query);
}

export function unitBelongsToView(
  unit: StudyUnit,
  view: StudyView,
  progress: ProgressMap,
  favorites: FavoriteMap = {},
): boolean {
  if (view === "favorites") return favorites[unit.cardId]?.favorite === true;
  const status = progress[unit.key]?.status;
  if (view === "study") return status === "learning";
  if (view === "mastered") return status === "known";
  return status === undefined;
}

export function visibleUnits(
  units: StudyUnit[],
  view: StudyView,
  progress: ProgressMap,
  filters: Filters,
  favorites: FavoriteMap,
  openPackIds: ReadonlySet<string>,
  packIdByCardId: PackIdByCardId,
): StudyUnit[] {
  return units.filter(
    (unit) =>
      unitBelongsToView(unit, view, progress, favorites) &&
      (view !== "discover" ||
        openPackIds.has(packIdByCardId[unit.cardId])) &&
      matchesFilters(unit.card, filters),
  );
}

export function inferOpenPacksForPackStateMigration(
  orderedPackIds: string[],
  packIdByCardId: PackIdByCardId,
  progress: ProgressMap,
  favorites: FavoriteMap,
): string[] {
  const inferred = new Set<string>(orderedPackIds.slice(0, 1));
  for (const entry of Object.values(progress)) {
    const packId = packIdByCardId[entry.cardId];
    if (packId) inferred.add(packId);
  }
  for (const entry of Object.values(favorites)) {
    if (!entry.favorite) continue;
    const packId = packIdByCardId[entry.cardId];
    if (packId) inferred.add(packId);
  }
  return orderedPackIds.filter((packId) => inferred.has(packId));
}

export function mergePackStates(
  local: CardPackState,
  cloud: CardPackState,
): CardPackState {
  if (local.resetAt !== cloud.resetAt) {
    return local.resetAt > cloud.resetAt ? local : cloud;
  }
  return {
    ...(local.clientUpdatedAt > cloud.clientUpdatedAt ? local : cloud),
    openPackIds: [...new Set([...local.openPackIds, ...cloud.openPackIds])].sort(),
    clientUpdatedAt: Math.max(local.clientUpdatedAt, cloud.clientUpdatedAt),
  };
}

export function mergePackStatesWithGuest(
  orderedPackIds: string[],
  local: CardPackState,
  cloud: CardPackState,
  guestOpenPackIds: string[],
): CardPackState {
  const merged = mergePackStates(local, cloud);
  return {
    ...merged,
    openPackIds: orderedPackIds.filter(
      (packId) =>
        merged.openPackIds.includes(packId) || guestOpenPackIds.includes(packId),
    ),
  };
}

export function mergeGuestOpenPacks(
  orderedPackIds: string[],
  accountState: CardPackState,
  guestState: CardPackState | null,
  inferredOpenPackIds: string[],
): CardPackState {
  return {
    ...accountState,
    openPackIds: orderedPackIds.filter(
      (packId) =>
        accountState.openPackIds.includes(packId) ||
        guestState?.openPackIds.includes(packId) ||
        inferredOpenPackIds.includes(packId),
    ),
    clientUpdatedAt: Math.max(
      accountState.clientUpdatedAt,
      guestState?.clientUpdatedAt ?? 0,
    ),
  };
}

export function packOpeningThresholdReached(
  units: StudyUnit[],
  openPackIds: ReadonlySet<string>,
  packIdByCardId: PackIdByCardId,
  progress: ProgressMap,
): boolean {
  const openUnits = units.filter((unit) =>
    openPackIds.has(packIdByCardId[unit.cardId]),
  );
  if (openUnits.length === 0) return false;
  const mastered = openUnits.filter(
    (unit) => progress[unit.key]?.status === "known",
  ).length;
  return mastered / openUnits.length >= 0.8;
}

type ResettableMap = ProgressMap | FavoriteMap;

export function entriesWithResetBoundary<T extends ResettableMap>(
  entries: T,
  resetAt: number,
): T {
  return Object.fromEntries(
    Object.entries(entries).map(([key, entry]) => [
      key,
      { ...entry, resetAt, schemaVersion: 2 },
    ]),
  ) as T;
}

export function entriesAtResetBoundary<T extends ResettableMap>(
  entries: T,
  resetAt: number,
): T {
  return Object.fromEntries(
    Object.entries(entries).filter(([, entry]) => (entry.resetAt ?? 0) === resetAt),
  ) as T;
}

export function shuffle<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

export function nextClientTimestamp(
  previous?: Pick<ProgressEntry | FavoriteEntry, "clientUpdatedAt">,
  now = Date.now(),
): number {
  return Math.max(now, (previous?.clientUpdatedAt ?? 0) + 1);
}

export function mergeProgress(
  local: ProgressMap,
  cloud: ProgressMap,
): { merged: ProgressMap; localWinners: ProgressMap } {
  const merged: ProgressMap = {};
  const localWinners: ProgressMap = {};
  const keys = new Set([...Object.keys(local), ...Object.keys(cloud)]);

  for (const key of keys) {
    const localEntry = local[key];
    const cloudEntry = cloud[key];

    if (!cloudEntry || (localEntry && localEntry.clientUpdatedAt > cloudEntry.clientUpdatedAt)) {
      if (localEntry) {
        merged[key] = localEntry;
        localWinners[key] = localEntry;
      }
      continue;
    }

    merged[key] = cloudEntry;
  }

  return { merged, localWinners };
}

export function mergeLocalProgress(...sources: ProgressMap[]): ProgressMap {
  const merged: ProgressMap = {};
  for (const source of sources) {
    for (const [key, entry] of Object.entries(source)) {
      const current = merged[key];
      if (!current || entry.clientUpdatedAt >= current.clientUpdatedAt) {
        merged[key] = entry;
      }
    }
  }
  return merged;
}

export function mergeFavorites(
  local: FavoriteMap,
  cloud: FavoriteMap,
): { merged: FavoriteMap; localWinners: FavoriteMap } {
  const merged: FavoriteMap = {};
  const localWinners: FavoriteMap = {};
  const keys = new Set([...Object.keys(local), ...Object.keys(cloud)]);

  for (const key of keys) {
    const localEntry = local[key];
    const cloudEntry = cloud[key];

    if (!cloudEntry || (localEntry && localEntry.clientUpdatedAt > cloudEntry.clientUpdatedAt)) {
      if (localEntry) {
        merged[key] = localEntry;
        localWinners[key] = localEntry;
      }
      continue;
    }

    merged[key] = cloudEntry;
  }

  return { merged, localWinners };
}

export function mergeLocalFavorites(...sources: FavoriteMap[]): FavoriteMap {
  const merged: FavoriteMap = {};
  for (const source of sources) {
    for (const [key, entry] of Object.entries(source)) {
      const current = merged[key];
      if (!current || entry.clientUpdatedAt >= current.clientUpdatedAt) {
        merged[key] = entry;
      }
    }
  }
  return merged;
}
