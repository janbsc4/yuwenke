import { z } from "zod";
import {
  CHAT_MAX_HISTORY,
  CHAT_MAX_HISTORY_CHARS,
  tutorReplySchema,
  type ChatProgress,
  type ChatRequest,
  type TutorReply,
} from "../../shared/chat";
import type { Flashcard, Locale, ProgressMap } from "../types";
import { canonicalProgressForCards } from "./study";

export interface ConversationTurn {
  user: string;
  reply: TutorReply;
}

const sessionSchema = z.object({
  version: z.literal(1),
  sessionId: z.uuid().default(() => crypto.randomUUID()),
  model: z.string().trim().min(1).max(120).optional(),
  topic: z.string().max(80),
  turns: z
    .array(z.object({ user: z.string().max(1500), reply: tutorReplySchema }))
    .max(12),
  targetCardIds: z.array(z.string()).max(5),
});
export type ConversationSession = z.infer<typeof sessionSchema>;

export function conversationProgress(
  cards: Flashcard[],
  progress: ProgressMap,
): ChatProgress[] {
  return Object.values(canonicalProgressForCards(cards, progress)).map(
    (entry) => ({
      cardId: entry.cardId,
      direction: entry.direction as ChatProgress["direction"],
      status: entry.status,
    }),
  );
}

export function conversationMessages(
  turns: ConversationTurn[],
  message: string,
): ChatRequest["messages"] {
  const messages: ChatRequest["messages"] = turns.flatMap((turn) => [
    { role: "user" as const, content: turn.user },
    { role: "assistant" as const, content: turn.reply.chinese },
  ]);
  messages.push({ role: "user", content: message });
  while (
    messages.length > CHAT_MAX_HISTORY ||
    messages.reduce((sum, item) => sum + item.content.length, 0) >
      CHAT_MAX_HISTORY_CHARS
  ) {
    if (messages.length < 3) break;
    messages.splice(0, 2);
  }
  return messages;
}

function storageKey(owner: string, locale: Locale) {
  return `yuwenke:conversation:v1:${owner}:${locale}`;
}

export function readConversation(
  owner: string,
  locale: Locale,
): ConversationSession {
  try {
    const parsed = sessionSchema.safeParse(
      JSON.parse(
        window.localStorage.getItem(storageKey(owner, locale)) ?? "null",
      ),
    );
    if (parsed.success) return parsed.data;
  } catch {
    /* Local chat history is optional. */
  }
  return { version: 1, sessionId: crypto.randomUUID(), topic: "", turns: [], targetCardIds: [] };
}

export function saveConversation(
  owner: string,
  locale: Locale,
  session: ConversationSession,
): boolean {
  try {
    if (!session.turns.length)
      window.localStorage.removeItem(storageKey(owner, locale));
    else
      window.localStorage.setItem(
        storageKey(owner, locale),
        JSON.stringify(session),
      );
    return true;
  } catch {
    return false;
  }
}
