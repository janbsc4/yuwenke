import { getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { chatResponseSchema, type ChatRequest } from "../../shared/chat";

export async function sendConversation(request: ChatRequest) {
  const user = getAuth(getApp()).currentUser;
  if (!user || user.isAnonymous)
    throw Object.assign(new Error("Sign in to practice."), {
      code: "chat/unauthenticated",
    });
  const endpoint = import.meta.env.PUBLIC_CHAT_API_URL;
  if (!endpoint) throw new Error("Conversation is not configured.");
  const token = await user.getIdToken();
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(70000),
  });
  if (!response.ok)
    throw Object.assign(new Error("Conversation is unavailable."), {
      code:
        response.status === 401
          ? "chat/unauthenticated"
          : response.status === 429
            ? "chat/resource-exhausted"
            : response.status === 504
              ? "chat/deadline-exceeded"
              : "chat/unavailable",
    });
  return chatResponseSchema.parse(await response.json());
}
