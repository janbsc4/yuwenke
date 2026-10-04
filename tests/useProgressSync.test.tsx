import { act, renderHook, waitFor } from "@testing-library/react";
import type { User } from "firebase/auth";

import {
  useProgressSync,
  type ProgressSyncFirebaseClient,
} from "../src/hooks/useProgressSync";
import { loadFlashcards } from "../src/data/loadFlashcards";
import { localCardPacks } from "../src/lib/localCardPacks";
import { localFavorites } from "../src/lib/localFavorites";
import { localProgress } from "../src/lib/localProgress";
import { createStudyUnits, unitKey, visibleUnits } from "../src/lib/study";
import type { CardPackState, FavoriteEntry, ProgressEntry } from "../src/types";

const user = {
  uid: "alice",
  displayName: "Alice",
  email: "alice@example.com",
} as User;

const options = {
  cards: loadFlashcards(),
  orderedPackIds: ["CP001", "CP002"],
  packIdByCardId: { FC001: "CP001", FC002: "CP002" },
};

function packState(
  openPackIds = ["CP001"],
  resetAt = 0,
  clientUpdatedAt = 10,
): CardPackState {
  return {
    openPackIds,
    clientUpdatedAt,
    serverUpdatedAt: null,
    resetAt,
    schemaVersion: 1,
  };
}

function progressEntry(): ProgressEntry {
  return {
    cardId: "FC001",
    direction: "hanzi-es",
    status: "learning",
    clientUpdatedAt: 10,
    serverUpdatedAt: null,
    schemaVersion: 1,
  };
}

function favoriteEntry(): FavoriteEntry {
  return {
    cardId: "FC002",
    favorite: true,
    clientUpdatedAt: 11,
    serverUpdatedAt: null,
    schemaVersion: 1,
  };
}

interface AdapterControls {
  client: ProgressSyncFirebaseClient;
  publishProgress: (
    progress: Record<string, ProgressEntry>,
    serverConfirmed?: boolean,
    pendingWrites?: boolean,
  ) => void;
  publishPackState: (state: CardPackState) => void;
  publishFavorites: (
    favorites: Record<string, FavoriteEntry>,
    serverConfirmed?: boolean,
    pendingWrites?: boolean,
  ) => void;
}

function firebaseAdapter(
  overrides: Partial<ProgressSyncFirebaseClient> = {},
): AdapterControls {
  let progressObserver:
    | Parameters<ProgressSyncFirebaseClient["observeCloudProgress"]>[1]
    | null = null;
  let packStateObserver:
    | Parameters<ProgressSyncFirebaseClient["observeCloudCardPackState"]>[1]
    | null = null;
  let favoritesObserver:
    | Parameters<ProgressSyncFirebaseClient["observeCloudFavorites"]>[1]
    | null = null;

  const client: ProgressSyncFirebaseClient = {
    observeAuth: vi.fn((onUser) => {
      onUser(user);
      return () => undefined;
    }),
    observeCloudProgress: vi.fn((_uid, onProgress) => {
      progressObserver = onProgress;
      return () => undefined;
    }),
    observeCloudFavorites: vi.fn((_uid, onFavorites) => {
      favoritesObserver = onFavorites;
      return () => undefined;
    }),
    observeCloudCardPackState: vi.fn((_uid, onState) => {
      packStateObserver = onState;
      return () => undefined;
    }),
    mergeCloudCardPackState: vi.fn(async (_uid, localState) => localState),
    resetCloudStudyState: vi.fn(async () => packState(["CP001"], 100, 100)),
    signInWithGoogle: vi.fn(async () => user),
    signOutFromFirebase: vi.fn(async () => undefined),
    writeCloudProgressBatch: vi.fn(async () => undefined),
    writeCloudFavoritesBatch: vi.fn(async () => undefined),
    ...overrides,
  };

  return {
    client,
    publishProgress: (progress, serverConfirmed = true, pendingWrites = false) =>
      progressObserver?.(progress, serverConfirmed, pendingWrites),
    publishPackState: (state) => packStateObserver?.(state, true, false),
    publishFavorites: (favorites, serverConfirmed = true, pendingWrites = false) =>
      favoritesObserver?.(favorites, serverConfirmed, pendingWrites),
  };
}

function renderAuthenticatedSync(client: ProgressSyncFirebaseClient) {
  return renderHook(() =>
    useProgressSync(options, {
      firebaseConfigured: true,
      loadFirebaseClient: async () => client,
    }),
  );
}

describe("authenticated progress synchronization", () => {
  it("uses the header state without a success notice and waits for every cloud snapshot before showing synced", async () => {
    const { client, publishProgress, publishFavorites, publishPackState } = firebaseAdapter();
    const { result } = renderAuthenticatedSync(client);
    await waitFor(() => expect(client.writeCloudFavoritesBatch).toHaveBeenCalled());
    await waitFor(() => expect(localCardPacks.readOutbox("alice").value).toBeNull());
    expect(result.current.syncState).toBe("syncing");
    expect(result.current.notice).toBeNull();

    act(() => {
      publishPackState(packState());
      publishProgress({}, false);
      publishFavorites({});
    });
    expect(result.current.syncState).toBe("syncing");

    act(() => publishProgress({}));
    await waitFor(() => expect(result.current.syncState).toBe("synced"));
    expect(result.current.notice).toBeNull();

    let finishWrite: (() => void) | undefined;
    vi.mocked(client.writeCloudProgressBatch).mockImplementation(() => new Promise<void>((resolve) => {
      finishWrite = resolve;
    }));
    vi.mocked(client.writeCloudProgressBatch).mockClear();
    act(() => result.current.setStatus("FC001", "hanzi-meaning", "learning"));
    await waitFor(() => expect(client.writeCloudProgressBatch).toHaveBeenCalled());
    expect(result.current.syncState).toBe("syncing");
    expect(result.current.notice).toBeNull();

    await act(async () => finishWrite?.());
    await waitFor(() => expect(result.current.syncState).toBe("synced"));
    expect(result.current.notice).toBeNull();
  });

  it("combines unseen units with Firebase learning progress without writing progress for unseen cards", async () => {
    const { client, publishProgress } = firebaseAdapter();
    const { result } = renderAuthenticatedSync(client);
    await waitFor(() => expect(result.current.ready).toBe(true));
    await waitFor(() => expect(client.writeCloudProgressBatch).toHaveBeenCalledWith("alice", {}));
    vi.mocked(client.writeCloudProgressBatch).mockClear();
    const learning: ProgressEntry = {
      ...progressEntry(), direction: "hanzi-meaning", resetAt: 0, schemaVersion: 2,
    };
    const known: ProgressEntry = {
      ...learning, cardId: "FC002", status: "known",
    };
    act(() => publishProgress({
      [unitKey(learning.cardId, learning.direction)]: learning,
      [unitKey(known.cardId, known.direction)]: known,
    }));
    await waitFor(() => expect(Object.keys(result.current.progress)).toHaveLength(2));
    const units = createStudyUnits(options.cards.filter((card) => ["FC001", "FC002"].includes(card.id)));
    const queue = visibleUnits(units, "study", result.current.progress,
      { query: "", topic: "all", type: "all" }, {}, new Set(["CP001"]), options.packIdByCardId, "en");
    expect(queue.map((unit) => unit.key)).toEqual(["FC001::hanzi-meaning", "FC001::meaning-hanzi"]);
    expect(result.current.progress["FC001::meaning-hanzi"]).toBeUndefined();
    expect(client.writeCloudProgressBatch).not.toHaveBeenCalled();
    act(() => result.current.setStatus("FC001", "meaning-hanzi", "learning"));
    await waitFor(() => expect(client.writeCloudProgressBatch).toHaveBeenCalledWith("alice", {
      "FC001::meaning-hanzi": expect.objectContaining({
        cardId: "FC001", direction: "meaning-hanzi", status: "learning", schemaVersion: 2, resetAt: 0,
      }),
    }));
  });

  it("performs Pack-State Migration and unions guest packs on sign-in", async () => {
    const progress = progressEntry();
    const favorite = favoriteEntry();
    localProgress.writeGuest({
      [unitKey(progress.cardId, progress.direction)]: progress,
    });
    localFavorites.writeGuest({ [favorite.cardId]: favorite });
    localCardPacks.writeGuest(packState(["CP001", "CP002"]));
    const { client } = firebaseAdapter();

    const { result } = renderAuthenticatedSync(client);

    await waitFor(() => expect(result.current.user?.uid).toBe("alice"));
    await waitFor(() =>
      expect(client.mergeCloudCardPackState).toHaveBeenCalled(),
    );
    expect(client.mergeCloudCardPackState).toHaveBeenCalledWith(
      "alice",
      expect.objectContaining({ openPackIds: ["CP001", "CP002"] }),
      options.orderedPackIds,
      options.packIdByCardId,
      expect.objectContaining({ openPackIds: ["CP001", "CP002"] }),
    );
    await waitFor(() =>
      expect(client.writeCloudProgressBatch).toHaveBeenCalled(),
    );
    expect(client.writeCloudProgressBatch).toHaveBeenCalledWith(
      "alice",
      {
        [unitKey(progress.cardId, "hanzi-meaning")]: expect.objectContaining({
          direction: "hanzi-meaning",
          resetAt: 0,
          schemaVersion: 2,
        }),
      },
    );
  });

  it("lets a tied neutral cloud record beat legacy local progress without re-uploading it", async () => {
    const legacy = { ...progressEntry(), serverUpdatedAt: 100 };
    localProgress.writeGuest({
      [unitKey(legacy.cardId, legacy.direction)]: legacy,
    });
    const { client, publishProgress } = firebaseAdapter();
    const { result } = renderAuthenticatedSync(client);

    await waitFor(() => expect(client.writeCloudProgressBatch).toHaveBeenCalled());
    vi.mocked(client.writeCloudProgressBatch).mockClear();

    const cloud: ProgressEntry = {
      ...legacy,
      direction: "hanzi-meaning",
      status: "known",
      serverUpdatedAt: 11,
      resetAt: 0,
      schemaVersion: 2,
    };
    act(() =>
      publishProgress({
        [unitKey(cloud.cardId, cloud.direction)]: cloud,
      }),
    );

    await waitFor(() =>
      expect(result.current.progress[unitKey(cloud.cardId, cloud.direction)]).toEqual(cloud),
    );
    expect(client.writeCloudProgressBatch).not.toHaveBeenCalled();
    expect(
      localProgress.readUser("alice").value[unitKey(legacy.cardId, legacy.direction)],
    ).toEqual(legacy);
  });

  it("drops local and pending state when a newer Reset Boundary arrives", async () => {
    const progress = progressEntry();
    const favorite = favoriteEntry();
    localProgress.writeGuest({
      [unitKey(progress.cardId, progress.direction)]: progress,
    });
    localFavorites.writeGuest({ [favorite.cardId]: favorite });
    const { client, publishPackState } = firebaseAdapter();
    const { result } = renderAuthenticatedSync(client);

    await waitFor(() => expect(result.current.progress).not.toEqual({}));
    act(() => publishPackState(packState(["CP001"], 100, 100)));

    await waitFor(() => expect(result.current.progress).toEqual({}));
    expect(result.current.favorites).toEqual({});
    expect(localProgress.readOutbox("alice").value).toEqual({});
    expect(localFavorites.readOutbox("alice").value).toEqual({});
  });

  it("applies a server-confirmed Account Reset before clearing local study state", async () => {
    const progress = progressEntry();
    const favorite = favoriteEntry();
    localProgress.writeGuest({
      [unitKey(progress.cardId, progress.direction)]: progress,
    });
    localFavorites.writeGuest({ [favorite.cardId]: favorite });
    localCardPacks.writeGuest(packState(["CP001", "CP002"]));
    const resetState = packState(["CP001"], 100, 100);
    const { client } = firebaseAdapter({
      resetCloudStudyState: vi.fn(async () => resetState),
    });
    const { result } = renderAuthenticatedSync(client);

    await waitFor(() => expect(result.current.user?.uid).toBe("alice"));
    let reset = false;
    await act(async () => {
      reset = await result.current.resetStudy();
    });

    expect(reset).toBe(true);
    expect(client.resetCloudStudyState).toHaveBeenCalledWith("alice", "CP001");
    expect(result.current.progress).toEqual({});
    expect(result.current.favorites).toEqual({});
    expect(result.current.openPackIds).toEqual(["CP001"]);
    expect(localProgress.readUser("alice").value).toEqual({});
    expect(localFavorites.readUser("alice").value).toEqual({});
    expect(localCardPacks.readUser("alice").value).toEqual(resetState);
  });

  it("keeps local study state when a server-confirmed Account Reset fails", async () => {
    const progress = progressEntry();
    localProgress.writeGuest({
      [unitKey(progress.cardId, progress.direction)]: progress,
    });
    const { client } = firebaseAdapter({
      resetCloudStudyState: vi.fn(async () => {
        throw new Error("offline");
      }),
    });
    const { result } = renderAuthenticatedSync(client);

    await waitFor(() => expect(result.current.user?.uid).toBe("alice"));
    let reset = true;
    await act(async () => {
      reset = await result.current.resetStudy();
    });

    expect(reset).toBe(false);
    expect(result.current.progress).not.toEqual({});
    expect(result.current.notice).toBe("accountResetFailed");
  });

  it("retries a failed authenticated outbox without losing the pending change", async () => {
    const progress = progressEntry();
    localProgress.writeGuest({
      [unitKey(progress.cardId, progress.direction)]: progress,
    });
    const writeCloudProgressBatch = vi
      .fn<ProgressSyncFirebaseClient["writeCloudProgressBatch"]>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(undefined);
    const { client } = firebaseAdapter({ writeCloudProgressBatch });
    const { result } = renderAuthenticatedSync(client);

    await waitFor(() => expect(result.current.syncState).toBe("error"));
    expect(result.current.notice).toBe("willSyncWhenOnline");
    expect(localProgress.readOutbox("alice").value).not.toEqual({});

    await act(async () => result.current.retry());

    await waitFor(() =>
      expect(writeCloudProgressBatch).toHaveBeenCalledTimes(2),
    );
    for (const [, uploaded] of writeCloudProgressBatch.mock.calls) {
      expect(Object.values(uploaded)).toEqual([
        expect.objectContaining({
          direction: "hanzi-meaning",
          resetAt: 0,
          schemaVersion: 2,
        }),
      ]);
    }
    expect(localProgress.readOutbox("alice").value).toEqual({});
    expect(result.current.notice).toBeNull();
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((finish) => { resolve = finish; });
  return { promise, resolve };
}

it("uploads the latest progress and favorites queued during a delayed pack merge, retaining them on failure", async () => {
  const merge = deferred<CardPackState>();
  const { client } = firebaseAdapter({
    mergeCloudCardPackState: vi.fn(() => merge.promise),
    writeCloudProgressBatch: vi.fn(async () => { throw new Error("offline"); }),
    writeCloudFavoritesBatch: vi.fn(async () => { throw new Error("offline"); }),
  });
  const { result } = renderAuthenticatedSync(client);
  await waitFor(() => expect(client.mergeCloudCardPackState).toHaveBeenCalled());
  act(() => {
    result.current.setStatus("FC001", "hanzi-meaning", "learning");
    result.current.setStatus("FC001", "hanzi-meaning", "known");
    result.current.setFavorite("FC002", true);
  });
  await act(async () => merge.resolve(packState()));
  await waitFor(() => expect(result.current.syncState).toBe("error"));
  const progress = localProgress.readOutbox("alice").value;
  const favorites = localFavorites.readOutbox("alice").value;
  expect(progress["FC001::hanzi-meaning"].status).toBe("known");
  expect(favorites.FC002.favorite).toBe(true);
  expect(client.writeCloudProgressBatch).toHaveBeenCalledWith("alice", progress);
  expect(client.writeCloudFavoritesBatch).toHaveBeenCalledWith("alice", favorites);

  vi.mocked(client.writeCloudProgressBatch).mockResolvedValue(undefined);
  vi.mocked(client.writeCloudFavoritesBatch).mockResolvedValue(undefined);
  await act(async () => result.current.retry());
  expect(localProgress.readOutbox("alice").value).toEqual({});
  expect(localFavorites.readOutbox("alice").value).toEqual({});
});

it("keeps a newer decision queued while the preceding batch is being acknowledged", async () => {
  const { client } = firebaseAdapter();
  const { result } = renderAuthenticatedSync(client);
  await waitFor(() => expect(localCardPacks.readOutbox("alice").value).toBeNull());
  const write = deferred<undefined>();
  vi.mocked(client.writeCloudProgressBatch).mockClear().mockImplementationOnce(() => write.promise);
  act(() => result.current.setStatus("FC001", "hanzi-meaning", "learning"));
  await waitFor(() => expect(client.writeCloudProgressBatch).toHaveBeenCalledTimes(1));
  act(() => result.current.setStatus("FC001", "hanzi-meaning", "known"));
  const latest = localProgress.readOutbox("alice").value;
  await act(async () => write.resolve(undefined));
  await waitFor(() => expect(client.writeCloudProgressBatch).toHaveBeenCalledTimes(2));
  expect(client.writeCloudProgressBatch).toHaveBeenLastCalledWith("alice", latest);
  expect(latest["FC001::hanzi-meaning"].status).toBe("known");
  expect(localProgress.readOutbox("alice").value).toEqual({});
});

it("preserves pending pack openings across sign-out and uploads them on the next sign-in", async () => {
  const { client } = firebaseAdapter({
    mergeCloudCardPackState: vi.fn(async () => { throw new Error("offline"); }),
  });
  const { result, unmount } = renderAuthenticatedSync(client);
  await waitFor(() => expect(result.current.syncState).toBe("error"));
  act(() => result.current.openPack("CP002"));
  await waitFor(() => expect(result.current.syncState).toBe("error"));
  await act(async () => result.current.signOut());
  expect(result.current.openPackIds).toEqual(["CP001"]);
  expect(localCardPacks.readOutbox("alice").value?.openPackIds).toContain("CP002");
  unmount();

  const reconnected = firebaseAdapter();
  const next = renderAuthenticatedSync(reconnected.client);
  await waitFor(() => expect(reconnected.client.mergeCloudCardPackState).toHaveBeenCalled());
  expect(next.result.current.openPackIds).toContain("CP002");
  await waitFor(() => expect(localCardPacks.readOutbox("alice").value).toBeNull());
});

it("keeps post-reset decisions made while a pack transaction is still pending", async () => {
  const merge = deferred<CardPackState>();
  const { client, publishPackState } = firebaseAdapter({
    mergeCloudCardPackState: vi.fn(() => merge.promise),
  });
  const { result } = renderAuthenticatedSync(client);
  await waitFor(() => expect(client.mergeCloudCardPackState).toHaveBeenCalled());
  act(() => {
    result.current.setStatus("FC001", "hanzi-meaning", "known");
    publishPackState(packState(["CP001"], 100, 100));
    result.current.setStatus("FC002", "hanzi-meaning", "learning");
  });
  await act(async () => merge.resolve(packState(["CP001"], 100, 100)));
  expect(client.writeCloudProgressBatch).toHaveBeenCalledWith("alice", {
    "FC002::hanzi-meaning": expect.objectContaining({ resetAt: 100, status: "learning" }),
  });
  expect(result.current.progress["FC001::hanzi-meaning"]).toBeUndefined();
});
