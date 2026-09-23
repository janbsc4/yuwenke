import { sendConversation } from "../src/lib/chatClient";
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
  model: "glm-5.3-flash",
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
it("does not contact inference for guests or anonymous users", async () => {
  for (const user of [null, { isAnonymous: true, getIdToken: vi.fn() }]) {
    auth.currentUser = user;
    await expect(sendConversation(payload)).rejects.toMatchObject({
      code: "chat/unauthenticated",
    });
  }
  expect(fetch).not.toHaveBeenCalled();
});
it.each([
  [401, "unauthenticated"],
  [429, "resource-exhausted"],
  [503, "unavailable"],
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
