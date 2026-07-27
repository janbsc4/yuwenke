import { loadFlashcards } from "../src/data/loadFlashcards";
import {
  createStudyUnits,
  matchesFilters,
  mergeFavorites,
  mergeProgress,
  nextClientTimestamp,
  progressForStudyUnits,
  shuffle,
  unitBelongsToView,
  unitKey,
  visibleUnits,
} from "../src/lib/study";
import type {
  FavoriteEntry,
  FavoriteMap,
  ProgressEntry,
  ProgressMap,
} from "../src/types";

function entry(timestamp: number, status: "learning" | "known" = "learning"): ProgressEntry {
  return {
    cardId: "FC001",
    direction: "hanzi-es",
    status,
    clientUpdatedAt: timestamp,
    serverUpdatedAt: null,
    schemaVersion: 1,
  };
}

function favoriteEntry(timestamp: number, favorite = true): FavoriteEntry {
  return {
    cardId: "FC001",
    favorite,
    clientUpdatedAt: timestamp,
    serverUpdatedAt: null,
    schemaVersion: 1,
  };
}

describe("study domain", () => {
  const cards = loadFlashcards();

  it("creates two units for language cards and one Spanish unit for concepts", () => {
    const units = createStudyUnits(cards);
    expect(units).toHaveLength(247);
    expect(units.slice(0, 2).map((unit) => unit.direction)).toEqual([
      "hanzi-es",
      "es-hanzi",
    ]);
    const concept = cards.find((card) => card.tipo === "concepto")!;
    expect(units.filter((unit) => unit.cardId === concept.id)).toMatchObject([
      { direction: "hanzi-es" },
    ]);
  });

  it("honors newer legacy reverse-direction progress for concepts", () => {
    const concept = cards.find((card) => card.tipo === "concepto")!;
    const canonicalKey = unitKey(concept.id, "hanzi-es");
    const legacyKey = unitKey(concept.id, "es-hanzi");
    const legacy: ProgressEntry = {
      ...entry(20, "known"),
      cardId: concept.id,
      direction: "es-hanzi",
    };

    expect(
      progressForStudyUnits([concept], { [legacyKey]: legacy })[canonicalKey],
    ).toMatchObject({
      cardId: concept.id,
      direction: "hanzi-es",
      status: "known",
      clientUpdatedAt: 20,
    });

    const canonical: ProgressEntry = {
      ...entry(21, "learning"),
      cardId: concept.id,
    };
    expect(
      progressForStudyUnits([concept], {
        [canonicalKey]: canonical,
        [legacyKey]: legacy,
      })[canonicalKey],
    ).toEqual(canonical);
  });

  it("searches pinyin without requiring tone marks", () => {
    expect(
      matchesFilters(cards[1], { query: "ni", topic: "all", type: "all" }),
    ).toBe(true);
    expect(
      matchesFilters(cards[1], { query: "como te llamas", topic: "all", type: "all" }),
    ).toBe(true);
  });

  it("filters by topic and type", () => {
    expect(
      matchesFilters(cards[0], { query: "", topic: "pronombres", type: "palabra" }),
    ).toBe(true);
    expect(
      matchesFilters(cards[0], { query: "", topic: "saludos", type: "palabra" }),
    ).toBe(false);
  });

  it("keeps tags searchable even though they are not rendered on cards", () => {
    const card = cards.find((candidate) => candidate.id === "FC134");
    expect(card).toBeDefined();
    expect(
      matchesFilters(card!, { query: "u_dieresis", topic: "all", type: "all" }),
    ).toBe(true);
  });

  it("shuffles without adding or removing units", () => {
    const result = shuffle([1, 2, 3, 4], () => 0);
    expect(result).toEqual([2, 3, 4, 1]);
    expect(new Set(result)).toEqual(new Set([1, 2, 3, 4]));
  });

  it("tracks the two directions independently", () => {
    const units = createStudyUnits(cards.slice(0, 1));
    const progress: ProgressMap = { [units[0].key]: entry(1) };
    expect(unitBelongsToView(units[0], "study", progress)).toBe(true);
    expect(unitBelongsToView(units[1], "discover", progress)).toBe(true);
  });

  it("includes both directions of a favorite card regardless of status", () => {
    const units = createStudyUnits(cards.slice(0, 1));
    const progress: ProgressMap = {
      [units[0].key]: entry(1, "known"),
      [units[1].key]: { ...entry(2), direction: "es-hanzi" },
    };
    const favorites: FavoriteMap = { FC001: favoriteEntry(3) };

    expect(
      units.every((unit) =>
        unitBelongsToView(unit, "favorites", progress, favorites),
      ),
    ).toBe(true);
    favorites.FC001 = favoriteEntry(4, false);
    expect(
      units.some((unit) =>
        unitBelongsToView(unit, "favorites", progress, favorites),
      ),
    ).toBe(false);
  });

  it("applies the existing topic and type filters to favorite queues", () => {
    const otherTopic = cards.find((card) => card.tema !== cards[0].tema)!;
    const selected = [cards[0], otherTopic];
    const units = createStudyUnits(selected);
    const favorites: FavoriteMap = Object.fromEntries(
      selected.map((card, index) => [
        card.id,
        { ...favoriteEntry(index + 1), cardId: card.id },
      ]),
    );

    const result = visibleUnits(
      units,
      "favorites",
      {},
      { query: "", topic: cards[0].tema, type: cards[0].tipo },
      favorites,
    );

    expect(result).toHaveLength(2);
    expect(result.every((unit) => unit.cardId === cards[0].id)).toBe(true);
  });

  it("uses the newest client timestamp and lets cloud win exact ties", () => {
    const key = unitKey("FC001", "hanzi-es");
    const local = { [key]: entry(20, "learning") };
    const olderCloud = { [key]: entry(10, "known") };
    const tieCloud = { [key]: entry(20, "known") };

    expect(mergeProgress(local, olderCloud).merged[key].status).toBe("learning");
    expect(mergeProgress(local, olderCloud).localWinners).toEqual(local);
    expect(mergeProgress(local, tieCloud).merged[key].status).toBe("known");
    expect(mergeProgress(local, tieCloud).localWinners).toEqual({});
  });

  it("keeps local timestamps monotonic", () => {
    expect(nextClientTimestamp(entry(100), 20)).toBe(101);
  });

  it("merges favorite tombstones with newest-write-wins semantics", () => {
    const local = { FC001: favoriteEntry(20, false) };
    const olderCloud = { FC001: favoriteEntry(10, true) };
    const tieCloud = { FC001: favoriteEntry(20, true) };

    expect(mergeFavorites(local, olderCloud).merged.FC001.favorite).toBe(false);
    expect(mergeFavorites(local, olderCloud).localWinners).toEqual(local);
    expect(mergeFavorites(local, tieCloud).merged.FC001.favorite).toBe(true);
    expect(mergeFavorites(local, tieCloud).localWinners).toEqual({});
  });
});
