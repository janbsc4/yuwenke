import { readFileSync } from "node:fs";
import { DEFAULT_CHAT_MODEL, chatModelLabel, chatResponseSchema, tutorReplySchema, type ChatRequest, type TutorReply } from "../shared/chat";
import { conversationMessages, readConversation, saveConversation } from "../src/lib/conversation";
import { generateTutorReply, tutorMessages } from "../worker/src/tutor";

const practiceReply = {
  chinese: "你喜欢喝茶吗？", pinyin: "Nǐ xǐhuān hē chá ma?",
  meaning: "Do you like drinking tea?", feedback: "", naturalness: null,
  hint: "我喜欢喝茶。\nWǒ xǐhuān hē chá.\nI like drinking tea.", practicedCardIds: [],
};
const explanation: TutorReply = {
  kind: "explanation", explanation: "了 marks a change of state here.",
  naturalness: null, practicedCardIds: [],
};
const request: ChatRequest = {
  sessionId: "8bc15f3a-879b-4cce-80ec-ec29c07ca8c7", locale: "en", topic: "", supportsExplanations: true,
  progress: [], messages: [{ role: "user", content: "很hěn高gāo兴xìng认rèn识shi你: Is this in the cards I'm studying?" }],
};

it("accepts direct explanations alongside both legacy and explicit practice replies", () => {
  const legacy = { ...practiceReply, naturalness: undefined };
  for (const reply of [legacy, practiceReply, { ...practiceReply, kind: "conversation" }, explanation]) {
    expect(chatResponseSchema.safeParse({ model: "glm-5.3-flash", reply, targetCardIds: [], remaining: 29 }).success).toBe(true);
  }
});

it.each([
  { ...explanation, explanation: "" },
  { ...explanation, naturalness: { level: "natural", explanation: "Good!", betterChinese: "" } },
  { ...explanation, practicedCardIds: ["FC001"] },
])("rejects empty, graded, or practice-counting explanation replies (%j)", (reply) => {
  expect(tutorReplySchema.safeParse(reply).success).toBe(false);
});

it.each(["en", "es"] as const)("returns a meta answer in the same inference call with %s instructions", async (locale) => {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json({
    choices: [{ message: { content: JSON.stringify(explanation) }, finish_reason: "stop" }],
  }));
  const localizedRequest = { ...request, locale };
  const result = await generateTutorReply(localizedRequest, [], {
    apiKey: "test-secret", model: "glm-5.3-flash", fetch: fetchMock,
  });
  expect(result.reply).toEqual(explanation);
  expect(fetchMock).toHaveBeenCalledOnce();
  const prompt = tutorMessages(localizedRequest, []).messages[0].content;
  expect(prompt).toContain(`answer the question directly and entirely in ${locale === "es" ? "Spanish" : "English"}`);
  expect(prompt).toContain("intent of the learner's latest message, not just the language");
  expect(prompt).toContain("quoted phrase is the subject of the question, not a Mandarin attempt to grade");
  expect(prompt).toContain("absence from this subset does not establish absence from their cards");
  expect(prompt).toContain("explanation is a per-message choice, not a permanent mode");
});

it("still requires an assessment or null on newly generated practice replies", async () => {
  const legacy = { ...practiceReply, naturalness: undefined };
  await expect(generateTutorReply(request, [], {
    apiKey: "test-secret", model: "glm-5.3-flash",
    fetch: vi.fn().mockResolvedValue(Response.json({ choices: [{ message: { content: JSON.stringify(legacy) } }] })),
  })).rejects.toMatchObject({ code: "unavailable" });
});

it("keeps cached clients on the conversation format they understand", async () => {
  const legacyRequest = { ...request, supportsExplanations: undefined };
  expect(tutorMessages(legacyRequest, []).messages[0].content).not.toContain('kind: "explanation"');
  await expect(generateTutorReply(legacyRequest, [], {
    apiKey: "test-secret", model: "glm-5.3-flash",
    fetch: vi.fn().mockResolvedValue(Response.json({ choices: [{ message: { content: JSON.stringify(explanation) } }] })),
  })).rejects.toMatchObject({ code: "unavailable" });
});

it("restores explanations and includes them when the learner resumes Chinese practice", () => {
  const session = {
    version: 1 as const, sessionId: request.sessionId, topic: "", targetCardIds: [],
    turns: [{ user: "你好", reply: practiceReply }, { user: "Why 了?", reply: explanation }],
  };
  expect(saveConversation("alice", "en", session)).toBe(true);
  const restored = readConversation("alice", "en");
  expect(restored.turns).toEqual(session.turns);
  expect(conversationMessages(restored.turns, "我喜欢喝茶。")).toEqual([
    { role: "user", content: "你好" }, { role: "assistant", content: practiceReply.chinese },
    { role: "user", content: "Why 了?" }, { role: "assistant", content: explanation.explanation },
    { role: "user", content: "我喜欢喝茶。" },
  ]);
});

it("keeps the Worker and initial model label on GLM-5.3-Flash while retaining saved model labels", () => {
  const configuration = readFileSync("worker/wrangler.jsonc", "utf8");
  const configuredModel = configuration.match(/"CHAT_MODEL":\s*"([^"]+)"/)?.[1];
  expect(configuredModel).toBe(DEFAULT_CHAT_MODEL);
  expect(chatModelLabel(DEFAULT_CHAT_MODEL)).toBe("GLM-5.3-Flash");
  expect(chatModelLabel("mimo-v2.6-flash")).toBe("MiMo-V2.6-Flash");
});
