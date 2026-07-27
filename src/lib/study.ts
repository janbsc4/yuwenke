import {
  STUDY_DIRECTIONS,
  type FavoriteEntry,
  type FavoriteMap,
  type Filters,
  type Flashcard,
  type ProgressEntry,
  type ProgressMap,
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
  favorites: FavoriteMap = {},
): StudyUnit[] {
  return units.filter(
    (unit) =>
      unitBelongsToView(unit, view, progress, favorites) &&
      matchesFilters(unit.card, filters),
  );
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
