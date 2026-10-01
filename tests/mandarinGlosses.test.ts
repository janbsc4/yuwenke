import { annotateMandarinReferences } from "../worker/src/mandarinGlosses";
import { generateTutorReply } from "../worker/src/tutor";
import type { ChatRequest } from "../shared/chat";

const glosses = [
  { hanzi: "喜欢", pinyin: "xǐhuan", meaning: "to like" },
  { hanzi: "喝", pinyin: "hē", meaning: "to drink" },
  { hanzi: "我喜欢喝茶", pinyin: "wǒ xǐhuan hē chá", meaning: "I like drinking tea" },
];

it("adds pinyin and meaning to every repeated Hanzi reference, preserving quotes", () => {
  expect(annotateMandarinReferences('Put 喜欢 before “喝”. 喜欢 is the main verb.', glosses))
    .toBe('Put 喜欢 (xǐhuan — to like) before “喝” (hē — to drink). 喜欢 (xǐhuan — to like) is the main verb.');
});

it("glosses complete phrases rather than injecting annotations into their component words", () => {
  expect(annotateMandarinReferences("Say 我喜欢喝茶.", glosses))
    .toBe("Say 我喜欢喝茶 (wǒ xǐhuan hē chá — I like drinking tea).");
});

it.each(["喝 (hē)", "喝 (Hē — drink)", '“喝” (hē — drink)', "喝 (to drink)"])("replaces an existing reading or gloss without duplicating it: %s", (text) => {
  expect(annotateMandarinReferences(text, glosses))
    .toBe(text.startsWith("“") ? '“喝” (hē — to drink)' : "喝 (hē — to drink)");
});

it("annotates references inside explanatory parentheses and tolerates glossary quotation marks", () => {
  expect(annotateMandarinReferences("喜欢 (rather than 喝).", glosses))
    .toBe("喜欢 (xǐhuan — to like) (rather than 喝 (hē — to drink)).");
  expect(annotateMandarinReferences("喝!", [{ hanzi: '“喝。”', pinyin: "hē", meaning: "to drink" }]))
    .toBe("喝 (hē — to drink)!");
});

it("preserves explanatory parentheses and text absent from the glossary", () => {
  expect(annotateMandarinReferences("喝 (the verb in this sentence). 你好!", glosses))
    .toBe("喝 (hē — to drink) (the verb in this sentence). 你好!");
  expect(annotateMandarinReferences("English only.", glosses)).toBe("English only.");
  expect(annotateMandarinReferences("你好!", [])).toBe("你好!");
});

const request: ChatRequest = {
  sessionId: "8bc15f3a-879b-4cce-80ec-ec29c07ca8c7", locale: "en", topic: "", supportsExplanations: true,
  progress: [], messages: [{ role: "user", content: "我喝喜欢茶。" }],
};

it("formats naturalness and correction feedback with the same inference call, leaving practice Chinese intact", async () => {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ choices: [{ message: { content: JSON.stringify({
    kind: "conversation", chinese: "你喜欢喝茶吗？", pinyin: "Nǐ xǐhuan hē chá ma?",
    meaning: "Do you like drinking tea?", feedback: "Put 喜欢 before 喝.",
    naturalness: { level: "needs_work", explanation: "喜欢 goes before 喝. 喜欢 expresses liking.", betterChinese: "我喜欢喝茶。" },
    hint: "我喜欢喝茶。", practicedCardIds: [], mandarinGlosses: glosses,
  }) } }] }));
  const result = await generateTutorReply(request, [], { apiKey: "test-secret", model: "glm-5.3-flash", fetch: fetchMock });
  expect(result.reply.kind).toBe("conversation");
  if (result.reply.kind === "explanation") throw new Error("Expected a practice reply");
  expect(result.reply.feedback).toBe("Put 喜欢 (xǐhuan — to like) before 喝 (hē — to drink).");
  expect(result.reply.naturalness?.explanation).toBe("喜欢 (xǐhuan — to like) goes before 喝 (hē — to drink). 喜欢 (xǐhuan — to like) expresses liking.");
  expect(result.reply.chinese).toBe("你喜欢喝茶吗？");
  expect(result.reply.naturalness?.betterChinese).toBe("我喜欢喝茶。");
  expect(result.reply).not.toHaveProperty("mandarinGlosses");
  expect(fetchMock).toHaveBeenCalledOnce();
});

it("formats direct explanations using localized glossary meanings", async () => {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ choices: [{ message: { content: JSON.stringify({
    kind: "explanation", explanation: "喝 significa beber. Puedes usar 喝 en esta frase.", naturalness: null, practicedCardIds: [],
    mandarinGlosses: [{ hanzi: "喝", pinyin: "hē", meaning: "beber" }],
  }) } }] }));
  const result = await generateTutorReply({ ...request, locale: "es" }, [], { apiKey: "test-secret", model: "glm-5.3-flash", fetch: fetchMock });
  expect(result.reply).toEqual({
    kind: "explanation", explanation: "喝 (hē — beber) significa beber. Puedes usar 喝 (hē — beber) en esta frase.", naturalness: null, practicedCardIds: [],
  });
  expect(fetchMock).toHaveBeenCalledOnce();
});

it("rejects expanded explanations that no longer fit the browser contract", async () => {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ choices: [{ message: { content: JSON.stringify({
    kind: "explanation", explanation: "喝 ".repeat(300), naturalness: null, practicedCardIds: [], mandarinGlosses: glosses,
  }) } }] }));
  await expect(generateTutorReply(request, [], { apiKey: "test-secret", model: "glm-5.3-flash", fetch: fetchMock }))
    .rejects.toMatchObject({ code: "unavailable" });
});
