import type {
  DurableObjectNamespace,
  DurableObjectState,
} from "@cloudflare/workers-types";
import { z } from "zod";
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
  CHAT_GUEST_TOTAL_LIMIT: string;
  CHAT_GUEST_IP_DAILY_LIMIT: string;
  CHAT_GLOBAL_DAILY_LIMIT: string;
  CHAT_GLOBAL_MONTHLY_LIMIT: string;
  CHAT_QUOTA: DurableObjectNamespace;
}

const cards = catalog as ChatCard[];
const MAX_BODY_BYTES = 128 * 1024;

async function guestIpKey(ip: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`lei-guest:${ip}`),
  );
  return Array.from(new Uint8Array(signature), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

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
    const guestIpKey = request.headers.get("X-Lei-Guest-Ip-Key");
    const guest = guestIpKey !== null;
    if (guest && !/^[a-f0-9]{64}$/.test(guestIpKey))
      return new Response(null, { status: 400 });
    try {
      const remaining = await this.ctx.storage.transaction(
        async (transaction) => {
          const userKey = `${guest ? "guest" : "user"}:${uid}`;
          const [user, global, total, ipUsage] = await Promise.all([
            transaction.get(userKey),
            transaction.get("global"),
            guest ? transaction.get(`guest-total:${uid}`) : undefined,
            guest ? transaction.get(`guest-ip:${guestIpKey}`) : undefined,
          ]);
          const totalUsed = total === undefined ? 0 : Number(total);
          const ip = ipUsage === undefined ? null : guestIpUsageSchema.parse(ipUsage);
          const now = Date.now();
          const today = new Date(now).toISOString().slice(0, 10);
          const ipUsedToday = ip?.day === today ? ip.count : 0;
          if (guest && !Number.isSafeInteger(totalUsed))
            throw new Error("Invalid guest counter.");
          if (guest && totalUsed >= limit(this.env.CHAT_GUEST_TOTAL_LIMIT))
            throw new ChatError("guest-exhausted", "Guest trial finished.");
          if (guest && ipUsedToday >= limit(this.env.CHAT_GUEST_IP_DAILY_LIMIT))
            throw new ChatError("resource-exhausted", "Network allowance reached.");
          const quota = consumeQuota(user, global, now, {
            userDaily: guest
              ? limit(this.env.CHAT_GUEST_TOTAL_LIMIT)
              : limit(this.env.CHAT_USER_DAILY_LIMIT),
            globalDaily: limit(this.env.CHAT_GLOBAL_DAILY_LIMIT),
            globalMonthly: limit(this.env.CHAT_GLOBAL_MONTHLY_LIMIT),
          });
          await transaction.put({
            [userKey]: quota.user,
            global: quota.global,
            ...(guest ? {
              [`guest-total:${uid}`]: totalUsed + 1,
              [`guest-ip:${guestIpKey}`]: { day: today, count: ipUsedToday + 1 },
            } : {}),
          });
          return { remaining: guest
            ? limit(this.env.CHAT_GUEST_TOTAL_LIMIT) - totalUsed - 1
            : quota.remaining };
        },
      );
      return Response.json(remaining);
    } catch (error) {
      if (error instanceof ChatError)
        return new Response(null, {
          status: 429,
          headers: { "X-Lei-Quota-Code": error.code },
        });
      return new Response(null, { status: 503 });
    }
  }
}

const guestIpUsageSchema = z.object({
  day: z.string(),
  count: z.number().int().nonnegative(),
});

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
    const error = (status: number, code: string, remaining?: number) =>
      Response.json({
        error: { code },
        ...(remaining === undefined ? {} : { remaining }),
      }, { status, headers });
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
          "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Lei-Guest-Id",
          "Access-Control-Max-Age": "3600",
        },
      });
    if (request.method !== "POST") return error(405, "invalid-argument");
    if (env.CHAT_ENABLED !== "true" || !env.OPENCODE_GO_API_KEY)
      return error(503, "unavailable");
    const token = request.headers
      .get("Authorization")
      ?.match(/^Bearer (\S+)$/)?.[1];
    const guestId = request.headers.get("X-Lei-Guest-Id");
    if (token && token.length > 16384) return error(401, "unauthenticated");
    if (!token && (
      origin !== env.ALLOWED_ORIGIN ||
      !guestId ||
      !z.uuid().safeParse(guestId).success
    )) return error(401, "unauthenticated");
    let uid: string;
    let ipKey: string | null = null;
    if (token) {
      try {
        uid = await verifyFirebaseToken(token, env.FIREBASE_PROJECT_ID);
      } catch {
        return error(401, "unauthenticated");
      }
    } else {
      const ip = request.headers.get("CF-Connecting-IP") ??
        (new URL(request.url).hostname === "localhost" ? "127.0.0.1" : null);
      if (!ip || ip.length > 64) return error(503, "unavailable");
      uid = guestId ?? "";
      ipKey = await guestIpKey(ip, env.OPENCODE_GO_API_KEY);
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
    let allowanceRemaining: number | undefined;
    try {
      const quota = env.CHAT_QUOTA.get(env.CHAT_QUOTA.idFromName("global"));
      const reservation = await quota.fetch("https://quota/reserve", {
        method: "POST",
        body: uid,
        ...(ipKey ? { headers: { "X-Lei-Guest-Ip-Key": ipKey } } : {}),
      });
      if (reservation.status === 429)
        return error(429,
          reservation.headers.get("X-Lei-Quota-Code") === "guest-exhausted"
            ? "guest-exhausted"
            : "resource-exhausted");
      if (!reservation.ok) return error(503, "unavailable");
      const allowance = await reservation.json<{ remaining: number }>();
      if (!Number.isSafeInteger(allowance.remaining) || allowance.remaining < 0)
        return error(503, "unavailable");
      allowanceRemaining = allowance.remaining;
      const result = await generateTutorReply(data, cards, {
        apiKey: env.OPENCODE_GO_API_KEY,
        model: env.CHAT_MODEL || DEFAULT_CHAT_MODEL,
        fetch: (input, init) => fetch(input, init),
      });
      return Response.json(
        { ...result, remaining: allowance.remaining },
        { headers },
      );
    } catch (cause) {
      // Provider errors and credentials never reach the browser or application logs.
      if (cause instanceof ChatError && cause.code === "deadline-exceeded") {
        return error(504, "deadline-exceeded", allowanceRemaining);
      }
      return error(503, "unavailable", allowanceRemaining);
    }
  },
};
