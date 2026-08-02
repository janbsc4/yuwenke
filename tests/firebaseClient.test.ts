import { Timestamp, type DocumentSnapshot, type QuerySnapshot } from "firebase/firestore";

import { snapshotCardPackState, snapshotFavorites } from "../src/lib/firebaseClient";

function snapshot(
  documents: Array<{ id: string; data: Record<string, unknown> }>,
): QuerySnapshot {
  return {
    docs: documents.map((document) => ({
      id: document.id,
      data: () => document.data,
    })),
  } as unknown as QuerySnapshot;
}

describe("Firebase favorite snapshots", () => {
  it("parses true favorites and false tombstones", () => {
    const result = snapshotFavorites(
      snapshot([
        {
          id: "FC001",
          data: {
            cardId: "FC001",
            favorite: true,
            clientUpdatedAt: Timestamp.fromMillis(10),
            serverUpdatedAt: Timestamp.fromMillis(11),
            schemaVersion: 1,
          },
        },
        {
          id: "FC002",
          data: {
            cardId: "FC002",
            favorite: false,
            clientUpdatedAt: Timestamp.fromMillis(20),
            serverUpdatedAt: null,
            schemaVersion: 1,
          },
        },
      ]),
    );

    expect(result.FC001.favorite).toBe(true);
    expect(result.FC001.serverUpdatedAt).toBe(11);
    expect(result.FC002.favorite).toBe(false);
  });

  it("ignores malformed records and mismatched document ids", () => {
    const result = snapshotFavorites(
      snapshot([
        {
          id: "wrong",
          data: {
            cardId: "FC001",
            favorite: true,
            clientUpdatedAt: Timestamp.fromMillis(10),
            schemaVersion: 1,
          },
        },
        {
          id: "FC002",
          data: {
            cardId: "FC002",
            favorite: "yes",
            clientUpdatedAt: Timestamp.fromMillis(20),
            schemaVersion: 1,
          },
        },
      ]),
    );

    expect(result).toEqual({});
  });
});

describe("Firebase card pack state", () => {
  it("parses an open-pack set and its reset boundary", () => {
    const result = snapshotCardPackState({
      exists: () => true,
      data: () => ({
        openPackIds: ["CP001", "CP003"],
        clientUpdatedAt: Timestamp.fromMillis(10),
        serverUpdatedAt: Timestamp.fromMillis(11),
        resetAt: Timestamp.fromMillis(5),
        schemaVersion: 1,
      }),
    } as unknown as DocumentSnapshot);

    expect(result).toEqual({
      openPackIds: ["CP001", "CP003"],
      clientUpdatedAt: 10,
      serverUpdatedAt: 11,
      resetAt: 5,
      schemaVersion: 1,
    });
  });

  it("ignores missing and malformed pack state", () => {
    expect(
      snapshotCardPackState({ exists: () => false } as unknown as DocumentSnapshot),
    ).toBeNull();
    expect(
      snapshotCardPackState({
        exists: () => true,
        data: () => ({
          openPackIds: ["wrong"],
          clientUpdatedAt: Timestamp.fromMillis(10),
          serverUpdatedAt: Timestamp.fromMillis(11),
          resetAt: Timestamp.fromMillis(0),
          schemaVersion: 1,
        }),
      } as unknown as DocumentSnapshot),
    ).toBeNull();
  });
});
