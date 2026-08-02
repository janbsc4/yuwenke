export interface StorageResult<T> {
  value: T;
  available: boolean;
}

interface LocalStateStoreOptions<T> {
  guestKey: string;
  userPrefix: string;
  outboxPrefix: string;
  emptyValue: () => T;
  parse: (value: unknown) => T | undefined;
  serialize?: (value: T) => unknown;
}

export interface LocalStateStore<T> {
  readGuest: () => StorageResult<T>;
  writeGuest: (value: T) => boolean;
  clearGuest: () => boolean;
  readUser: (uid: string) => StorageResult<T>;
  writeUser: (uid: string, value: T) => boolean;
  clearUser: (uid: string) => boolean;
  readOutbox: (uid: string) => StorageResult<T>;
  writeOutbox: (uid: string, value: T) => boolean;
  clearOutbox: (uid: string) => boolean;
}

function availableStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    const marker = "__yuwenke_storage_test__";
    window.localStorage.setItem(marker, marker);
    window.localStorage.removeItem(marker);
    return window.localStorage;
  } catch {
    return null;
  }
}

export function createLocalStateStore<T>({
  guestKey,
  userPrefix,
  outboxPrefix,
  emptyValue,
  parse,
  serialize = (value) => value,
}: LocalStateStoreOptions<T>): LocalStateStore<T> {
  const read = (key: string): StorageResult<T> => {
    const storage = availableStorage();
    if (!storage) return { value: emptyValue(), available: false };
    try {
      const raw = storage.getItem(key);
      if (!raw) return { value: emptyValue(), available: true };
      return {
        value: parse(JSON.parse(raw)) ?? emptyValue(),
        available: true,
      };
    } catch {
      return { value: emptyValue(), available: true };
    }
  };

  const write = (key: string, value: T): boolean => {
    const storage = availableStorage();
    if (!storage) return false;
    try {
      storage.setItem(key, JSON.stringify(serialize(value)));
      return true;
    } catch {
      return false;
    }
  };

  const remove = (key: string): boolean => {
    const storage = availableStorage();
    if (!storage) return false;
    try {
      storage.removeItem(key);
      return true;
    } catch {
      return false;
    }
  };

  return {
    readGuest: () => read(guestKey),
    writeGuest: (value) => write(guestKey, value),
    clearGuest: () => remove(guestKey),
    readUser: (uid) => read(`${userPrefix}${uid}`),
    writeUser: (uid, value) => write(`${userPrefix}${uid}`, value),
    clearUser: (uid) => remove(`${userPrefix}${uid}`),
    readOutbox: (uid) => read(`${outboxPrefix}${uid}`),
    writeOutbox: (uid, value) => write(`${outboxPrefix}${uid}`, value),
    clearOutbox: (uid) => remove(`${outboxPrefix}${uid}`),
  };
}
