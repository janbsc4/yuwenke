import { localCardPacks } from "../src/lib/localCardPacks";
import type { CardPackState } from "../src/types";

const state: CardPackState = {
  openPackIds: ["CP001", "CP003"],
  clientUpdatedAt: 12,
  serverUpdatedAt: null,
  resetAt: 0,
  schemaVersion: 1,
};

describe("local card pack state", () => {
  it("distinguishes missing state from an existing state and round-trips it", () => {
    expect(localCardPacks.readGuest()).toEqual({ value: null, available: true });
    expect(localCardPacks.writeGuest(state)).toBe(true);
    expect(localCardPacks.readGuest()).toEqual({ value: state, available: true });
  });

  it("isolates guest, user, and pending cloud state", () => {
    localCardPacks.writeGuest(state);
    localCardPacks.writeUser("alice", { ...state, openPackIds: ["CP001"] });
    localCardPacks.writeOutbox("alice", { ...state, openPackIds: ["CP001", "CP002"] });

    expect(localCardPacks.readGuest().value?.openPackIds).toEqual(["CP001", "CP003"]);
    expect(localCardPacks.readUser("alice").value?.openPackIds).toEqual(["CP001"]);
    expect(localCardPacks.readOutbox("alice").value?.openPackIds).toEqual(["CP001", "CP002"]);
  });

  it("rejects malformed or duplicate pack ids", () => {
    window.localStorage.setItem(
      "yuwenke:guest-card-packs:v1",
      JSON.stringify({ ...state, openPackIds: ["CP001", "CP001"] }),
    );
    expect(localCardPacks.readGuest().value).toBeNull();
  });
});
