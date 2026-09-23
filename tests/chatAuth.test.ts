// @vitest-environment node
import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type JWTPayload,
} from "jose";
import { verifyFirebaseToken } from "../worker/src/auth";

const project = "test-project";
let privateKey: CryptoKey;
let keys: ReturnType<typeof createLocalJWKSet>;
beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey;
  keys = createLocalJWKSet({
    keys: [{ ...(await exportJWK(pair.publicKey)), kid: "test" }],
  });
});
function sign(overrides: JWTPayload = {}) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    sub: "alice",
    aud: project,
    iss: `https://securetoken.google.com/${project}`,
    iat: now,
    exp: now + 3600,
    auth_time: now - 60,
    firebase: { sign_in_provider: "google.com" },
    ...overrides,
  })
    .setProtectedHeader({ alg: "RS256", kid: "test" })
    .sign(privateKey);
}
it("accepts a signed Firebase identity for the configured project", async () => {
  expect(await verifyFirebaseToken(await sign(), project, keys)).toBe("alice");
});
it.each([
  { aud: "other-project" },
  { iss: "https://attacker.example" },
  { exp: 1 },
  { sub: "" },
  { sub: "a".repeat(129) },
  { iat: 9999999999 },
  { auth_time: 9999999999 },
  { firebase: { sign_in_provider: "anonymous" } },
  { firebase: {} },
  { auth_time: undefined },
])("rejects invalid Firebase claims: %j", async (claims) => {
  await expect(
    verifyFirebaseToken(await sign(claims), project, keys),
  ).rejects.toThrow();
});
it("rejects a forged token", async () => {
  const token = await sign();
  const parts = token.split(".");
  parts[1] = Buffer.from(JSON.stringify({ sub: "attacker" })).toString(
    "base64url",
  );
  await expect(
    verifyFirebaseToken(parts.join("."), project, keys),
  ).rejects.toThrow();
});
