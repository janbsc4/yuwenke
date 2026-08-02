import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";

let environment: RulesTestEnvironment;

const validData = (overrides: Record<string, unknown> = {}) => ({
  cardId: "FC001",
  direction: "hanzi-es",
  status: "learning",
  clientUpdatedAt: Timestamp.fromMillis(1000),
  serverUpdatedAt: serverTimestamp(),
  schemaVersion: 1,
  ...overrides,
});

const validFavoriteData = (overrides: Record<string, unknown> = {}) => ({
  cardId: "FC001",
  favorite: true,
  clientUpdatedAt: Timestamp.fromMillis(1000),
  serverUpdatedAt: serverTimestamp(),
  schemaVersion: 1,
  ...overrides,
});

const validPackState = (overrides: Record<string, unknown> = {}) => ({
  openPackIds: ["CP001"],
  clientUpdatedAt: Timestamp.fromMillis(1000),
  serverUpdatedAt: serverTimestamp(),
  resetAt: Timestamp.fromMillis(0),
  schemaVersion: 1,
  ...overrides,
});

const validResetAwareProgress = (overrides: Record<string, unknown> = {}) => ({
  ...validData(),
  resetAt: Timestamp.fromMillis(0),
  schemaVersion: 2,
  ...overrides,
});

beforeAll(async () => {
  environment = await initializeTestEnvironment({
    projectId: "demo-yuwenke",
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
});

beforeEach(async () => {
  await environment.clearFirestore();
});

afterAll(async () => {
  await environment.cleanup();
});

describe("Firestore progress rules", () => {
  it("denies unauthenticated reads and writes", async () => {
    const db = environment.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, "users/alice/progress/FC001_hanzi-es")));
    await assertFails(setDoc(doc(db, "users/alice/progress/FC001_hanzi-es"), validData()));
    await assertFails(getDoc(doc(db, "users/alice/favorites/FC001")));
    await assertFails(
      setDoc(doc(db, "users/alice/favorites/FC001"), validFavoriteData()),
    );
  });

  it("allows a user to create and list their own progress", async () => {
    const db = environment.authenticatedContext("alice").firestore();
    await assertSucceeds(setDoc(doc(db, "users/alice/progress/FC001_hanzi-es"), validData()));
    await assertSucceeds(getDocs(collection(db, "users/alice/progress")));
  });

  it("prevents access to another user's progress", async () => {
    const db = environment.authenticatedContext("bob").firestore();
    await assertFails(getDoc(doc(db, "users/alice/progress/FC001_hanzi-es")));
    await assertFails(setDoc(doc(db, "users/alice/progress/FC001_hanzi-es"), validData()));
    await assertFails(getDoc(doc(db, "users/alice/favorites/FC001")));
    await assertFails(
      setDoc(doc(db, "users/alice/favorites/FC001"), validFavoriteData()),
    );
  });

  it("requires the document id to match card and direction", async () => {
    const db = environment.authenticatedContext("alice").firestore();
    await assertFails(setDoc(doc(db, "users/alice/progress/wrong"), validData()));
  });

  it("rejects missing, extra, malformed and client-authored server fields", async () => {
    const db = environment.authenticatedContext("alice").firestore();
    const ref = doc(db, "users/alice/progress/FC001_hanzi-es");
    const missing = validData();
    delete (missing as Record<string, unknown>).status;
    await assertFails(setDoc(ref, missing));
    await assertFails(setDoc(ref, validData({ extra: true })));
    await assertFails(setDoc(ref, validData({ direction: "sideways" })));
    await assertFails(setDoc(ref, validData({ cardId: "card-1" })));
    await assertFails(setDoc(ref, validData({ schemaVersion: "1" })));
    await assertFails(setDoc(ref, validData({ serverUpdatedAt: Timestamp.fromMillis(1000) })));
  });

  it("rejects stale updates and permits monotonic updates", async () => {
    const db = environment.authenticatedContext("alice").firestore();
    const ref = doc(db, "users/alice/progress/FC001_hanzi-es");
    await assertSucceeds(setDoc(ref, validData()));
    await assertFails(
      updateDoc(ref, validData({ clientUpdatedAt: Timestamp.fromMillis(999), status: "known" })),
    );
    await assertSucceeds(
      updateDoc(ref, validData({ clientUpdatedAt: Timestamp.fromMillis(1001), status: "known" })),
    );
  });

  it("rejects an entire batch when one progress entry is invalid", async () => {
    const db = environment.authenticatedContext("alice").firestore();
    const batch = writeBatch(db);
    batch.set(doc(db, "users/alice/progress/FC001_hanzi-es"), validData());
    batch.set(
      doc(db, "users/alice/progress/FC002_es-hanzi"),
      validData({ cardId: "FC002", direction: "invalid" }),
    );
    await assertFails(batch.commit());
  });

  it("allows owner-only favorite records and false tombstones", async () => {
    const db = environment.authenticatedContext("alice").firestore();
    const ref = doc(db, "users/alice/favorites/FC001");

    await assertSucceeds(setDoc(ref, validFavoriteData()));
    await assertSucceeds(getDocs(collection(db, "users/alice/favorites")));
    await assertSucceeds(
      updateDoc(
        ref,
        validFavoriteData({
          favorite: false,
          clientUpdatedAt: Timestamp.fromMillis(1001),
        }),
      ),
    );
  });

  it("validates favorite ids, fields, timestamps, and monotonic updates", async () => {
    const db = environment.authenticatedContext("alice").firestore();
    const ref = doc(db, "users/alice/favorites/FC001");
    await assertSucceeds(setDoc(ref, validFavoriteData()));

    await assertFails(
      setDoc(doc(db, "users/alice/favorites/wrong"), validFavoriteData()),
    );
    await assertFails(setDoc(ref, validFavoriteData({ favorite: "yes" })));
    await assertFails(setDoc(ref, validFavoriteData({ extra: true })));
    await assertFails(
      setDoc(
        ref,
        validFavoriteData({ serverUpdatedAt: Timestamp.fromMillis(1000) }),
      ),
    );
    await assertFails(
      updateDoc(
        ref,
        validFavoriteData({ clientUpdatedAt: Timestamp.fromMillis(999) }),
      ),
    );
  });

  it("merges open packs monotonically within the same reset boundary", async () => {
    const db = environment.authenticatedContext("alice").firestore();
    const ref = doc(db, "users/alice/state/cardPacks");
    await assertSucceeds(setDoc(ref, validPackState()));
    await assertSucceeds(
      setDoc(
        ref,
        validPackState({
          openPackIds: ["CP001", "CP003"],
          clientUpdatedAt: Timestamp.fromMillis(1001),
        }),
      ),
    );
    await assertFails(
      setDoc(
        ref,
        validPackState({
          openPackIds: ["CP001"],
          clientUpdatedAt: Timestamp.fromMillis(1002),
        }),
      ),
    );
  });

  it("requires reset-aware study writes to match the current reset boundary", async () => {
    const db = environment.authenticatedContext("alice").firestore();
    const stateRef = doc(db, "users/alice/state/cardPacks");
    const progressRef = doc(db, "users/alice/progress/FC001_hanzi-es");
    await assertSucceeds(setDoc(stateRef, validPackState()));
    await assertSucceeds(setDoc(progressRef, validResetAwareProgress()));
    await assertFails(
      setDoc(
        doc(db, "users/alice/progress/FC002_hanzi-es"),
        validResetAwareProgress({
          cardId: "FC002",
          resetAt: Timestamp.fromMillis(999),
        }),
      ),
    );
    await assertFails(
      setDoc(
        doc(db, "users/alice/progress/FC003_hanzi-es"),
        validData({ cardId: "FC003" }),
      ),
    );
  });

  it("allows an authoritative reset boundary and rejects a stale device afterward", async () => {
    const db = environment.authenticatedContext("alice").firestore();
    const stateRef = doc(db, "users/alice/state/cardPacks");
    await assertSucceeds(setDoc(stateRef, validPackState()));
    await assertSucceeds(
      setDoc(
        stateRef,
        validPackState({
          openPackIds: ["CP001"],
          clientUpdatedAt: serverTimestamp(),
          resetAt: serverTimestamp(),
        }),
      ),
    );
    await assertFails(
      setDoc(
        doc(db, "users/alice/progress/FC001_hanzi-es"),
        validResetAwareProgress(),
      ),
    );
  });
});
