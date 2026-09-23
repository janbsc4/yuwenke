import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

const firebaseKeys = createRemoteJWKSet(
  new URL(
    "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com",
  ),
);

export async function verifyFirebaseToken(
  token: string,
  projectId: string,
  keys: JWTVerifyGetKey = firebaseKeys,
): Promise<string> {
  const { payload } = await jwtVerify(token, keys, {
    algorithms: ["RS256"],
    issuer: `https://securetoken.google.com/${projectId}`,
    audience: projectId,
    requiredClaims: ["exp", "iat", "sub", "auth_time"],
  });
  const now = Math.floor(Date.now() / 1000);
  const firebase = payload.firebase;
  if (
    !payload.sub ||
    payload.sub.length > 128 ||
    typeof payload.iat !== "number" ||
    payload.iat > now ||
    typeof payload.auth_time !== "number" ||
    payload.auth_time > now ||
    !firebase ||
    typeof firebase !== "object" ||
    !("sign_in_provider" in firebase) ||
    typeof firebase.sign_in_provider !== "string" ||
    firebase.sign_in_provider === "anonymous"
  )
    throw new Error("Invalid learner identity.");
  return payload.sub;
}
