import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  browserLocalPersistence,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signOut,
  type Auth,
  type User,
  type Unsubscribe,
} from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  initializeFirestore,
  memoryLocalCache,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  waitForPendingWrites,
  writeBatch,
  type Firestore,
  type DocumentSnapshot,
  type QuerySnapshot,
} from "firebase/firestore";

import type {
  CardPackState,
  FavoriteEntry,
  FavoriteMap,
  ProgressEntry,
  ProgressMap,
  PackIdByCardId,
} from "../types";
import { firebaseConfig, isFirebaseConfigured } from "./firebaseConfig";
import {
  mergePackStatesWithGuest,
  openPackIdsForLegacyState,
  progressDocumentId,
  unitKey,
} from "./study";

interface FirebaseServices {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
}

let cachedServices: FirebaseServices | null = null;

export function getFirebaseServices(): FirebaseServices | null {
  if (!isFirebaseConfigured || typeof window === "undefined") return null;
  if (cachedServices) return cachedServices;

  const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = initializeFirestore(app, { localCache: memoryLocalCache() });
  void setPersistence(auth, browserLocalPersistence).catch(() => undefined);
  cachedServices = { app, auth, db };
  return cachedServices;
}

export function observeAuth(
  onUser: (user: User | null) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const services = getFirebaseServices();
  if (!services) return () => undefined;
  return onAuthStateChanged(services.auth, onUser, onError);
}

export async function signInWithGoogle(): Promise<User> {
  const services = getFirebaseServices();
  if (!services) throw new Error("Firebase no está configurado.");
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  const credential = await signInWithPopup(services.auth, provider);
  return credential.user;
}

export async function signOutFromFirebase(): Promise<void> {
  const services = getFirebaseServices();
  if (services) await signOut(services.auth);
}

function progressCollection(db: Firestore, uid: string) {
  return collection(db, "users", uid, "progress");
}

function progressDoc(db: Firestore, uid: string, entry: ProgressEntry) {
  return doc(
    db,
    "users",
    uid,
    "progress",
    progressDocumentId(entry.cardId, entry.direction),
  );
}

function favoritesCollection(db: Firestore, uid: string) {
  return collection(db, "users", uid, "favorites");
}

function favoriteDoc(db: Firestore, uid: string, entry: FavoriteEntry) {
  return doc(db, "users", uid, "favorites", entry.cardId);
}

function cardPackStateDoc(db: Firestore, uid: string) {
  return doc(db, "users", uid, "state", "cardPacks");
}

function firestoreData(entry: ProgressEntry) {
  const data = {
    cardId: entry.cardId,
    direction: entry.direction,
    status: entry.status,
    clientUpdatedAt: Timestamp.fromMillis(entry.clientUpdatedAt),
    serverUpdatedAt: serverTimestamp(),
    schemaVersion: entry.schemaVersion,
  };
  return entry.schemaVersion === 2
    ? { ...data, resetAt: Timestamp.fromMillis(entry.resetAt ?? 0) }
    : data;
}

function favoriteFirestoreData(entry: FavoriteEntry) {
  const data = {
    cardId: entry.cardId,
    favorite: entry.favorite,
    clientUpdatedAt: Timestamp.fromMillis(entry.clientUpdatedAt),
    serverUpdatedAt: serverTimestamp(),
    schemaVersion: entry.schemaVersion,
  };
  return entry.schemaVersion === 2
    ? { ...data, resetAt: Timestamp.fromMillis(entry.resetAt ?? 0) }
    : data;
}

function cardPackStateFirestoreData(state: CardPackState) {
  return {
    openPackIds: [...new Set(state.openPackIds)].sort(),
    clientUpdatedAt: Timestamp.fromMillis(state.clientUpdatedAt),
    serverUpdatedAt: serverTimestamp(),
    resetAt: Timestamp.fromMillis(state.resetAt),
    schemaVersion: 1,
  };
}

function timestampMillis(value: unknown): number | null {
  return value instanceof Timestamp ? value.toMillis() : null;
}

export function snapshotProgress(snapshot: QuerySnapshot): ProgressMap {
  const progress: ProgressMap = {};
  for (const document of snapshot.docs) {
    const data = document.data();
    const clientUpdatedAt = timestampMillis(data.clientUpdatedAt);
    if (
      typeof data.cardId !== "string" ||
      (data.direction !== "hanzi-es" && data.direction !== "es-hanzi") ||
      (data.status !== "learning" && data.status !== "known") ||
      clientUpdatedAt === null ||
      (data.schemaVersion !== 1 && data.schemaVersion !== 2) ||
      (data.schemaVersion === 2 && timestampMillis(data.resetAt) === null)
    ) {
      continue;
    }

    const entry: ProgressEntry = {
      cardId: data.cardId,
      direction: data.direction,
      status: data.status,
      clientUpdatedAt,
      serverUpdatedAt: timestampMillis(data.serverUpdatedAt),
      resetAt: data.schemaVersion === 2 ? timestampMillis(data.resetAt) ?? 0 : undefined,
      schemaVersion: data.schemaVersion,
    };
    progress[unitKey(entry.cardId, entry.direction)] = entry;
  }
  return progress;
}

export function snapshotFavorites(snapshot: QuerySnapshot): FavoriteMap {
  const favorites: FavoriteMap = {};
  for (const document of snapshot.docs) {
    const data = document.data();
    const clientUpdatedAt = timestampMillis(data.clientUpdatedAt);
    if (
      typeof data.cardId !== "string" ||
      typeof data.favorite !== "boolean" ||
      clientUpdatedAt === null ||
      (data.schemaVersion !== 1 && data.schemaVersion !== 2) ||
      (data.schemaVersion === 2 && timestampMillis(data.resetAt) === null) ||
      document.id !== data.cardId
    ) {
      continue;
    }

    favorites[data.cardId] = {
      cardId: data.cardId,
      favorite: data.favorite,
      clientUpdatedAt,
      serverUpdatedAt: timestampMillis(data.serverUpdatedAt),
      resetAt: data.schemaVersion === 2 ? timestampMillis(data.resetAt) ?? 0 : undefined,
      schemaVersion: data.schemaVersion,
    };
  }
  return favorites;
}

export function snapshotCardPackState(
  snapshot: DocumentSnapshot,
): CardPackState | null {
  if (!snapshot.exists()) return null;
  const data = snapshot.data();
  const openPackIds = Array.isArray(data.openPackIds)
    ? data.openPackIds.filter((value): value is string => typeof value === "string")
    : [];
  const clientUpdatedAt = timestampMillis(data.clientUpdatedAt);
  const resetAt = timestampMillis(data.resetAt);
  if (
    openPackIds.length === 0 ||
    openPackIds.some((packId) => !/^CP\d{3}$/.test(packId)) ||
    new Set(openPackIds).size !== openPackIds.length ||
    clientUpdatedAt === null ||
    resetAt === null ||
    data.schemaVersion !== 1
  ) {
    return null;
  }
  return {
    openPackIds: [...openPackIds].sort(),
    clientUpdatedAt,
    serverUpdatedAt: timestampMillis(data.serverUpdatedAt),
    resetAt,
    schemaVersion: 1,
  };
}

export function observeCloudProgress(
  uid: string,
  onProgress: (progress: ProgressMap, serverConfirmed: boolean, pending: boolean) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const services = getFirebaseServices();
  if (!services) return () => undefined;

  return onSnapshot(
    progressCollection(services.db, uid),
    { includeMetadataChanges: true },
    (snapshot) =>
      onProgress(
        snapshotProgress(snapshot),
        !snapshot.metadata.fromCache,
        snapshot.metadata.hasPendingWrites,
      ),
    onError,
  );
}

export function observeCloudFavorites(
  uid: string,
  onFavorites: (
    favorites: FavoriteMap,
    serverConfirmed: boolean,
    pending: boolean,
  ) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const services = getFirebaseServices();
  if (!services) return () => undefined;

  return onSnapshot(
    favoritesCollection(services.db, uid),
    { includeMetadataChanges: true },
    (snapshot) =>
      onFavorites(
        snapshotFavorites(snapshot),
        !snapshot.metadata.fromCache,
        snapshot.metadata.hasPendingWrites,
      ),
    onError,
  );
}

export function observeCloudCardPackState(
  uid: string,
  onState: (state: CardPackState | null, serverConfirmed: boolean, pending: boolean) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const services = getFirebaseServices();
  if (!services) return () => undefined;
  return onSnapshot(
    cardPackStateDoc(services.db, uid),
    { includeMetadataChanges: true },
    (snapshot) =>
      onState(
        snapshotCardPackState(snapshot),
        !snapshot.metadata.fromCache,
        snapshot.metadata.hasPendingWrites,
      ),
    onError,
  );
}

export async function mergeCloudCardPackState(
  uid: string,
  localState: CardPackState,
  orderedPackIds: string[],
  packIdByCardId: PackIdByCardId,
  guestPackMerge: { active: boolean; openPackIds: string[] },
): Promise<CardPackState> {
  const services = getFirebaseServices();
  if (!services) throw new Error("Firebase no está configurado.");
  const reference = cardPackStateDoc(services.db, uid);
  let candidate = localState;
  const existingState = await getDoc(reference);
  if (!existingState.exists()) {
    const [cloudProgress, cloudFavorites] = await Promise.all([
      getDocs(progressCollection(services.db, uid)),
      getDocs(favoritesCollection(services.db, uid)),
    ]);
    const inferred = new Set([
      ...candidate.openPackIds,
      ...openPackIdsForLegacyState(
        orderedPackIds,
        packIdByCardId,
        snapshotProgress(cloudProgress),
        snapshotFavorites(cloudFavorites),
      ),
    ]);
    candidate = {
      ...candidate,
      openPackIds: orderedPackIds.filter((packId) => inferred.has(packId)),
    };
  }
  const merged = await runTransaction(services.db, async (transaction) => {
    const snapshot = await transaction.get(reference);
    const cloudState = snapshotCardPackState(snapshot);
    const next = cloudState
      ? mergePackStatesWithGuest(
          orderedPackIds,
          candidate,
          cloudState,
          guestPackMerge.active ? guestPackMerge.openPackIds : [],
        )
      : candidate;
    transaction.set(reference, cardPackStateFirestoreData(next));
    return next;
  });
  await waitForPendingWrites(services.db);
  return merged;
}

export async function resetCloudStudyState(
  uid: string,
  defaultPackId: string,
): Promise<CardPackState> {
  const services = getFirebaseServices();
  if (!services) throw new Error("Firebase no está configurado.");
  const reference = cardPackStateDoc(services.db, uid);
  await setDoc(reference, {
    openPackIds: [defaultPackId],
    clientUpdatedAt: serverTimestamp(),
    serverUpdatedAt: serverTimestamp(),
    resetAt: serverTimestamp(),
    schemaVersion: 1,
  });
  await waitForPendingWrites(services.db);

  const state = snapshotCardPackState(await getDoc(reference));
  if (!state) throw new Error("El servidor no confirmó el restablecimiento.");

  const [progress, favorites] = await Promise.all([
    getDocs(progressCollection(services.db, uid)),
    getDocs(favoritesCollection(services.db, uid)),
  ]);
  const documents = [...progress.docs, ...favorites.docs];
  for (let index = 0; index < documents.length; index += 500) {
    const batch = writeBatch(services.db);
    for (const document of documents.slice(index, index + 500)) {
      batch.delete(document.ref);
    }
    await batch.commit();
  }
  await waitForPendingWrites(services.db);
  return state;
}

export async function writeCloudProgress(uid: string, entry: ProgressEntry): Promise<void> {
  const services = getFirebaseServices();
  if (!services) throw new Error("Firebase no está configurado.");
  await setDoc(progressDoc(services.db, uid, entry), firestoreData(entry));
  await waitForPendingWrites(services.db);
}

export async function writeCloudFavorite(
  uid: string,
  entry: FavoriteEntry,
): Promise<void> {
  const services = getFirebaseServices();
  if (!services) throw new Error("Firebase no está configurado.");
  await setDoc(favoriteDoc(services.db, uid, entry), favoriteFirestoreData(entry));
  await waitForPendingWrites(services.db);
}

export async function writeCloudProgressBatch(
  uid: string,
  progress: ProgressMap,
): Promise<void> {
  const services = getFirebaseServices();
  if (!services) throw new Error("Firebase no está configurado.");
  const entries = Object.values(progress);
  if (entries.length === 0) return;
  if (entries.length > 500) throw new Error("La sincronización supera el límite del lote.");

  const batch = writeBatch(services.db);
  for (const entry of entries) {
    batch.set(progressDoc(services.db, uid, entry), firestoreData(entry));
  }
  await batch.commit();
  await waitForPendingWrites(services.db);
}

export async function writeCloudFavoritesBatch(
  uid: string,
  favorites: FavoriteMap,
): Promise<void> {
  const services = getFirebaseServices();
  if (!services) throw new Error("Firebase no está configurado.");
  const entries = Object.values(favorites);
  if (entries.length === 0) return;
  if (entries.length > 500) throw new Error("La sincronización supera el límite del lote.");

  const batch = writeBatch(services.db);
  for (const entry of entries) {
    batch.set(favoriteDoc(services.db, uid, entry), favoriteFirestoreData(entry));
  }
  await batch.commit();
  await waitForPendingWrites(services.db);
}
