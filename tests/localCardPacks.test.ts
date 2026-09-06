import { localCardPacks } from "../src/lib/localCardPacks";
import type { CardPackState } from "../src/types";

const GUEST_KEY = "yuwenke:guest-card-packs:v1";
const state: CardPackState = {
  openPackIds: ["CP001", "CP003"],
  clientUpdatedAt: 12,
  serverUpdatedAt: null,
  resetAt: 0,
  schemaVersion: 1,
};

function store(candidate: unknown) {
  window.localStorage.setItem(GUEST_KEY, JSON.stringify(candidate));
}

function withoutField(field: keyof CardPackState): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(state).filter(([key]) => key !== field),
  );
}

const malformedStates: ReadonlyArray<readonly [string, unknown]> = [
  ["missing openPackIds", withoutField("openPackIds")],
  ["empty openPackIds", { ...state, openPackIds: [] }],
  ["non-array openPackIds", { ...state, openPackIds: "CP001" }],
  ["malformed pack ids", { ...state, openPackIds: ["CP1"] }],
  ["missing clientUpdatedAt", withoutField("clientUpdatedAt")],
  ["missing serverUpdatedAt", withoutField("serverUpdatedAt")],
  ["missing resetAt", withoutField("resetAt")],
  ["missing schemaVersion", withoutField("schemaVersion")],
  ["unsupported schemaVersion", { ...state, schemaVersion: 2 }],
];

const invalidTimestamps = (
  ["clientUpdatedAt", "serverUpdatedAt", "resetAt"] as const
).flatMap((field) => [-1, 1.5].map((value) => [field, value] as const));

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

  it.each(malformedStates)("rejects %s", (_description, candidate) => {
    store(candidate);
    expect(localCardPacks.readGuest().value).toBeNull();
  });

  it.each(invalidTimestamps)("rejects %s = %s", (field, value) => {
    store({ ...state, [field]: value });
    expect(localCardPacks.readGuest().value).toBeNull();
  });

  it("rejects duplicate pack ids", () => {
    store({ ...state, openPackIds: ["CP001", "CP001"] });
    expect(localCardPacks.readGuest().value).toBeNull();
  });

  it("strips unknown state properties", () => {
    store({ ...state, futureField: "ignored" });
    expect(localCardPacks.readGuest().value).toEqual(state);
  });
});
