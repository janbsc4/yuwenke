import { guestMessagesRemaining, sendConversation } from "../src/lib/chatClient";
const auth = vi.hoisted(() => ({
  currentUser: null as null | {
    isAnonymous: boolean;
    getIdToken: ReturnType<typeof vi.fn>;
  },
}));
vi.mock("firebase/app", () => ({ getApp: vi.fn() }));
vi.mock("firebase/auth", () => ({ getAuth: () => auth }));
const payload = {
  sessionId: "8bc15f3a-879b-4cce-80ec-ec29c07ca8c7",
  locale: "en" as const,
  topic: "",
  progress: [],
  messages: [{ role: "user" as const, content: "Hello" }],
};
const result = {
  model: "mimo-v2.6-flash",
  remaining: 29,
  targetCardIds: [],
  reply: {
    chinese: "你好",
    pinyin: "Nǐ hǎo",
    meaning: "Hello",
    feedback: "",
    hint: "你好",
    practicedCardIds: [],
  },
};
beforeEach(() => {
  window.localStorage.removeItem("yuwenke:lei-guest:v1");
  vi.stubEnv("PUBLIC_CHAT_API_URL", "https://lei.example/conversation");
  auth.currentUser = {
    isAnonymous: false,
    getIdToken: vi.fn().mockResolvedValue("firebase-id-token"),
  };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(result)));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it("sends a Firebase ID token to the configured Worker and validates the reply", async () => {
  expect(await sendConversation(payload)).toEqual(result);
  expect(fetch).toHaveBeenCalledWith(
    "https://lei.example/conversation",
    expect.objectContaining({
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer firebase-id-token",
      },
      body: JSON.stringify(payload),
    }),
  );
});
it("sends three guest messages using a stable browser identity", async () => {
  auth.currentUser = null;
  vi.mocked(fetch)
    .mockResolvedValueOnce(Response.json({ ...result, remaining: 2 }))
    .mockResolvedValueOnce(Response.json({ ...result, remaining: 1 }))
    .mockResolvedValueOnce(Response.json({ ...result, remaining: 0 }));
  for (const remaining of [2, 1, 0]) {
    const message = remaining === 1 ? { ...payload, locale: "es" as const } : payload;
    expect((await sendConversation(message)).remaining).toBe(remaining);
    expect(guestMessagesRemaining()).toBe(remaining);
  }
  const calls = vi.mocked(fetch).mock.calls;
  const headers = calls.map((call) => call[1]?.headers as Record<string, string>);
  expect(new Set(headers.map((header) => header["X-Lei-Guest-Id"])).size).toBe(1);
  expect(headers[0]).not.toHaveProperty("Authorization");
  await expect(sendConversation(payload)).rejects.toMatchObject({
    code: "chat/guest-exhausted",
  });
  expect(fetch).toHaveBeenCalledTimes(3);
});
it("keeps a guest trial available when only the shared allowance is exhausted", async () => {
  auth.currentUser = null;
  vi.mocked(fetch).mockResolvedValueOnce(Response.json(
    { error: { code: "resource-exhausted" } }, { status: 429 },
  ));
  await expect(sendConversation(payload)).rejects.toMatchObject({
    code: "chat/resource-exhausted",
  });
  expect(guestMessagesRemaining()).toBe(3);
  vi.mocked(fetch).mockResolvedValueOnce(Response.json(
    { error: { code: "guest-exhausted" } }, { status: 429 },
  ));
  await expect(sendConversation(payload)).rejects.toMatchObject({
    code: "chat/guest-exhausted",
  });
  expect(guestMessagesRemaining()).toBe(0);
});
it("updates guest attempts after a provider failure", async () => {
  auth.currentUser = null;
  vi.mocked(fetch).mockResolvedValueOnce(Response.json(
    { error: { code: "unavailable" }, remaining: 2 }, { status: 503 },
  ));
  await expect(sendConversation(payload)).rejects.toMatchObject({
    code: "chat/unavailable", remaining: 2,
  });
  expect(guestMessagesRemaining()).toBe(2);
});
it.each([
  [401, "unauthenticated"],
  [429, "resource-exhausted"],
  [503, "unavailable"],
  [504, "deadline-exceeded"],
])(
  "maps HTTP %i without exposing backend error content",
  async (status, code) => {
    vi.mocked(fetch).mockResolvedValue(
      new Response("private error", { status }),
    );
    await expect(sendConversation(payload)).rejects.toMatchObject({
      code: `chat/${code}`,
      message: "Conversation is unavailable.",
    });
  },
);
it("rejects malformed successful responses", async () => {
  vi.mocked(fetch).mockResolvedValue(Response.json({ reply: "broken" }));
  await expect(sendConversation(payload)).rejects.toThrow();
});
