import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";

import type {
  FavoriteEntry,
  FavoriteMap,
  ProgressEntry,
  ProgressMap,
  ProgressStatus,
  StudyDirection,
} from "../types";
import { isFirebaseConfigured } from "../lib/firebaseConfig";
import { localFavorites } from "../lib/localFavorites";
import { localProgress } from "../lib/localProgress";
import {
  mergeFavorites,
  mergeLocalFavorites,
  mergeLocalProgress,
  mergeProgress,
  nextClientTimestamp,
  unitKey,
} from "../lib/study";

type FirebaseClientModule = typeof import("../lib/firebaseClient");

let loadedFirebaseClient: FirebaseClientModule | null = null;
let firebaseClientPromise: Promise<FirebaseClientModule> | null = null;

function loadFirebaseClient(): Promise<FirebaseClientModule> {
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
  ready: boolean;
  storageAvailable: boolean;
  user: User | null;
  syncState: SyncState;
  firebaseConfigured: boolean;
  firebaseReady: boolean;
  notice: string;
  setStatus: (
    cardId: string,
    direction: StudyDirection,
    status: ProgressStatus,
  ) => void;
  setFavorite: (cardId: string, favorite: boolean) => void;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  retry: () => Promise<void>;
  clearNotice: () => void;
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

export function useProgressSync(): UseProgressSyncResult {
  const [progress, setProgress] = useState<ProgressMap>({});
  const [favorites, setFavorites] = useState<FavoriteMap>({});
  const [ready, setReady] = useState(false);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [syncState, setSyncState] = useState<SyncState>("local");
  const [firebaseReady, setFirebaseReady] = useState(false);
  const [notice, setNotice] = useState("");

  const progressRef = useRef<ProgressMap>({});
  const favoritesRef = useRef<FavoriteMap>({});
  const userRef = useRef<User | null>(null);
  const generationRef = useRef(0);
  const unsubscribeProgressRef = useRef<(() => void) | null>(null);
  const unsubscribeFavoritesRef = useRef<(() => void) | null>(null);
  const flushingRef = useRef(false);
  const confirmedRef = useRef({ progress: false, favorites: false });

  const replaceProgress = useCallback((next: ProgressMap) => {
    progressRef.current = next;
    setProgress(next);
  }, []);

  const replaceFavorites = useCallback((next: FavoriteMap) => {
    favoritesRef.current = next;
    setFavorites(next);
  }, []);

  const settleSyncState = useCallback((uid: string) => {
    const progressPending = Object.keys(localProgress.readOutbox(uid).value).length > 0;
    const favoritesPending = Object.keys(localFavorites.readOutbox(uid).value).length > 0;
    if (
      !progressPending &&
      !favoritesPending &&
      confirmedRef.current.progress &&
      confirmedRef.current.favorites
    ) {
      localProgress.clearGuest();
      localFavorites.clearGuest();
      setSyncState("synced");
    } else {
      setSyncState("syncing");
    }
  }, []);

  const flushOutboxes = useCallback(
    async (uid: string, generation: number) => {
      if (flushingRef.current || generation !== generationRef.current) return;
      const pendingProgress = localProgress.readOutbox(uid).value;
      const pendingFavorites = localFavorites.readOutbox(uid).value;
      if (
        Object.keys(pendingProgress).length === 0 &&
        Object.keys(pendingFavorites).length === 0
      ) {
        settleSyncState(uid);
        return;
      }

      flushingRef.current = true;
      setSyncState("syncing");
      let succeeded = false;
      try {
        const firebase = await loadFirebaseClient();
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
        setNotice("Progreso y favoritas sincronizados.");
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
            Object.keys(localFavorites.readOutbox(uid).value).length > 0;
          if (stillPending) void flushOutboxes(uid, generation);
        }
      }
    },
    [settleSyncState],
  );

  useEffect(() => {
    const guestProgress = localProgress.readGuest();
    const guestFavorites = localFavorites.readGuest();
    replaceProgress(guestProgress.value);
    replaceFavorites(guestFavorites.value);
    setStorageAvailable(guestProgress.available && guestFavorites.available);
    setReady(true);

    if (!isFirebaseConfigured) return undefined;

    let cancelled = false;
    let unsubscribeAuth: () => void = () => undefined;
    void loadFirebaseClient()
      .then((firebase) => {
        if (cancelled) return;
        setFirebaseReady(true);
        unsubscribeAuth = firebase.observeAuth(
          (nextUser) => {
            const generation = generationRef.current + 1;
            generationRef.current = generation;
            confirmedRef.current = { progress: false, favorites: false };
            unsubscribeProgressRef.current?.();
            unsubscribeFavoritesRef.current?.();
            unsubscribeProgressRef.current = null;
            unsubscribeFavoritesRef.current = null;
            userRef.current = nextUser;
            setUser(nextUser);

            if (!nextUser) {
              const nextGuestProgress = localProgress.readGuest();
              const nextGuestFavorites = localFavorites.readGuest();
              replaceProgress(nextGuestProgress.value);
              replaceFavorites(nextGuestFavorites.value);
              setStorageAvailable(
                nextGuestProgress.available && nextGuestFavorites.available,
              );
              setSyncState("local");
              return;
            }

            const localProgressState = mergeLocalProgress(
              localProgress.readGuest().value,
              localProgress.readUser(nextUser.uid).value,
              localProgress.readOutbox(nextUser.uid).value,
            );
            const localFavoriteState = mergeLocalFavorites(
              localFavorites.readGuest().value,
              localFavorites.readUser(nextUser.uid).value,
              localFavorites.readOutbox(nextUser.uid).value,
            );
            const progressMigration = mergeLocalProgress(
              localProgress.readOutbox(nextUser.uid).value,
              localProgress.readGuest().value,
            );
            const favoriteMigration = mergeLocalFavorites(
              localFavorites.readOutbox(nextUser.uid).value,
              localFavorites.readGuest().value,
            );

            if (Object.keys(progressMigration).length > 0) {
              localProgress.writeOutbox(nextUser.uid, progressMigration);
            }
            if (Object.keys(favoriteMigration).length > 0) {
              localFavorites.writeOutbox(nextUser.uid, favoriteMigration);
            }
            replaceProgress(localProgressState);
            replaceFavorites(localFavoriteState);
            localProgress.writeUser(nextUser.uid, localProgressState);
            localFavorites.writeUser(nextUser.uid, localFavoriteState);
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
                const { merged, localWinners } = mergeProgress(localState, cloud);
                replaceProgress(merged);
                localProgress.writeUser(nextUser.uid, merged);

                const serverHasAcknowledged = serverConfirmed && !pendingWrites;
                if (serverHasAcknowledged) confirmedRef.current.progress = true;
                const remaining = serverHasAcknowledged
                  ? (withoutAcknowledged(currentOutbox, cloud) as ProgressMap)
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
                const { merged, localWinners } = mergeFavorites(localState, cloud);
                replaceFavorites(merged);
                localFavorites.writeUser(nextUser.uid, merged);

                const serverHasAcknowledged = serverConfirmed && !pendingWrites;
                if (serverHasAcknowledged) confirmedRef.current.favorites = true;
                const remaining = serverHasAcknowledged
                  ? (withoutAcknowledged(currentOutbox, cloud) as FavoriteMap)
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
      unsubscribeAuth();
      window.removeEventListener("online", handleOnline);
    };
  }, [
    flushOutboxes,
    replaceFavorites,
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
        schemaVersion: 1,
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
        .then((firebase) => firebase.writeCloudProgress(currentUser.uid, entry))
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
        schemaVersion: 1,
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
        .then((firebase) => firebase.writeCloudFavorite(currentUser.uid, entry))
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

  const signIn = useCallback(async () => {
    setNotice("");
    if (!loadedFirebaseClient) {
      setNotice(
        "La sincronización se está preparando. Inténtalo de nuevo en un momento.",
      );
      return;
    }
    try {
      await loadedFirebaseClient.signInWithGoogle();
    } catch {
      setNotice("No se pudo iniciar sesión. Tu progreso local sigue a salvo.");
    }
  }, []);

  const signOut = useCallback(async () => {
    const currentUser = userRef.current;
    generationRef.current += 1;
    unsubscribeProgressRef.current?.();
    unsubscribeFavoritesRef.current?.();
    unsubscribeProgressRef.current = null;
    unsubscribeFavoritesRef.current = null;
    if (currentUser) {
      localProgress.clearUser(currentUser.uid);
      localFavorites.clearUser(currentUser.uid);
    }
    localProgress.clearGuest();
    localFavorites.clearGuest();
    userRef.current = null;
    setUser(null);
    replaceProgress({});
    replaceFavorites({});
    setSyncState("local");
    try {
      if (loadedFirebaseClient) await loadedFirebaseClient.signOutFromFirebase();
    } catch {
      // Local account state has already been isolated from the fresh guest session.
    } finally {
      setNotice("Sesión cerrada. Ahora estudias como invitado.");
    }
  }, [replaceFavorites, replaceProgress]);

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
    ready,
    storageAvailable,
    user,
    syncState,
    firebaseConfigured: isFirebaseConfigured,
    firebaseReady,
    notice,
    setStatus,
    setFavorite,
    signIn,
    signOut,
    retry,
    clearNotice,
  };
}
