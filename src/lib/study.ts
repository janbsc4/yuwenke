import {
  CONCEPT_DIRECTION,
  NEUTRAL_STUDY_DIRECTIONS,
  type FavoriteEntry,
  type FavoriteMap,
  type CardPackState,
  type Filters,
  type Flashcard,
  type Locale,
  type NeutralDirection,
  type ProgressEntry,
  type ProgressMap,
  type PackIdByCardId,
  type StudyDirection,
  type StudyUnit,
  type StudyView,
} from "../types";
import { localizedCardContent } from "./locale";
import { messages, topicDisplayLabel } from "./messages";

export function unitKey(cardId: string, direction: StudyDirection): string {
  return `${cardId}::${direction}`;
}

export function progressDocumentId(cardId: string, direction: StudyDirection): string {
  return `${cardId}_${direction}`;
}

function canonicalDirectionFor(
  card: Flashcard,
  direction: StudyDirection,
): NeutralDirection | null {
  if (card.tipo === "concepto") {
    return direction === "hanzi-es" || direction === "es-hanzi"
      ? CONCEPT_DIRECTION
      : direction === CONCEPT_DIRECTION
        ? CONCEPT_DIRECTION
        : null;
  }
  if (direction === "hanzi-es") return "hanzi-meaning";
  if (direction === "es-hanzi") return "meaning-hanzi";
  if (direction === "hanzi-meaning" || direction === "meaning-hanzi") return direction;
  return null;
}

export function createStudyUnits(cards: Flashcard[]): StudyUnit[] {
  return cards.flatMap((card) => {
    const directions: readonly NeutralDirection[] =
      card.tipo === "concepto" ? [CONCEPT_DIRECTION] : NEUTRAL_STUDY_DIRECTIONS;
    return directions.map((direction) => ({
      key: unitKey(card.id, direction),
      cardId: card.id,
      direction,
      card,
    }));
  });
}

export function canonicalProgressForCards(
  cards: Flashcard[],
  progress: ProgressMap,
): ProgressMap {
  const cardById = new Map(cards.map((card) => [card.id, card]));
  const canonical: ProgressMap = {};
  const sourcePriorityByKey = new Map<string, number>();

  for (const entry of Object.values(progress)) {
    const card = cardById.get(entry.cardId);
    if (!card) continue;
    const canonicalDirection = canonicalDirectionFor(card, entry.direction);
    if (!canonicalDirection) continue;

    const canonicalKey = unitKey(entry.cardId, canonicalDirection);
    const candidate = { ...entry, direction: canonicalDirection };
    const existing = canonical[canonicalKey];
    const sourcePriority =
      entry.direction === canonicalDirection
        ? 2
        : entry.direction === "es-hanzi"
          ? 1
          : 0;
    const existingPriority = sourcePriorityByKey.get(canonicalKey) ?? -1;
    const candidateWins =
      !existing ||
      entry.clientUpdatedAt > existing.clientUpdatedAt ||
      (entry.clientUpdatedAt === existing.clientUpdatedAt &&
        sourcePriority > existingPriority);

    if (candidateWins) {
      canonical[canonicalKey] = candidate;
      sourcePriorityByKey.set(canonicalKey, sourcePriority);
    }
  }

  return canonical;
}

export function progressForStudyUnits(
  cards: Flashcard[],
  progress: ProgressMap,
): ProgressMap {
  return { ...progress, ...canonicalProgressForCards(cards, progress) };
}

function normalizeSearch(value: string, locale: Locale): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase(locale)
    .trim();
}

export function matchesFilters(
  card: Flashcard,
  filters: Filters,
  locale: Locale,
): boolean {
  if (filters.topic !== "all" && card.tema !== filters.topic) return false;
  if (filters.type !== "all" && card.tipo !== filters.type) return false;

  const query = normalizeSearch(filters.query, locale);
  if (!query) return true;

  const content = localizedCardContent(card, locale);
  return normalizeSearch(
    [
      card.hanzi,
      card.pinyin,
      content.meaning,
      content.explanation,
      card.ejemplo_hanzi,
      card.ejemplo_pinyin,
      content.example,
      content.tags,
      topicDisplayLabel(locale, card.tema),
      messages[locale].cardTypes[card.tipo],
    ].join(" "),
    locale,
  ).includes(query);
}

export function unitBelongsToView(
  unit: StudyUnit,
  view: StudyView,
  progress: ProgressMap,
  favorites: FavoriteMap = {},
): boolean {
  if (view === "favorites") return favorites[unit.cardId]?.favorite ?? false;
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
  locale: Locale,
): StudyUnit[] {
  return units.filter(
    (unit) =>
      unitBelongsToView(unit, view, progress, favorites) &&
      (view !== "discover" ||
        openPackIds.has(packIdByCardId[unit.cardId])) &&
      matchesFilters(unit.card, filters, locale),
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
    Object.entries(entries).filter(
      ([, entry]) => ((entry as { resetAt?: number }).resetAt ?? 0) === resetAt,
    ),
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

export function reshuffleDiscoverQueueAfterPackOpening<T>(
  queue: readonly T[],
  currentIndex: number,
  additions: readonly T[],
  random: () => number = Math.random,
): T[] {
  const preservedLength = Math.min(Math.max(currentIndex + 1, 0), queue.length);
  return [
    ...queue.slice(0, preservedLength),
    ...shuffle([...queue.slice(preservedLength), ...additions], random),
  ];
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
