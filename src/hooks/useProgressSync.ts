import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";

import type {
  CardPackState,
  FavoriteEntry,
  FavoriteMap,
  ProgressEntry,
  ProgressMap,
  ProgressStatus,
  PackIdByCardId,
  StudyDirection,
} from "../types";
import { isFirebaseConfigured } from "../lib/firebaseConfig";
import { localFavorites } from "../lib/localFavorites";
import { localCardPacks } from "../lib/localCardPacks";
import { localProgress } from "../lib/localProgress";
import {
  mergeFavorites,
  entriesAtResetBoundary,
  entriesWithResetBoundary,
  mergeLocalFavorites,
  mergeLocalProgress,
  mergeProgress,
  mergePackStates,
  mergeGuestOpenPacks,
  nextClientTimestamp,
  unitKey,
  inferOpenPacksForPackStateMigration,
} from "../lib/study";

type FirebaseClientModule = typeof import("../lib/firebaseClient");
export type ProgressSyncFirebaseClient = Pick<
  FirebaseClientModule,
  | "mergeCloudCardPackState"
  | "observeAuth"
  | "observeCloudCardPackState"
  | "observeCloudFavorites"
  | "observeCloudProgress"
  | "resetCloudStudyState"
  | "signInWithGoogle"
  | "signOutFromFirebase"
  | "writeCloudFavorite"
  | "writeCloudFavoritesBatch"
  | "writeCloudProgress"
  | "writeCloudProgressBatch"
>;

export interface ProgressSyncDependencies {
  firebaseConfigured: boolean;
  loadFirebaseClient: () => Promise<ProgressSyncFirebaseClient>;
}

let loadedFirebaseClient: FirebaseClientModule | null = null;
let firebaseClientPromise: Promise<FirebaseClientModule> | null = null;

function loadDefaultFirebaseClient(): Promise<FirebaseClientModule> {
  if (loadedFirebaseClient) return Promise.resolve(loadedFirebaseClient);
  firebaseClientPromise ??= import("../lib/firebaseClient").then((client) => {
    loadedFirebaseClient = client;
    return client;
  });
  return firebaseClientPromise;
}

export type SyncState =
  | "local"
  | "syncing"
  | "synced"
  | "offline"
  | "error";

interface UseProgressSyncResult {
  progress: ProgressMap;
  favorites: FavoriteMap;
  openPackIds: string[];
  ready: boolean;
  storageAvailable: boolean;
  user: User | null;
  syncState: SyncState;
  firebaseConfigured: boolean;
  firebaseReady: boolean;
  notice: string;
  resetting: boolean;
  setStatus: (
    cardId: string,
    direction: StudyDirection,
    status: ProgressStatus,
  ) => void;
  setFavorite: (cardId: string, favorite: boolean) => void;
  openPack: (packId: string) => void;
  resetStudy: () => Promise<boolean>;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  retry: () => Promise<void>;
  clearNotice: () => void;
}

interface UseProgressSyncOptions {
  orderedPackIds: string[];
  packIdByCardId: PackIdByCardId;
}

interface TimestampedEntry {
  clientUpdatedAt: number;
}

function withoutAcknowledged<T extends TimestampedEntry>(
  outbox: Record<string, T>,
  cloud: Record<string, T>,
): Record<string, T> {
  const pending: Record<string, T> = {};
  for (const [key, entry] of Object.entries(outbox)) {
    if (!cloud[key] || cloud[key].clientUpdatedAt < entry.clientUpdatedAt) {
      pending[key] = entry;
    }
  }
  return pending;
}

function withoutSent<T extends TimestampedEntry>(
  latest: Record<string, T>,
  sent: Record<string, T>,
): Record<string, T> {
  const remaining: Record<string, T> = {};
  for (const [key, entry] of Object.entries(latest)) {
    if (sent[key]?.clientUpdatedAt !== entry.clientUpdatedAt) {
      remaining[key] = entry;
    }
  }
  return remaining;
}

function packStateForMigration(
  orderedPackIds: string[],
  packIdByCardId: PackIdByCardId,
  progress: ProgressMap,
  favorites: FavoriteMap,
): CardPackState {
  return {
    openPackIds: inferOpenPacksForPackStateMigration(
      orderedPackIds,
      packIdByCardId,
      progress,
      favorites,
    ),
    clientUpdatedAt: Date.now(),
    serverUpdatedAt: null,
    resetAt: 0,
    schemaVersion: 1,
  };
}

function mergeAvailablePackStates(
  fallback: CardPackState,
  ...states: Array<CardPackState | null>
): CardPackState {
  return states.reduce<CardPackState>(
    (merged, state) => (state ? mergePackStates(merged, state) : merged),
    fallback,
  );
}

function samePackState(left: CardPackState, right: CardPackState): boolean {
  return (
    left.resetAt === right.resetAt &&
    left.clientUpdatedAt === right.clientUpdatedAt &&
    left.openPackIds.length === right.openPackIds.length &&
    left.openPackIds.every((packId) => right.openPackIds.includes(packId))
  );
}

const defaultDependencies: ProgressSyncDependencies = {
  firebaseConfigured: isFirebaseConfigured,
  loadFirebaseClient: loadDefaultFirebaseClient,
};

export function useProgressSync(
  {
    orderedPackIds,
    packIdByCardId,
  }: UseProgressSyncOptions,
  {
    firebaseConfigured,
    loadFirebaseClient,
  }: ProgressSyncDependencies = defaultDependencies,
): UseProgressSyncResult {
  const [progress, setProgress] = useState<ProgressMap>({});
  const [favorites, setFavorites] = useState<FavoriteMap>({});
  const [packState, setPackState] = useState<CardPackState | null>(null);
  const [ready, setReady] = useState(false);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [syncState, setSyncState] = useState<SyncState>("local");
  const [firebaseReady, setFirebaseReady] = useState(false);
  const [notice, setNotice] = useState("");
  const [resetting, setResetting] = useState(false);

  const progressRef = useRef<ProgressMap>({});
  const favoritesRef = useRef<FavoriteMap>({});
  const packStateRef = useRef<CardPackState | null>(null);
  const firebaseClientRef = useRef<ProgressSyncFirebaseClient | null>(null);
  const userRef = useRef<User | null>(null);
  const generationRef = useRef(0);
  const unsubscribeProgressRef = useRef<(() => void) | null>(null);
  const unsubscribeFavoritesRef = useRef<(() => void) | null>(null);
  const unsubscribeCardPacksRef = useRef<(() => void) | null>(null);
  const flushingRef = useRef(false);
  const guestPackMergeRef = useRef({ active: false, openPackIds: [] as string[] });
  const confirmedRef = useRef({ progress: false, favorites: false, cardPacks: false });

  const replaceProgress = useCallback((next: ProgressMap) => {
    progressRef.current = next;
    setProgress(next);
  }, []);

  const replaceFavorites = useCallback((next: FavoriteMap) => {
    favoritesRef.current = next;
    setFavorites(next);
  }, []);

  const replacePackState = useCallback((next: CardPackState) => {
    packStateRef.current = next;
    setPackState(next);
  }, []);

  const adoptPackState = useCallback(
    (incoming: CardPackState, uid: string | null): CardPackState => {
      const current = packStateRef.current;
      const next = current ? mergePackStates(current, incoming) : incoming;
      if (current && next.resetAt > current.resetAt) {
        const nextProgress = entriesAtResetBoundary(progressRef.current, next.resetAt);
        const nextFavorites = entriesAtResetBoundary(favoritesRef.current, next.resetAt);
        replaceProgress(nextProgress);
        replaceFavorites(nextFavorites);
        if (uid) {
          localProgress.writeUser(uid, nextProgress);
          localFavorites.writeUser(uid, nextFavorites);
          const pendingProgress = entriesAtResetBoundary(
            localProgress.readOutbox(uid).value,
            next.resetAt,
          );
          const pendingFavorites = entriesAtResetBoundary(
            localFavorites.readOutbox(uid).value,
            next.resetAt,
          );
          Object.keys(pendingProgress).length > 0
            ? localProgress.writeOutbox(uid, pendingProgress)
            : localProgress.clearOutbox(uid);
          Object.keys(pendingFavorites).length > 0
            ? localFavorites.writeOutbox(uid, pendingFavorites)
            : localFavorites.clearOutbox(uid);
        }
      }
      replacePackState(next);
      if (uid) localCardPacks.writeUser(uid, next);
      else localCardPacks.writeGuest(next);
      return next;
    },
    [replaceFavorites, replacePackState, replaceProgress],
  );

  const settleSyncState = useCallback((uid: string) => {
    const progressPending = Object.keys(localProgress.readOutbox(uid).value).length > 0;
    const favoritesPending = Object.keys(localFavorites.readOutbox(uid).value).length > 0;
    const cardPacksPending = localCardPacks.readOutbox(uid).value !== null;
    if (
      !progressPending &&
      !favoritesPending &&
      !cardPacksPending &&
      confirmedRef.current.progress &&
      confirmedRef.current.favorites &&
      confirmedRef.current.cardPacks
    ) {
      localProgress.clearGuest();
      localFavorites.clearGuest();
      localCardPacks.clearGuest();
      setSyncState("synced");
    } else {
      setSyncState("syncing");
    }
  }, []);

  const flushOutboxes = useCallback(
    async (uid: string, generation: number) => {
      if (flushingRef.current || generation !== generationRef.current) return;
      let pendingProgress = localProgress.readOutbox(uid).value;
      let pendingFavorites = localFavorites.readOutbox(uid).value;
      const pendingCardPacks = localCardPacks.readOutbox(uid).value;
      if (
        Object.keys(pendingProgress).length === 0 &&
        Object.keys(pendingFavorites).length === 0 &&
        !pendingCardPacks
      ) {
        settleSyncState(uid);
        return;
      }

      flushingRef.current = true;
      setSyncState("syncing");
      let succeeded = false;
      try {
        const firebase = await loadFirebaseClient();
        firebaseClientRef.current = firebase;
        if (pendingCardPacks) {
          const merged = await firebase.mergeCloudCardPackState(
            uid,
            pendingCardPacks,
            orderedPackIds,
            packIdByCardId,
            guestPackMergeRef.current,
          );
          if (generation !== generationRef.current || userRef.current?.uid !== uid) return;
          guestPackMergeRef.current.active = false;
          adoptPackState(merged, uid);
          pendingProgress = entriesAtResetBoundary(pendingProgress, merged.resetAt);
          pendingFavorites = entriesAtResetBoundary(pendingFavorites, merged.resetAt);
          const latest = localCardPacks.readOutbox(uid).value;
          if (latest && samePackState(latest, pendingCardPacks)) {
            localCardPacks.clearOutbox(uid);
          }
          confirmedRef.current.cardPacks = true;
        }
        await Promise.all([
          firebase.writeCloudProgressBatch(uid, pendingProgress),
          firebase.writeCloudFavoritesBatch(uid, pendingFavorites),
        ]);
        if (generation !== generationRef.current || userRef.current?.uid !== uid) return;

        const remainingProgress = withoutSent(
          localProgress.readOutbox(uid).value,
          pendingProgress,
        ) as ProgressMap;
        const remainingFavorites = withoutSent(
          localFavorites.readOutbox(uid).value,
          pendingFavorites,
        ) as FavoriteMap;

        if (Object.keys(remainingProgress).length > 0) {
          localProgress.writeOutbox(uid, remainingProgress);
        } else {
          localProgress.clearOutbox(uid);
        }
        if (Object.keys(remainingFavorites).length > 0) {
          localFavorites.writeOutbox(uid, remainingFavorites);
        } else {
          localFavorites.clearOutbox(uid);
        }

        if (Object.keys(pendingProgress).length > 0) {
          confirmedRef.current.progress = true;
        }
        if (Object.keys(pendingFavorites).length > 0) {
          confirmedRef.current.favorites = true;
        }
        settleSyncState(uid);
        setNotice("Progreso, favoritas y packs sincronizados.");
        succeeded = true;
      } catch {
        if (generation === generationRef.current) {
          setSyncState(
            typeof navigator !== "undefined" && !navigator.onLine
              ? "offline"
              : "error",
          );
          setNotice("Guardaremos este cambio cuando vuelva la conexión.");
        }
      } finally {
        flushingRef.current = false;
        if (
          succeeded &&
          generation === generationRef.current &&
          userRef.current?.uid === uid
        ) {
          const stillPending =
            Object.keys(localProgress.readOutbox(uid).value).length > 0 ||
            Object.keys(localFavorites.readOutbox(uid).value).length > 0 ||
            localCardPacks.readOutbox(uid).value !== null;
          if (stillPending) void flushOutboxes(uid, generation);
        }
      }
    },
    [adoptPackState, orderedPackIds, packIdByCardId, settleSyncState],
  );

  useEffect(() => {
    const guestProgress = localProgress.readGuest();
    const guestFavorites = localFavorites.readGuest();
    const storedGuestPacks = localCardPacks.readGuest();
    const initialPackState =
      storedGuestPacks.value ??
      packStateForMigration(
        orderedPackIds,
        packIdByCardId,
        guestProgress.value,
        guestFavorites.value,
      );
    replaceProgress(guestProgress.value);
    replaceFavorites(guestFavorites.value);
    replacePackState(initialPackState);
    if (!storedGuestPacks.value) localCardPacks.writeGuest(initialPackState);
    setStorageAvailable(
      guestProgress.available && guestFavorites.available && storedGuestPacks.available,
    );
    setReady(true);

    if (!firebaseConfigured) return undefined;

    let cancelled = false;
    let unsubscribeAuth: () => void = () => undefined;
    void loadFirebaseClient()
      .then((firebase) => {
        if (cancelled) return;
        firebaseClientRef.current = firebase;
        setFirebaseReady(true);
        unsubscribeAuth = firebase.observeAuth(
          (nextUser) => {
            const generation = generationRef.current + 1;
            generationRef.current = generation;
            confirmedRef.current = { progress: false, favorites: false, cardPacks: false };
            guestPackMergeRef.current.active = false;
            unsubscribeProgressRef.current?.();
            unsubscribeFavoritesRef.current?.();
            unsubscribeCardPacksRef.current?.();
            unsubscribeProgressRef.current = null;
            unsubscribeFavoritesRef.current = null;
            unsubscribeCardPacksRef.current = null;
            userRef.current = nextUser;
            setUser(nextUser);

            if (!nextUser) {
              const nextGuestProgress = localProgress.readGuest();
              const nextGuestFavorites = localFavorites.readGuest();
              const storedPacks = localCardPacks.readGuest();
              const nextGuestPacks =
                storedPacks.value ??
                packStateForMigration(
                  orderedPackIds,
                  packIdByCardId,
                  nextGuestProgress.value,
                  nextGuestFavorites.value,
                );
              replaceProgress(nextGuestProgress.value);
              replaceFavorites(nextGuestFavorites.value);
              replacePackState(nextGuestPacks);
              if (!storedPacks.value) localCardPacks.writeGuest(nextGuestPacks);
              setStorageAvailable(
                nextGuestProgress.available &&
                  nextGuestFavorites.available &&
                  storedPacks.available,
              );
              setSyncState("local");
              return;
            }

            const guestProgress = localProgress.readGuest().value;
            const guestFavorites = localFavorites.readGuest().value;
            const combinedProgress = mergeLocalProgress(
              guestProgress,
              localProgress.readUser(nextUser.uid).value,
              localProgress.readOutbox(nextUser.uid).value,
            );
            const combinedFavorites = mergeLocalFavorites(
              guestFavorites,
              localFavorites.readUser(nextUser.uid).value,
              localFavorites.readOutbox(nextUser.uid).value,
            );
            const guestPackState = localCardPacks.readGuest().value;
            const guestInferredPackState = packStateForMigration(
              orderedPackIds,
              packIdByCardId,
              guestProgress,
              guestFavorites,
            );
            const accountProgress = mergeLocalProgress(
              localProgress.readUser(nextUser.uid).value,
              localProgress.readOutbox(nextUser.uid).value,
            );
            const accountFavorites = mergeLocalFavorites(
              localFavorites.readUser(nextUser.uid).value,
              localFavorites.readOutbox(nextUser.uid).value,
            );
            const accountPackState = mergeAvailablePackStates(
              packStateForMigration(
                orderedPackIds,
                packIdByCardId,
                accountProgress,
                accountFavorites,
              ),
              localCardPacks.readUser(nextUser.uid).value,
              localCardPacks.readOutbox(nextUser.uid).value,
            );
            guestPackMergeRef.current = {
              active: true,
              openPackIds: orderedPackIds.filter(
                (packId) =>
                  guestPackState?.openPackIds.includes(packId) ||
                  guestInferredPackState.openPackIds.includes(packId),
              ),
            };
            const localPackState = mergeGuestOpenPacks(
              orderedPackIds,
              accountPackState,
              guestPackState,
              guestInferredPackState.openPackIds,
            );
            const localProgressState = entriesAtResetBoundary(
              combinedProgress,
              localPackState.resetAt,
            );
            const localFavoriteState = entriesAtResetBoundary(
              combinedFavorites,
              localPackState.resetAt,
            );
            const progressMigration = entriesWithResetBoundary(mergeLocalProgress(
              localProgress.readOutbox(nextUser.uid).value,
              localProgress.readGuest().value,
            ), localPackState.resetAt);
            const favoriteMigration = entriesWithResetBoundary(mergeLocalFavorites(
              localFavorites.readOutbox(nextUser.uid).value,
              localFavorites.readGuest().value,
            ), localPackState.resetAt);

            if (Object.keys(progressMigration).length > 0) {
              localProgress.writeOutbox(nextUser.uid, progressMigration);
            }
            if (Object.keys(favoriteMigration).length > 0) {
              localFavorites.writeOutbox(nextUser.uid, favoriteMigration);
            }
            replaceProgress(localProgressState);
            replaceFavorites(localFavoriteState);
            replacePackState(localPackState);
            localProgress.writeUser(nextUser.uid, localProgressState);
            localFavorites.writeUser(nextUser.uid, localFavoriteState);
            localCardPacks.writeUser(nextUser.uid, localPackState);
            localCardPacks.writeOutbox(nextUser.uid, localPackState);
            setSyncState("syncing");

            unsubscribeProgressRef.current = firebase.observeCloudProgress(
              nextUser.uid,
              (cloud, serverConfirmed, pendingWrites) => {
                if (
                  generation !== generationRef.current ||
                  userRef.current?.uid !== nextUser.uid
                ) {
                  return;
                }
                const currentOutbox = localProgress.readOutbox(nextUser.uid).value;
                const localState = mergeLocalProgress(
                  progressRef.current,
                  currentOutbox,
                );
                const boundary = packStateRef.current?.resetAt ?? 0;
                const compatibleCloud = entriesAtResetBoundary(cloud, boundary);
                const { merged, localWinners } = mergeProgress(localState, compatibleCloud);
                replaceProgress(merged);
                localProgress.writeUser(nextUser.uid, merged);

                const serverHasAcknowledged = serverConfirmed && !pendingWrites;
                if (serverHasAcknowledged) confirmedRef.current.progress = true;
                const remaining = serverHasAcknowledged
                  ? (withoutAcknowledged(currentOutbox, compatibleCloud) as ProgressMap)
                  : currentOutbox;
                if (Object.keys(remaining).length > 0) {
                  localProgress.writeOutbox(nextUser.uid, remaining);
                } else {
                  localProgress.clearOutbox(nextUser.uid);
                }

                const uploads = mergeLocalProgress(remaining, localWinners);
                if (serverHasAcknowledged && Object.keys(uploads).length > 0) {
                  localProgress.writeOutbox(nextUser.uid, uploads);
                  void flushOutboxes(nextUser.uid, generation);
                } else if (serverHasAcknowledged) {
                  settleSyncState(nextUser.uid);
                }
              },
              () => {
                if (generation === generationRef.current) {
                  setSyncState(
                    typeof navigator !== "undefined" && !navigator.onLine
                      ? "offline"
                      : "error",
                  );
                }
              },
            );

            unsubscribeFavoritesRef.current = firebase.observeCloudFavorites(
              nextUser.uid,
              (cloud, serverConfirmed, pendingWrites) => {
                if (
                  generation !== generationRef.current ||
                  userRef.current?.uid !== nextUser.uid
                ) {
                  return;
                }
                const currentOutbox = localFavorites.readOutbox(nextUser.uid).value;
                const localState = mergeLocalFavorites(
                  favoritesRef.current,
                  currentOutbox,
                );
                const boundary = packStateRef.current?.resetAt ?? 0;
                const compatibleCloud = entriesAtResetBoundary(cloud, boundary);
                const { merged, localWinners } = mergeFavorites(localState, compatibleCloud);
                replaceFavorites(merged);
                localFavorites.writeUser(nextUser.uid, merged);

                const serverHasAcknowledged = serverConfirmed && !pendingWrites;
                if (serverHasAcknowledged) confirmedRef.current.favorites = true;
                const remaining = serverHasAcknowledged
                  ? (withoutAcknowledged(currentOutbox, compatibleCloud) as FavoriteMap)
                  : currentOutbox;
                if (Object.keys(remaining).length > 0) {
                  localFavorites.writeOutbox(nextUser.uid, remaining);
                } else {
                  localFavorites.clearOutbox(nextUser.uid);
                }

                const uploads = mergeLocalFavorites(remaining, localWinners);
                if (serverHasAcknowledged && Object.keys(uploads).length > 0) {
                  localFavorites.writeOutbox(nextUser.uid, uploads);
                  void flushOutboxes(nextUser.uid, generation);
                } else if (serverHasAcknowledged) {
                  settleSyncState(nextUser.uid);
                }
              },
              () => {
                if (generation === generationRef.current) {
                  setSyncState(
                    typeof navigator !== "undefined" && !navigator.onLine
                      ? "offline"
                      : "error",
                  );
                }
              },
            );

            unsubscribeCardPacksRef.current = firebase.observeCloudCardPackState(
              nextUser.uid,
              (cloud, serverConfirmed, pendingWrites) => {
                if (
                  generation !== generationRef.current ||
                  userRef.current?.uid !== nextUser.uid
                ) {
                  return;
                }
                const current =
                  localCardPacks.readOutbox(nextUser.uid).value ??
                  packStateRef.current ??
                  localPackState;
                const merged = cloud ? mergePackStates(current, cloud) : current;
                adoptPackState(merged, nextUser.uid);
                const serverHasAcknowledged = serverConfirmed && !pendingWrites;
                if (serverHasAcknowledged) {
                  confirmedRef.current.cardPacks = true;
                  if (cloud && samePackState(merged, cloud)) {
                    localCardPacks.clearOutbox(nextUser.uid);
                    settleSyncState(nextUser.uid);
                  } else {
                    localCardPacks.writeOutbox(nextUser.uid, merged);
                    void flushOutboxes(nextUser.uid, generation);
                  }
                }
              },
              () => {
                if (generation === generationRef.current) setSyncState("error");
              },
            );

            void flushOutboxes(nextUser.uid, generation);
          },
          () => {
            setSyncState("error");
            setNotice(
              "No se pudo iniciar la sincronización. Tu progreso local sigue a salvo.",
            );
          },
        );
      })
      .catch(() => {
        if (!cancelled) {
          setSyncState("error");
          setNotice(
            "No se pudo preparar la sincronización. Tu progreso local sigue a salvo.",
          );
        }
      });

    const handleOnline = () => {
      const currentUser = userRef.current;
      if (currentUser) {
        void flushOutboxes(currentUser.uid, generationRef.current);
      }
    };
    window.addEventListener("online", handleOnline);

    return () => {
      cancelled = true;
      generationRef.current += 1;
      unsubscribeProgressRef.current?.();
      unsubscribeFavoritesRef.current?.();
      unsubscribeCardPacksRef.current?.();
      unsubscribeAuth();
      window.removeEventListener("online", handleOnline);
    };
  }, [
    flushOutboxes,
    adoptPackState,
    orderedPackIds,
    packIdByCardId,
    replaceFavorites,
    replacePackState,
    replaceProgress,
    settleSyncState,
  ]);

  const setStatus = useCallback(
    (cardId: string, direction: StudyDirection, status: ProgressStatus) => {
      const key = unitKey(cardId, direction);
      const entry: ProgressEntry = {
        cardId,
        direction,
        status,
        clientUpdatedAt: nextClientTimestamp(progressRef.current[key]),
        serverUpdatedAt: null,
        resetAt: packStateRef.current?.resetAt ?? 0,
        schemaVersion: 2,
      };
      const next = { ...progressRef.current, [key]: entry };
      replaceProgress(next);

      const currentUser = userRef.current;
      if (!currentUser) {
        if (!localProgress.writeGuest(next)) setStorageAvailable(false);
        return;
      }

      localProgress.writeUser(currentUser.uid, next);
      const outbox = {
        ...localProgress.readOutbox(currentUser.uid).value,
        [key]: entry,
      };
      localProgress.writeOutbox(currentUser.uid, outbox);
      confirmedRef.current.progress = false;
      setSyncState("syncing");
      const generation = generationRef.current;
      void loadFirebaseClient()
        .then((firebase) => {
          firebaseClientRef.current = firebase;
          return firebase.writeCloudProgress(currentUser.uid, entry);
        })
        .then(() => {
          if (
            generation !== generationRef.current ||
            userRef.current?.uid !== currentUser.uid
          ) {
            return;
          }
          const latest = localProgress.readOutbox(currentUser.uid).value;
          if (latest[key]?.clientUpdatedAt === entry.clientUpdatedAt) {
            delete latest[key];
            if (Object.keys(latest).length > 0) {
              localProgress.writeOutbox(currentUser.uid, latest);
            } else {
              localProgress.clearOutbox(currentUser.uid);
            }
          }
          confirmedRef.current.progress = true;
          settleSyncState(currentUser.uid);
        })
        .catch(() => {
          if (generation === generationRef.current) {
            setSyncState(
              typeof navigator !== "undefined" && !navigator.onLine
                ? "offline"
                : "error",
            );
            setNotice("Guardaremos este cambio cuando vuelva la conexión.");
          }
        });
    },
    [replaceProgress, settleSyncState],
  );

  const setFavorite = useCallback(
    (cardId: string, favorite: boolean) => {
      const entry: FavoriteEntry = {
        cardId,
        favorite,
        clientUpdatedAt: nextClientTimestamp(favoritesRef.current[cardId]),
        serverUpdatedAt: null,
        resetAt: packStateRef.current?.resetAt ?? 0,
        schemaVersion: 2,
      };
      const next = { ...favoritesRef.current, [cardId]: entry };
      replaceFavorites(next);

      const currentUser = userRef.current;
      if (!currentUser) {
        if (!localFavorites.writeGuest(next)) setStorageAvailable(false);
        return;
      }

      localFavorites.writeUser(currentUser.uid, next);
      const outbox = {
        ...localFavorites.readOutbox(currentUser.uid).value,
        [cardId]: entry,
      };
      localFavorites.writeOutbox(currentUser.uid, outbox);
      confirmedRef.current.favorites = false;
      setSyncState("syncing");
      const generation = generationRef.current;
      void loadFirebaseClient()
        .then((firebase) => {
          firebaseClientRef.current = firebase;
          return firebase.writeCloudFavorite(currentUser.uid, entry);
        })
        .then(() => {
          if (
            generation !== generationRef.current ||
            userRef.current?.uid !== currentUser.uid
          ) {
            return;
          }
          const latest = localFavorites.readOutbox(currentUser.uid).value;
          if (latest[cardId]?.clientUpdatedAt === entry.clientUpdatedAt) {
            delete latest[cardId];
            if (Object.keys(latest).length > 0) {
              localFavorites.writeOutbox(currentUser.uid, latest);
            } else {
              localFavorites.clearOutbox(currentUser.uid);
            }
          }
          confirmedRef.current.favorites = true;
          settleSyncState(currentUser.uid);
        })
        .catch(() => {
          if (generation === generationRef.current) {
            setSyncState(
              typeof navigator !== "undefined" && !navigator.onLine
                ? "offline"
                : "error",
            );
            setNotice("Guardaremos este cambio cuando vuelva la conexión.");
          }
        });
    },
    [replaceFavorites, settleSyncState],
  );

  const openPack = useCallback(
    (packId: string) => {
      if (!orderedPackIds.includes(packId)) return;
      const current =
        packStateRef.current ??
        packStateForMigration(
          orderedPackIds,
          packIdByCardId,
          progressRef.current,
          favoritesRef.current,
        );
      if (current.openPackIds.includes(packId)) return;
      const next: CardPackState = {
        ...current,
        openPackIds: [...current.openPackIds, packId].sort(),
        clientUpdatedAt: nextClientTimestamp(current),
        serverUpdatedAt: null,
      };
      replacePackState(next);

      const currentUser = userRef.current;
      if (!currentUser) {
        if (!localCardPacks.writeGuest(next)) setStorageAvailable(false);
        return;
      }
      localCardPacks.writeUser(currentUser.uid, next);
      localCardPacks.writeOutbox(currentUser.uid, next);
      confirmedRef.current.cardPacks = false;
      setSyncState("syncing");
      void flushOutboxes(currentUser.uid, generationRef.current);
    },
    [flushOutboxes, orderedPackIds, packIdByCardId, replacePackState],
  );

  const resetStudy = useCallback(async (): Promise<boolean> => {
    const defaultPackId = orderedPackIds[0];
    if (!defaultPackId) return false;
    const currentUser = userRef.current;

    if (!currentUser) {
      const boundary = nextClientTimestamp(packStateRef.current ?? undefined);
      const next: CardPackState = {
        openPackIds: [defaultPackId],
        clientUpdatedAt: boundary,
        serverUpdatedAt: null,
        resetAt: boundary,
        schemaVersion: 1,
      };
      localProgress.clearGuest();
      localFavorites.clearGuest();
      localCardPacks.writeGuest(next);
      replaceProgress({});
      replaceFavorites({});
      replacePackState(next);
      setNotice("Tu progreso se ha restablecido en este dispositivo.");
      return true;
    }

    const firebase = firebaseClientRef.current;
    if (!firebase) {
      setNotice("Necesitas conexión para restablecer una cuenta sincronizada.");
      return false;
    }
    setResetting(true);
    setNotice("");
    guestPackMergeRef.current.active = false;
    const generation = generationRef.current;
    try {
      const next = await firebase.resetCloudStudyState(
        currentUser.uid,
        defaultPackId,
      );
      if (
        generation !== generationRef.current ||
        userRef.current?.uid !== currentUser.uid
      ) {
        return false;
      }
      localProgress.clearGuest();
      localFavorites.clearGuest();
      localCardPacks.clearGuest();
      localProgress.clearUser(currentUser.uid);
      localFavorites.clearUser(currentUser.uid);
      localProgress.clearOutbox(currentUser.uid);
      localFavorites.clearOutbox(currentUser.uid);
      localCardPacks.writeUser(currentUser.uid, next);
      localCardPacks.clearOutbox(currentUser.uid);
      replaceProgress({});
      replaceFavorites({});
      replacePackState(next);
      confirmedRef.current = { progress: true, favorites: true, cardPacks: true };
      setSyncState("synced");
      setNotice("Tu cuenta se ha restablecido.");
      return true;
    } catch {
      setNotice("No se pudo confirmar el restablecimiento. No hemos borrado tus datos locales.");
      return false;
    } finally {
      setResetting(false);
    }
  }, [orderedPackIds, replaceFavorites, replacePackState, replaceProgress]);

  const signIn = useCallback(async () => {
    setNotice("");
    const firebase = firebaseClientRef.current;
    if (!firebase) {
      setNotice(
        "La sincronización se está preparando. Inténtalo de nuevo en un momento.",
      );
      return;
    }
    try {
      await firebase.signInWithGoogle();
    } catch {
      setNotice("No se pudo iniciar sesión. Tu progreso local sigue a salvo.");
    }
  }, []);

  const signOut = useCallback(async () => {
    const currentUser = userRef.current;
    generationRef.current += 1;
    unsubscribeProgressRef.current?.();
    unsubscribeFavoritesRef.current?.();
    unsubscribeCardPacksRef.current?.();
    unsubscribeProgressRef.current = null;
    unsubscribeFavoritesRef.current = null;
    unsubscribeCardPacksRef.current = null;
    if (currentUser) {
      localProgress.clearUser(currentUser.uid);
      localFavorites.clearUser(currentUser.uid);
      localCardPacks.clearUser(currentUser.uid);
      localCardPacks.clearOutbox(currentUser.uid);
    }
    localProgress.clearGuest();
    localFavorites.clearGuest();
    localCardPacks.clearGuest();
    userRef.current = null;
    setUser(null);
    replaceProgress({});
    replaceFavorites({});
    const freshGuestPacks: CardPackState = {
      openPackIds: orderedPackIds.slice(0, 1),
      clientUpdatedAt: Date.now(),
      serverUpdatedAt: null,
      resetAt: 0,
      schemaVersion: 1,
    };
    replacePackState(freshGuestPacks);
    localCardPacks.writeGuest(freshGuestPacks);
    setSyncState("local");
    try {
      if (firebaseClientRef.current) {
        await firebaseClientRef.current.signOutFromFirebase();
      }
    } catch {
      // Local account state has already been isolated from the fresh guest session.
    } finally {
      setNotice("Sesión cerrada. Ahora estudias como invitado.");
    }
  }, [orderedPackIds, replaceFavorites, replacePackState, replaceProgress]);

  const retry = useCallback(async () => {
    const currentUser = userRef.current;
    if (currentUser) {
      await flushOutboxes(currentUser.uid, generationRef.current);
    }
  }, [flushOutboxes]);

  const clearNotice = useCallback(() => setNotice(""), []);

  return {
    progress,
    favorites,
    openPackIds: packState?.openPackIds ?? orderedPackIds.slice(0, 1),
    ready,
    storageAvailable,
    user,
    syncState,
    firebaseConfigured,
    firebaseReady,
    notice,
    resetting,
    setStatus,
    setFavorite,
    openPack,
    resetStudy,
    signIn,
    signOut,
    retry,
    clearNotice,
  };
}
