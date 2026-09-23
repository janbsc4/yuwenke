import type {
  DurableObjectNamespace,
  DurableObjectState,
} from "@cloudflare/workers-types";
import { DEFAULT_CHAT_MODEL, type ChatCard } from "../../shared/chat";
import catalog from "../generated/catalog.json";
import { verifyFirebaseToken } from "./auth";
import { consumeQuota } from "./quota";
import { ChatError, generateTutorReply, parseChatRequest } from "./tutor";

export interface Env {
  FIREBASE_PROJECT_ID: string;
  ALLOWED_ORIGIN: string;
  OPENCODE_GO_API_KEY: string;
  CHAT_MODEL: string;
  CHAT_ENABLED: string;
  CHAT_USER_DAILY_LIMIT: string;
  CHAT_GLOBAL_DAILY_LIMIT: string;
  CHAT_GLOBAL_MONTHLY_LIMIT: string;
  CHAT_QUOTA: DurableObjectNamespace;
}

const cards = catalog as ChatCard[];
const MAX_BODY_BYTES = 128 * 1024;

function limit(value: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0)
    throw new Error("Invalid allowance configuration.");
  return parsed;
}

// This object has no public route. A single instance reserves user and global
// counters together, so concurrent requests cannot spend the same allowance.
export class ChatQuota {
  constructor(
    private ctx: DurableObjectState,
    private env: Env,
  ) {}

  async fetch(request: Request): Promise<Response> {
    const uid = await request.text();
    if (!uid || uid.length > 128) return new Response(null, { status: 400 });
    try {
      const remaining = await this.ctx.storage.transaction(
        async (transaction) => {
          const userKey = `user:${uid}`;
          const [user, global] = await Promise.all([
            transaction.get(userKey),
            transaction.get("global"),
          ]);
          const quota = consumeQuota(user, global, Date.now(), {
            userDaily: limit(this.env.CHAT_USER_DAILY_LIMIT),
            globalDaily: limit(this.env.CHAT_GLOBAL_DAILY_LIMIT),
            globalMonthly: limit(this.env.CHAT_GLOBAL_MONTHLY_LIMIT),
          });
          await transaction.put({
            [userKey]: quota.user,
            global: quota.global,
          });
          return quota.remaining;
        },
      );
      return Response.json({ remaining });
    } catch (error) {
      if (error instanceof ChatError)
        return new Response(null, { status: 429 });
      return new Response(null, { status: 503 });
    }
  }
}

async function readBody(request: Request): Promise<unknown> {
  if (!request.body) throw new Error("Missing body.");
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new Error("Request too large.");
    }
    text += decoder.decode(value, { stream: true });
  }
  return JSON.parse(text + decoder.decode()) as unknown;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("Origin");
    const headers: Record<string, string> = {
      "Cache-Control": "no-store",
      Vary: "Origin",
      ...(origin === env.ALLOWED_ORIGIN
        ? { "Access-Control-Allow-Origin": origin }
        : {}),
    };
    const error = (status: number, code: string) =>
      Response.json({ error: { code } }, { status, headers });
    if (origin && origin !== env.ALLOWED_ORIGIN)
      return error(403, "permission-denied");
    if (new URL(request.url).pathname !== "/conversation")
      return error(404, "not-found");
    if (request.method === "OPTIONS")
      return new Response(null, {
        status: 204,
        headers: {
          ...headers,
          "Access-Control-Allow-Methods": "POST",
          "Access-Control-Allow-Headers": "Authorization, Content-Type",
          "Access-Control-Max-Age": "3600",
        },
      });
    if (request.method !== "POST") return error(405, "invalid-argument");
    if (env.CHAT_ENABLED !== "true" || !env.OPENCODE_GO_API_KEY)
      return error(503, "unavailable");
    const token = request.headers
      .get("Authorization")
      ?.match(/^Bearer (\S+)$/)?.[1];
    if (!token || token.length > 16384) return error(401, "unauthenticated");
    let uid: string;
    try {
      uid = await verifyFirebaseToken(token, env.FIREBASE_PROJECT_ID);
    } catch {
      return error(401, "unauthenticated");
    }
    let data;
    try {
      if (
        request.headers.get("Content-Type")?.split(";")[0].trim() !==
        "application/json"
      )
        throw new Error("Expected JSON.");
      data = parseChatRequest(await readBody(request), cards);
    } catch {
      return error(400, "invalid-argument");
    }
    try {
      const quota = env.CHAT_QUOTA.get(env.CHAT_QUOTA.idFromName("global"));
      const reservation = await quota.fetch("https://quota/reserve", {
        method: "POST",
        body: uid,
      });
      if (reservation.status === 429) return error(429, "resource-exhausted");
      if (!reservation.ok) return error(503, "unavailable");
      const allowance = await reservation.json<{ remaining: number }>();
      if (!Number.isSafeInteger(allowance.remaining) || allowance.remaining < 0)
        return error(503, "unavailable");
      const result = await generateTutorReply(data, cards, {
        apiKey: env.OPENCODE_GO_API_KEY,
        model: env.CHAT_MODEL || DEFAULT_CHAT_MODEL,
        fetch: (input, init) => fetch(input, init),
      });
      return Response.json(
        { ...result, remaining: allowance.remaining },
        { headers },
      );
    } catch {
      // Provider errors and credentials never reach the browser or application logs.
      return error(503, "unavailable");
    }
  },
};
