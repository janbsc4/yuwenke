import { localFavorites } from "../src/lib/localFavorites";
import type { FavoriteEntry } from "../src/types";

const GUEST_KEY = "yuwenke:guest-favorites:v1";
const saved: FavoriteEntry = {
  cardId: "FC001",
  favorite: true,
  clientUpdatedAt: 123,
  serverUpdatedAt: null,
  schemaVersion: 1,
};

function store(entries: Record<string, unknown>, schemaVersion: unknown = 1) {
  window.localStorage.setItem(
    GUEST_KEY,
    JSON.stringify({ schemaVersion, entries }),
  );
}

function withoutField(field: keyof FavoriteEntry): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(saved).filter(([key]) => key !== field),
  );
}

const malformedEntries: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
  ["a missing cardId", withoutField("cardId")],
  ["an invalid cardId", { ...saved, cardId: "FC1" }],
  ["a missing favorite flag", withoutField("favorite")],
  ["an invalid favorite flag", { ...saved, favorite: "yes" }],
  ["a missing clientUpdatedAt", withoutField("clientUpdatedAt")],
  ["a missing serverUpdatedAt", withoutField("serverUpdatedAt")],
  ["a missing schemaVersion", withoutField("schemaVersion")],
  ["an unsupported schemaVersion", { ...saved, schemaVersion: 3 }],
  ["schemaVersion 2 without resetAt", { ...saved, schemaVersion: 2 }],
];

const invalidTimestamps = (
  ["clientUpdatedAt", "serverUpdatedAt", "resetAt"] as const
).flatMap((field) => [-1, 1.5].map((value) => [field, value] as const));

describe("local favorites", () => {
  it("round-trips version 1 and version 2 favorites", () => {
    const current: FavoriteEntry = {
      cardId: "FC002",
      favorite: false,
      clientUpdatedAt: 124,
      serverUpdatedAt: 125,
      resetAt: 100,
      schemaVersion: 2,
    };

    expect(localFavorites.writeGuest({ FC001: saved, FC002: current })).toBe(true);
    expect(localFavorites.readGuest()).toEqual({
      value: { FC001: saved, FC002: current },
      available: true,
    });
  });

  it("keeps valid entries when malformed siblings are present", () => {
    store({ FC001: saved, FC002: { ...saved, favorite: "yes" } });
    expect(localFavorites.readGuest().value).toEqual({ FC001: saved });
  });

  it.each(malformedEntries)("rejects %s", (_description, candidate) => {
    store({ FC001: candidate });
    expect(localFavorites.readGuest().value).toEqual({});
  });

  it.each(invalidTimestamps)("rejects %s = %s", (field, value) => {
    store({ FC001: { ...saved, [field]: value } });
    expect(localFavorites.readGuest().value).toEqual({});
  });

  it.each([0, 2, "1"])("rejects envelope schemaVersion %s", (schemaVersion) => {
    store({ FC001: saved }, schemaVersion);
    expect(localFavorites.readGuest().value).toEqual({});
  });

  it("drops favorites stored under mismatched or duplicate alias keys", () => {
    store({ wrong: saved, FC002: saved });
    expect(localFavorites.readGuest().value).toEqual({});
  });

  it("strips unknown entry properties", () => {
    store({ FC001: { ...saved, futureField: "ignored" } });
    expect(localFavorites.readGuest().value).toEqual({ FC001: saved });
  });

  it("stores authenticated snapshots and outboxes separately", () => {
    expect(localFavorites.writeUser("alice", { FC001: saved })).toBe(true);
    expect(localFavorites.writeOutbox("alice", { FC001: saved })).toBe(true);

    expect(localFavorites.readUser("alice").value).toEqual({ FC001: saved });
    expect(localFavorites.readOutbox("alice").value).toEqual({ FC001: saved });
  });
});
