import { localFavorites } from "../src/lib/localFavorites";
import type { FavoriteEntry } from "../src/types";

const saved: FavoriteEntry = {
  cardId: "FC001",
  favorite: true,
  clientUpdatedAt: 123,
  serverUpdatedAt: null,
  schemaVersion: 1,
};

describe("local favorites", () => {
  it("round-trips guest favorites and unfavorite tombstones", () => {
    expect(localFavorites.writeGuest({ FC001: saved })).toBe(true);
    expect(localFavorites.readGuest()).toEqual({
      value: { FC001: saved },
      available: true,
    });

    const tombstone = { ...saved, favorite: false, clientUpdatedAt: 124 };
    expect(localFavorites.writeGuest({ FC001: tombstone })).toBe(true);
    expect(localFavorites.readGuest().value.FC001).toEqual(tombstone);
  });

  it("keeps valid entries when malformed siblings or keys are present", () => {
    window.localStorage.setItem(
      "yuwenke:guest-favorites:v1",
      JSON.stringify({
        schemaVersion: 1,
        entries: {
          FC001: saved,
          FC002: { ...saved, favorite: "yes" },
          wrong: saved,
        },
      }),
    );

    expect(localFavorites.readGuest().value).toEqual({ FC001: saved });
  });

  it("stores authenticated snapshots and outboxes separately", () => {
    expect(localFavorites.writeUser("alice", { FC001: saved })).toBe(true);
    expect(localFavorites.writeOutbox("alice", { FC001: saved })).toBe(true);

    expect(localFavorites.readUser("alice").value).toEqual({ FC001: saved });
    expect(localFavorites.readOutbox("alice").value).toEqual({ FC001: saved });
  });
});
