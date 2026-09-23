import worker, { type Env } from "../worker/src/index";
import { verifyFirebaseToken } from "../worker/src/auth";
import { generateTutorReply } from "../worker/src/tutor";

vi.mock("../worker/src/auth", () => ({ verifyFirebaseToken: vi.fn() }));
vi.mock("../worker/src/tutor", async (original) => ({
  ...(await original<typeof import("../worker/src/tutor")>()),
  generateTutorReply: vi.fn(),
}));
const reserve = vi.fn();
const env = {
  FIREBASE_PROJECT_ID: "yuwenke-a1df9",
  ALLOWED_ORIGIN: "https://janbsc4.github.io",
  OPENCODE_GO_API_KEY: "private-test-key",
  CHAT_ENABLED: "true",
  CHAT_MODEL: "glm-5.3-flash",
  CHAT_USER_DAILY_LIMIT: "30",
  CHAT_GLOBAL_DAILY_LIMIT: "300",
  CHAT_GLOBAL_MONTHLY_LIMIT: "3000",
  CHAT_QUOTA: { idFromName: vi.fn(), get: () => ({ fetch: reserve }) },
} as unknown as Env;
const data = {
  sessionId: "8bc15f3a-879b-4cce-80ec-ec29c07ca8c7",
  locale: "en",
  topic: "",
  progress: [],
  messages: [{ role: "user", content: "Hello" }],
};
const reply = {
  model: "glm-5.3-flash",
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
function request(body: unknown = data, headers: Record<string, string> = {}) {
  return new Request("https://lei.example/conversation", {
    method: "POST",
    headers: {
      Origin: env.ALLOWED_ORIGIN,
      Authorization: "Bearer signed-token",
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(verifyFirebaseToken).mockResolvedValue("alice");
  reserve.mockResolvedValue(Response.json({ remaining: 29 }));
  vi.mocked(generateTutorReply).mockResolvedValue(reply);
});
it("authenticates before reserving allowance or calling inference", async () => {
  expect(
    (await worker.fetch(request(data, { Authorization: "" }), env)).status,
  ).toBe(401);
  vi.mocked(verifyFirebaseToken).mockRejectedValue(new Error("bad signature"));
  expect((await worker.fetch(request(), env)).status).toBe(401);
  expect(reserve).not.toHaveBeenCalled();
  expect(generateTutorReply).not.toHaveBeenCalled();
});
it("reserves for the verified UID before inference and returns the selected model", async () => {
  const response = await worker.fetch(request(), env);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ...reply, remaining: 29 });
  expect(verifyFirebaseToken).toHaveBeenCalledWith(
    "signed-token",
    "yuwenke-a1df9",
  );
  expect(reserve).toHaveBeenCalledWith("https://quota/reserve", {
    method: "POST",
    body: "alice",
  });
  expect(reserve.mock.invocationCallOrder[0]).toBeLessThan(
    vi.mocked(generateTutorReply).mock.invocationCallOrder[0],
  );
  expect(generateTutorReply).toHaveBeenCalledWith(
    data,
    expect.anything(),
    expect.objectContaining({ model: "glm-5.3-flash" }),
  );
  expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
    env.ALLOWED_ORIGIN,
  );
  expect(response.headers.get("Cache-Control")).toBe("no-store");
});
it("rejects client identity, model overrides, invalid cards, and oversized bodies before reserving", async () => {
  for (const body of [
    { ...data, uid: "bob" },
    { ...data, model: "expensive" },
    {
      ...data,
      progress: [
        { cardId: "FC999", direction: "meaning-hanzi", status: "learning" },
      ],
    },
    "x".repeat(140000),
  ]) {
    expect((await worker.fetch(request(body), env)).status).toBe(400);
  }
  expect(reserve).not.toHaveBeenCalled();
});
it("handles preflight only for the allowed origin and route", async () => {
  const response = await worker.fetch(
    new Request("https://lei.example/conversation", {
      method: "OPTIONS",
      headers: { Origin: env.ALLOWED_ORIGIN },
    }),
    env,
  );
  expect(response.status).toBe(204);
  expect(response.headers.get("Access-Control-Allow-Headers")).toContain(
    "Authorization",
  );
  const denied = await worker.fetch(
    request(data, { Origin: "https://other.example" }),
    env,
  );
  expect(denied.status).toBe(403);
  expect(denied.headers.has("Access-Control-Allow-Origin")).toBe(false);
  expect(
    (await worker.fetch(new Request("https://lei.example/quota"), env)).status,
  ).toBe(404);
  expect(verifyFirebaseToken).not.toHaveBeenCalled();
});
it("fails closed when disabled, unconfigured, or unable to reserve allowance", async () => {
  expect(
    (await worker.fetch(request(), { ...env, CHAT_ENABLED: "false" })).status,
  ).toBe(503);
  expect(
    (await worker.fetch(request(), { ...env, OPENCODE_GO_API_KEY: "" })).status,
  ).toBe(503);
  for (const status of [429, 503]) {
    reserve.mockResolvedValue(new Response(null, { status }));
    const response = await worker.fetch(request(), env);
    expect(response.status).toBe(status);
  }
  reserve.mockRejectedValue(new Error("private database failure"));
  const response = await worker.fetch(request(), env);
  expect(await response.text()).not.toContain("private");
  expect(generateTutorReply).not.toHaveBeenCalled();
});
it("does not leak provider errors or refund a potentially billed request", async () => {
  vi.mocked(generateTutorReply).mockRejectedValue(
    new Error(env.OPENCODE_GO_API_KEY),
  );
  const response = await worker.fetch(request(), env);
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain(env.OPENCODE_GO_API_KEY);
  expect(reserve).toHaveBeenCalledTimes(1);
});
