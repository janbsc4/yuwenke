import { act, renderHook, waitFor } from "@testing-library/react";
import type { User } from "firebase/auth";

import {
  useProgressSync,
  type ProgressSyncFirebaseClient,
} from "../src/hooks/useProgressSync";
import { localCardPacks } from "../src/lib/localCardPacks";
import { localFavorites } from "../src/lib/localFavorites";
import { localProgress } from "../src/lib/localProgress";
import { unitKey } from "../src/lib/study";
import type { CardPackState, FavoriteEntry, ProgressEntry } from "../src/types";

const user = {
  uid: "alice",
  displayName: "Alice",
  email: "alice@example.com",
} as User;

const options = {
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
  publishPackState: (state: CardPackState) => void;
}

function firebaseAdapter(
  overrides: Partial<ProgressSyncFirebaseClient> = {},
): AdapterControls {
  let packStateObserver:
    | Parameters<ProgressSyncFirebaseClient["observeCloudCardPackState"]>[1]
    | null = null;

  const client: ProgressSyncFirebaseClient = {
    observeAuth: vi.fn((onUser) => {
      onUser(user);
      return () => undefined;
    }),
    observeCloudProgress: vi.fn(() => () => undefined),
    observeCloudFavorites: vi.fn(() => () => undefined),
    observeCloudCardPackState: vi.fn((_uid, onState) => {
      packStateObserver = onState;
      return () => undefined;
    }),
    mergeCloudCardPackState: vi.fn(async (_uid, localState) => localState),
    resetCloudStudyState: vi.fn(async () => packState(["CP001"], 100, 100)),
    signInWithGoogle: vi.fn(async () => user),
    signOutFromFirebase: vi.fn(async () => undefined),
    writeCloudProgress: vi.fn(async () => undefined),
    writeCloudFavorite: vi.fn(async () => undefined),
    writeCloudProgressBatch: vi.fn(async () => undefined),
    writeCloudFavoritesBatch: vi.fn(async () => undefined),
    ...overrides,
  };

  return {
    client,
    publishPackState: (state) => packStateObserver?.(state, true, false),
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
      expect.objectContaining({
        [unitKey(progress.cardId, progress.direction)]: expect.objectContaining(
          {
            resetAt: 0,
            schemaVersion: 2,
          },
        ),
      }),
    );
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
    expect(result.current.notice).toBe(
      "No se pudo confirmar el restablecimiento. No hemos borrado tus datos locales.",
    );
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
    expect(localProgress.readOutbox("alice").value).not.toEqual({});

    await act(async () => result.current.retry());

    await waitFor(() =>
      expect(writeCloudProgressBatch).toHaveBeenCalledTimes(2),
    );
    expect(localProgress.readOutbox("alice").value).toEqual({});
  });
});
