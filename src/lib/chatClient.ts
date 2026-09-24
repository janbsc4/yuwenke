import { getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { chatResponseSchema, type ChatRequest } from "../../shared/chat";

const GUEST_KEY = "yuwenke:lei-guest:v1";
const GUEST_LIMIT = 3;
let memoryGuest: { id: string; used: number } = { id: crypto.randomUUID(), used: 0 };

function guestIdentity() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(GUEST_KEY) ?? "null") as unknown;
    if (saved && typeof saved === "object" && "id" in saved && "used" in saved &&
      typeof saved.id === "string" && /^[0-9a-f-]{36}$/i.test(saved.id) &&
      typeof saved.used === "number" && Number.isInteger(saved.used) &&
      saved.used >= 0 && saved.used <= GUEST_LIMIT) {
      memoryGuest = { id: saved.id, used: saved.used };
      return memoryGuest;
    }
    memoryGuest = { id: crypto.randomUUID(), used: 0 };
    window.localStorage.setItem(GUEST_KEY, JSON.stringify(memoryGuest));
  } catch {
    // Guest practice still works when browser storage is unavailable.
  }
  return memoryGuest;
}

function saveGuestUsed(used: number) {
  memoryGuest = { ...guestIdentity(), used };
  try {
    window.localStorage.setItem(GUEST_KEY, JSON.stringify(memoryGuest));
  } catch {
    // The Worker still enforces the guest allowance.
  }
}

export function guestMessagesRemaining() {
  return GUEST_LIMIT - guestIdentity().used;
}

export async function sendConversation(request: ChatRequest) {
  const user = getAuth(getApp()).currentUser;
  const guest = !user || user.isAnonymous;
  const identity = guest ? guestIdentity() : null;
  if (identity?.used === GUEST_LIMIT)
    throw Object.assign(new Error("Guest allowance reached."), {
      code: "chat/guest-exhausted",
    });
  const endpoint = import.meta.env.PUBLIC_CHAT_API_URL;
  if (!endpoint) throw new Error("Conversation is not configured.");
  const token = guest ? null : await user.getIdToken();
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } :
        { "X-Lei-Guest-Id": identity?.id ?? "" }),
    },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(70000),
  });
  if (!response.ok) {
    const failure: unknown = await response.json().catch(() => null);
    const details = failure && typeof failure === "object" ? failure : null;
    const inner = details && "error" in details ? details.error : null;
    const errorCode = inner && typeof inner === "object" &&
      "code" in inner && typeof inner.code === "string" ? inner.code : null;
    const remaining = details && "remaining" in details &&
      typeof details.remaining === "number" &&
      Number.isSafeInteger(details.remaining) && details.remaining >= 0
      ? details.remaining : null;
    if (guest && remaining !== null && remaining <= GUEST_LIMIT)
      saveGuestUsed(GUEST_LIMIT - remaining);
    if (guest && errorCode === "guest-exhausted") saveGuestUsed(GUEST_LIMIT);
    const code = response.status === 401
      ? "chat/unauthenticated"
      : response.status === 429
        ? errorCode === "guest-exhausted"
          ? "chat/guest-exhausted"
          : "chat/resource-exhausted"
        : response.status === 504
          ? "chat/deadline-exceeded"
          : "chat/unavailable";
    throw Object.assign(new Error("Conversation is unavailable."), {
      code,
      ...(remaining === null ? {} : { remaining }),
    });
  }
  const result = chatResponseSchema.parse(await response.json());
  if (guest) saveGuestUsed(GUEST_LIMIT - result.remaining);
  return result;
}
