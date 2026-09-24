import { z } from "zod";

export const CHAT_MAX_MESSAGE = 1500;
export const CHAT_MAX_HISTORY = 24;
export const CHAT_MAX_HISTORY_CHARS = 12000;
export const DEFAULT_CHAT_MODEL = "mimo-v2.6-flash";

export function chatModelLabel(model: string): string {
  return model === DEFAULT_CHAT_MODEL ? "MiMo-V2.6-Flash" : model;
}

const cardId = z.string().regex(/^FC\d{3}$/);
export const chatProgressSchema = z
  .object({
    cardId,
    direction: z.enum(["hanzi-meaning", "meaning-hanzi", "concept"]),
    status: z.enum(["learning", "known"]),
  })
  .strict();

export const chatRequestSchema = z
  .object({
    sessionId: z.uuid(),
    locale: z.enum(["en", "es"]),
    topic: z.string().trim().max(80),
    progress: z.array(chatProgressSchema).max(2000),
    messages: z
      .array(
        z
          .object({
            role: z.enum(["user", "assistant"]),
            content: z.string().trim().min(1).max(3000),
          })
          .strict(),
      )
      .min(1)
      .max(CHAT_MAX_HISTORY),
  })
  .strict()
  .superRefine((request, context) => {
    const last = request.messages.at(-1);
    if (last?.role !== "user" || last.content.length > CHAT_MAX_MESSAGE) {
      context.addIssue({
        code: "custom",
        message: "Expected a learner message of at most 1500 characters.",
      });
    }
    if (
      request.messages.reduce(
        (sum, message) => sum + message.content.length,
        0,
      ) > CHAT_MAX_HISTORY_CHARS
    ) {
      context.addIssue({
        code: "custom",
        message: "Conversation exceeds the context limit.",
      });
    }
  });

export const naturalnessSchema = z.object({
  level: z.enum(["natural", "mostly_natural", "needs_work"]),
  explanation: z.string().trim().min(1).max(1000),
  betterChinese: z.string().trim().max(1500),
}).refine(
  (assessment) => assessment.level === "natural" || assessment.betterChinese.length > 0,
  { message: "An answer needing improvement must include a better Chinese sentence." },
);

export const tutorReplySchema = z.object({
  chinese: z.string().trim().min(1).max(1500),
  pinyin: z.string().trim().min(1).max(2000),
  meaning: z.string().trim().min(1).max(2000),
  feedback: z.string().trim().max(2000),
  // Older saved conversations and replies from the previous backend have no assessment.
  naturalness: naturalnessSchema.nullable().optional(),
  hint: z.string().trim().min(1).max(1000),
  practicedCardIds: z.array(cardId).max(12),
});

export const chatResponseSchema = z.object({
  model: z.string().trim().min(1).max(120),
  reply: tutorReplySchema,
  targetCardIds: z.array(cardId).max(5),
  remaining: z.number().int().nonnegative(),
});

export type ChatProgress = z.infer<typeof chatProgressSchema>;
export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type TutorReply = z.infer<typeof tutorReplySchema>;
export type ChatResponse = z.infer<typeof chatResponseSchema>;

export interface ChatCard {
  id: string;
  tipo: "palabra" | "frase" | "concepto";
  tema: string;
  hanzi: string;
  pinyin: string;
  espanol: string;
  ingles: string;
  explicacion: string;
  explicacion_ingles: string;
  ejemplo_hanzi: string;
}
