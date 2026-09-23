import { z } from "zod";
import { ChatError } from "./tutor.js";

const usageSchema = z.object({
  day: z.string(),
  daily: z.number().int().nonnegative(),
  month: z.string(),
  monthly: z.number().int().nonnegative(),
  minute: z.number().int(),
  burst: z.number().int().nonnegative(),
});

export interface ChatLimits {
  userDaily: number;
  globalDaily: number;
  globalMonthly: number;
}

export function consumeQuota(
  userData: unknown,
  globalData: unknown,
  now: number,
  limits: ChatLimits,
) {
  const day = new Date(now).toISOString().slice(0, 10);
  const month = day.slice(0, 7);
  const minute = Math.floor(now / 60000);
  function current(value: unknown) {
    // A missing document starts a new counter. Corrupt counters fail closed.
    const old = value === undefined ? undefined : usageSchema.parse(value);
    return {
      day,
      month,
      minute,
      daily: old?.day === day ? old.daily : 0,
      monthly: old?.month === month ? old.monthly : 0,
      burst: old?.minute === minute ? old.burst : 0,
    };
  }
  const user = current(userData);
  const global = current(globalData);
  if (
    user.daily >= limits.userDaily ||
    user.burst >= 6 ||
    global.daily >= limits.globalDaily ||
    global.monthly >= limits.globalMonthly
  ) {
    throw new ChatError(
      "resource-exhausted",
      "Conversation allowance reached. Please try again later.",
    );
  }
  for (const counter of [user, global]) {
    counter.daily += 1;
    counter.monthly += 1;
    counter.burst += 1;
  }
  return { user, global, remaining: limits.userDaily - user.daily };
}
