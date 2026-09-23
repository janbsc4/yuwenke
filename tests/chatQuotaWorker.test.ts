// @vitest-environment node
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { resolve } from "node:path";
import { generateKeyPair, exportJWK, SignJWT, type JWK } from "jose";

let mf: Miniflare;
let privateKey: CryptoKey;
let jwk: JWK;
const provider = vi.fn();
beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey;
  jwk = { ...(await exportJWK(pair.publicKey)), kid: "local-test" };
});
beforeEach(() => {
  provider.mockReset();
  provider.mockResolvedValue(
    Response.json({
      choices: [
        {
          finish_reason: "stop",
          message: {
            content: JSON.stringify({
              chinese: "你好",
              pinyin: "Nǐ hǎo",
              meaning: "Hello",
              feedback: "",
              hint: "你好",
              practicedCardIds: [],
            }),
          },
        },
      ],
    }),
  );
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      scriptPath: resolve("worker/dist/index.js"),
      compatibilityDate: "2026-09-23",
      durableObjects: {
        CHAT_QUOTA: { className: "ChatQuota", useSQLite: true },
      },
      bindings: {
        CHAT_USER_DAILY_LIMIT: "6",
        CHAT_GLOBAL_DAILY_LIMIT: "8",
        CHAT_GLOBAL_MONTHLY_LIMIT: "3000",
        FIREBASE_PROJECT_ID: "local-test",
        ALLOWED_ORIGIN: "https://janbsc4.github.io",
        CHAT_ENABLED: "true",
        CHAT_MODEL: "glm-5.3-flash",
        OPENCODE_GO_API_KEY: "test-key",
      },
      outboundService: async (request) => {
        if (
          request.url ===
          "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"
        ) {
          return Response.json({ keys: [jwk] });
        }
        expect(request.url).toBe(
          "https://opencode.ai/zen/go/v1/chat/completions",
        );
        expect(request.headers.get("User-Agent")).toBe(
          "Yuwenke-Language-Practice/1.0",
        );
        return (await provider(await request.json())) as Response;
      },
    }),
  );
});
afterEach(async () => {
  await mf.dispose();
});
it("atomically enforces user and global daily allowances for concurrent requests", async () => {
  const namespace = await mf.getDurableObjectNamespace("CHAT_QUOTA");
  const object = namespace.get(namespace.idFromName("global"));
  const reserve = (uid: string) =>
    object.fetch("https://quota/reserve", { method: "POST", body: uid });
  const alice = await Promise.all(
    Array.from({ length: 12 }, () => reserve("alice")),
  );
  expect(alice.filter((r) => r.status === 200)).toHaveLength(6);
  expect(alice.filter((r) => r.status === 429)).toHaveLength(6);
  const others = await Promise.all(
    Array.from({ length: 10 }, (_, i) => reserve(`learner-${i}`)),
  );
  expect(others.filter((r) => r.status === 200)).toHaveLength(2);
  expect(others.filter((r) => r.status === 429)).toHaveLength(8);
});
it("does not expose quota storage through public Worker routes", async () => {
  const response = await mf.dispatchFetch("https://lei.example/quota");
  expect(response.status).toBe(404);
});

it("runs signed authentication, durable quota, and inference together in the Worker runtime", async () => {
  const now = Math.floor(Date.now() / 1000);
  const token = await new SignJWT({
    sub: "alice",
    aud: "local-test",
    iss: "https://securetoken.google.com/local-test",
    iat: now,
    exp: now + 300,
    auth_time: now,
    firebase: { sign_in_provider: "google.com" },
  })
    .setProtectedHeader({ alg: "RS256", kid: "local-test" })
    .sign(privateKey);
  const response = await mf.dispatchFetch("https://lei.example/conversation", {
    method: "POST",
    headers: {
      Origin: "https://janbsc4.github.io",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sessionId: crypto.randomUUID(),
      locale: "en",
      topic: "",
      progress: [],
      messages: [{ role: "user", content: "Hello" }],
    }),
  });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    model: "glm-5.3-flash",
    remaining: 5,
  });
  expect(provider).toHaveBeenCalledWith(
    expect.objectContaining({ model: "glm-5.3-flash" }),
  );
});
