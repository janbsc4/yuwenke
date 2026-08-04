import { loadFlashcards } from "../src/data/loadFlashcards";
import {
  createStudyUnits,
  matchesFilters,
  mergeFavorites,
  mergePackStates,
  mergeGuestOpenPacks,
  mergePackStatesWithGuest,
  mergeProgress,
  nextClientTimestamp,
  inferOpenPacksForPackStateMigration,
  packOpeningThresholdReached,
  entriesAtResetBoundary,
  entriesWithResetBoundary,
  progressForStudyUnits,
  shuffle,
  unitBelongsToView,
  unitKey,
  visibleUnits,
} from "../src/lib/study";
import type {
  FavoriteEntry,
  FavoriteMap,
  CardPackState,
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
    expect(units).toHaveLength(318);
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

  it("gates only unseen Discover units by open pack membership", () => {
    const units = createStudyUnits(cards.slice(0, 2));
    const progress: ProgressMap = {
      [units[2].key]: {
        ...entry(1, "learning"),
        cardId: units[2].cardId,
        direction: units[2].direction,
      },
    };
    const packIdByCardId = { FC001: "CP001", FC002: "CP002" };

    expect(
      visibleUnits(
        units,
        "discover",
        progress,
        { query: "", topic: "all", type: "all" },
        {},
        new Set(["CP001"]),
        packIdByCardId,
      ).map((unit) => unit.cardId),
    ).toEqual(["FC001", "FC001"]);
    expect(unitBelongsToView(units[2], "study", progress)).toBe(true);
  });

  it("performs Pack-State Migration from existing progress and favorites", () => {
    const progress: ProgressMap = {
      [unitKey("FC002", "hanzi-es")]: {
        ...entry(1),
        cardId: "FC002",
      },
    };
    const favorites: FavoriteMap = {
      FC003: { ...favoriteEntry(2), cardId: "FC003" },
    };

    expect(
      inferOpenPacksForPackStateMigration(
        ["CP001", "CP002", "CP003", "CP004"],
        { FC001: "CP001", FC002: "CP002", FC003: "CP003" },
        progress,
        favorites,
      ),
    ).toEqual(["CP001", "CP002", "CP003"]);
  });

  it("merges open packs by union within a reset boundary and honors newer resets", () => {
    const state = (
      openPackIds: string[],
      resetAt: number,
      clientUpdatedAt: number,
    ): CardPackState => ({
      openPackIds,
      resetAt,
      clientUpdatedAt,
      serverUpdatedAt: null,
      schemaVersion: 1,
    });

    expect(
      mergePackStates(state(["CP001", "CP003"], 0, 2), state(["CP001", "CP002"], 0, 3)),
    ).toMatchObject({ openPackIds: ["CP001", "CP002", "CP003"], resetAt: 0 });
    expect(
      mergePackStates(state(["CP001", "CP003"], 0, 4), state(["CP001"], 10, 1)),
    ).toMatchObject({ openPackIds: ["CP001"], resetAt: 10 });
  });

  it("unions guest packs into an account without applying the guest reset boundary", () => {
    const account: CardPackState = {
      openPackIds: ["CP001", "CP002"],
      resetAt: 100,
      clientUpdatedAt: 100,
      serverUpdatedAt: null,
      schemaVersion: 1,
    };
    const resetGuest: CardPackState = {
      ...account,
      openPackIds: ["CP001", "CP003"],
      resetAt: 200,
      clientUpdatedAt: 200,
    };

    expect(
      mergeGuestOpenPacks(
        ["CP001", "CP002", "CP003"],
        account,
        resetGuest,
        ["CP001"],
      ),
    ).toMatchObject({
      openPackIds: ["CP001", "CP002", "CP003"],
      resetAt: 100,
    });
  });

  it("keeps guest packs when a newer cloud reset boundary replaces stale account state", () => {
    const staleLocal: CardPackState = {
      openPackIds: ["CP001", "CP002", "CP003"],
      resetAt: 0,
      clientUpdatedAt: 20,
      serverUpdatedAt: null,
      schemaVersion: 1,
    };
    const resetCloud: CardPackState = {
      openPackIds: ["CP001"],
      resetAt: 100,
      clientUpdatedAt: 100,
      serverUpdatedAt: 100,
      schemaVersion: 1,
    };

    expect(
      mergePackStatesWithGuest(
        ["CP001", "CP002", "CP003"],
        staleLocal,
        resetCloud,
        ["CP003"],
      ),
    ).toMatchObject({
      openPackIds: ["CP001", "CP003"],
      resetAt: 100,
    });
  });

  it("recommends packs only when 80% of all units in open packs are mastered", () => {
    const units = createStudyUnits(cards.slice(0, 2));
    const progress: ProgressMap = Object.fromEntries(
      units.slice(0, 3).map((unit, index) => [
        unit.key,
        {
          ...entry(index + 1, "known"),
          cardId: unit.cardId,
          direction: unit.direction,
        },
      ]),
    );
    const memberships = { FC001: "CP001", FC002: "CP001" };

    expect(packOpeningThresholdReached(units, new Set(["CP001"]), memberships, progress)).toBe(false);
    progress[units[3].key] = {
      ...entry(4, "known"),
      cardId: units[3].cardId,
      direction: units[3].direction,
    };
    expect(packOpeningThresholdReached(units, new Set(["CP001"]), memberships, progress)).toBe(true);
  });

  it("upgrades legacy entries and drops entries from before a reset boundary", () => {
    const legacy = { [unitKey("FC001", "hanzi-es")]: entry(1) };
    const upgraded = entriesWithResetBoundary(legacy, 10);

    expect(upgraded[unitKey("FC001", "hanzi-es")]).toMatchObject({
      resetAt: 10,
      schemaVersion: 2,
    });
    expect(entriesAtResetBoundary(upgraded, 11)).toEqual({});
    expect(entriesAtResetBoundary(upgraded, 10)).toEqual(upgraded);
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
      new Set(["CP001"]),
      Object.fromEntries(selected.map((card) => [card.id, "CP001"])),
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
