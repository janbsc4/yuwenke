import { localProgress } from "../src/lib/localProgress";
import { unitKey } from "../src/lib/study";
import type { ProgressEntry } from "../src/types";

const GUEST_KEY = "yuwenke:guest-progress:v1";
const saved: ProgressEntry = {
  cardId: "FC001",
  direction: "hanzi-es",
  status: "learning",
  clientUpdatedAt: 123,
  serverUpdatedAt: null,
  schemaVersion: 1,
};
const savedKey = unitKey(saved.cardId, saved.direction);

function store(entries: Record<string, unknown>, schemaVersion: unknown = 1) {
  window.localStorage.setItem(
    GUEST_KEY,
    JSON.stringify({ schemaVersion, entries }),
  );
}

function withoutField(field: keyof ProgressEntry): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(saved).filter(([key]) => key !== field),
  );
}

const malformedEntries: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
  ["a missing cardId", withoutField("cardId")],
  ["an invalid cardId", { ...saved, cardId: "FC1" }],
  ["a missing direction", withoutField("direction")],
  ["an invalid direction", { ...saved, direction: "invalid" }],
  ["a missing status", withoutField("status")],
  ["an invalid status", { ...saved, status: "maybe" }],
  ["a missing clientUpdatedAt", withoutField("clientUpdatedAt")],
  ["a missing serverUpdatedAt", withoutField("serverUpdatedAt")],
  ["a missing schemaVersion", withoutField("schemaVersion")],
  ["an unsupported schemaVersion", { ...saved, schemaVersion: 3 }],
  ["schemaVersion 2 without resetAt", { ...saved, schemaVersion: 2 }],
];

const invalidTimestamps = (
  ["clientUpdatedAt", "serverUpdatedAt", "resetAt"] as const
).flatMap((field) => [-1, 1.5].map((value) => [field, value] as const));

describe("local progress", () => {
  it("round-trips version 1 and version 2 entries", () => {
    const current: ProgressEntry = {
      ...saved,
      cardId: "FC002",
      direction: "meaning-hanzi",
      resetAt: 100,
      schemaVersion: 2,
    };
    const currentKey = unitKey(current.cardId, current.direction);

    expect(localProgress.writeGuest({ [savedKey]: saved, [currentKey]: current })).toBe(true);
    expect(localProgress.readGuest()).toEqual({
      value: { [savedKey]: saved, [currentKey]: current },
      available: true,
    });
  });

  it("discards malformed entries without losing valid siblings", () => {
    store({ [savedKey]: saved, broken: { status: "maybe" } });
    expect(localProgress.readGuest().value).toEqual({ [savedKey]: saved });
  });

  it.each(malformedEntries)("rejects %s", (_description, candidate) => {
    store({ [savedKey]: candidate });
    expect(localProgress.readGuest().value).toEqual({});
  });

  it.each(invalidTimestamps)("rejects %s = %s", (field, value) => {
    store({ [savedKey]: { ...saved, [field]: value } });
    expect(localProgress.readGuest().value).toEqual({});
  });

  it.each([0, 2, "1"])("rejects envelope schemaVersion %s", (schemaVersion) => {
    store({ [savedKey]: saved }, schemaVersion);
    expect(localProgress.readGuest().value).toEqual({});
  });

  it("drops entries stored under mismatched or duplicate alias keys", () => {
    store({ wrong: saved, "FC002::hanzi-es": saved });
    expect(localProgress.readGuest().value).toEqual({});
  });

  it("strips unknown entry properties", () => {
    store({ [savedKey]: { ...saved, futureField: "ignored" } });
    expect(localProgress.readGuest().value).toEqual({ [savedKey]: saved });
  });

  it("falls back to an empty map for corrupt JSON", () => {
    window.localStorage.setItem(GUEST_KEY, "not-json");
    expect(localProgress.readGuest()).toEqual({ value: {}, available: true });
  });
});
