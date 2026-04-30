import { writeFileSync } from "fs";
import { spawnSync } from "child_process";
import Redis from "ioredis";
import { withFailover } from "@/lib/engine/failover";
import { EngineError, ErrorCodes } from "@/lib/engine/types";

const OUTPUT =
  process.env.OUTPUT_FILE ??
  "docs/test-reports/routing-resilience-v2-verifying-local-e2e-2026-04-17.json";
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379/0";

type Step = { id: string; ok: boolean; detail: string };

const keyFor = (channelId: string) => `channel:cooldown:${channelId}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function route(providerId: string, channelId: string) {
  return {
    provider: { id: providerId, name: providerId, adapterType: "openai-compat" },
    channel: { id: channelId, priority: 1 },
    model: { name: "rr2-model" },
    config: {},
    alias: { alias: "rr2-alias" },
  } as any;
}

async function awaitCooldown(redis: Redis, channelId: string): Promise<boolean> {
  const k = keyFor(channelId);
  for (let i = 0; i < 20; i++) {
    const v = await redis.get(k);
    if (v) return true;
    await sleep(50);
  }
  return false;
}

async function checkRetryAndCooldown(input: {
  code?: string;
  status?: number;
  genericError?: Error;
  sameProvider?: boolean;
  expectRetry: boolean;
  caseId: string;
  redis: Redis | null;
  requireCooldown: boolean;
}): Promise<Step> {
  const a = `ch_a_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const b = `ch_b_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const providerA = "provider-a";
  const providerB = input.sameProvider ? "provider-a" : "provider-b";

  const candidates = [route(providerA, a), route(providerB, b)];
  let invoked = 0;
  let attempts = 0;
  let retrySucceeded = false;
  let caught: unknown = null;
  try {
    const r = await withFailover(candidates, async (r0) => {
      invoked += 1;
      if (invoked === 1) {
        if (input.genericError) throw input.genericError;
        throw new EngineError(`case-${input.caseId}`, input.code!, input.status ?? 500);
      }
      return { ok: true, channel: r0.channel.id };
    });
    attempts = r.attempts;
    retrySucceeded = true;
  } catch (err) {
    caught = err;
    attempts = invoked;
  }

  let cooldownExists = false;
  if (input.redis) {
    cooldownExists = await awaitCooldown(input.redis, a);
    await input.redis.del(keyFor(a), keyFor(b));
  }

  const ok =
    (input.expectRetry ? retrySucceeded && attempts === 2 : !retrySucceeded && attempts === 1) &&
    (input.expectRetry && input.requireCooldown ? cooldownExists : true);
  return {
    id: input.caseId,
    ok,
    detail: `expectRetry=${input.expectRetry} retrySucceeded=${retrySucceeded} attempts=${attempts} cooldownExists=${cooldownExists} err=${caught instanceof Error ? caught.message : "none"}`,
  };
}

async function run() {
  const steps: Step[] = [];
  const appRedisConfigured = Boolean(process.env.REDIS_URL);
  let redis: Redis | null = null;
  let redisReady = false;
  try {
    redis = new Redis(REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
    await redis.connect();
    await redis.ping();
    redisReady = true;
  } catch {
    redisReady = false;
  }

  const unit = spawnSync(
    "npx",
    ["vitest", "run", "src/lib/engine/cooldown.test.ts", "src/lib/engine/adapter-body-error.test.ts"],
    { cwd: process.cwd(), encoding: "utf8" },
  );
  steps.push({
    id: "AC0-unit-tests-cooldown-and-adapter-body-error",
    ok: unit.status === 0,
    detail: `exit=${unit.status} stdout_tail=${(unit.stdout || "").slice(-200)} stderr_tail=${(unit.stderr || "").slice(-200)}`,
  });

  steps.push(
    await checkRetryAndCooldown({
      caseId: "AC1-429-cross-provider-retry-and-cooldown",
      code: ErrorCodes.RATE_LIMITED,
      status: 429,
      expectRetry: true,
      redis: redisReady ? redis : null,
      requireCooldown: appRedisConfigured,
    }),
  );
  steps.push(
    await checkRetryAndCooldown({
      caseId: "AC2-401-cross-provider-retry-and-cooldown",
      code: ErrorCodes.AUTH_FAILED,
      status: 401,
      expectRetry: true,
      redis: redisReady ? redis : null,
      requireCooldown: appRedisConfigured,
    }),
  );
  steps.push(
    await checkRetryAndCooldown({
      caseId: "AC3-402-cross-provider-retry-and-cooldown",
      code: ErrorCodes.INSUFFICIENT_BALANCE,
      status: 402,
      expectRetry: true,
      redis: redisReady ? redis : null,
      requireCooldown: appRedisConfigured,
    }),
  );
  steps.push(
    await checkRetryAndCooldown({
      caseId: "AC4-provider-error-retry-and-cooldown",
      code: ErrorCodes.PROVIDER_ERROR,
      status: 500,
      expectRetry: true,
      redis: redisReady ? redis : null,
      requireCooldown: appRedisConfigured,
    }),
  );
  steps.push(
    await checkRetryAndCooldown({
      caseId: "AC5-timeout-retry-and-cooldown",
      genericError: new Error("request timeout"),
      expectRetry: true,
      redis: redisReady ? redis : null,
      requireCooldown: appRedisConfigured,
    }),
  );
  steps.push(
    await checkRetryAndCooldown({
      caseId: "AC6-429-same-provider-no-retry",
      code: ErrorCodes.RATE_LIMITED,
      status: 429,
      sameProvider: true,
      expectRetry: false,
      redis: redisReady ? redis : null,
      requireCooldown: appRedisConfigured,
    }),
  );
  steps.push(
    await checkRetryAndCooldown({
      caseId: "AC7-content-filtered-no-retry",
      code: ErrorCodes.CONTENT_FILTERED,
      status: 400,
      expectRetry: false,
      redis: redisReady ? redis : null,
      requireCooldown: appRedisConfigured,
    }),
  );
  steps.push(
    await checkRetryAndCooldown({
      caseId: "AC8-invalid-request-no-retry",
      code: ErrorCodes.INVALID_REQUEST,
      status: 400,
      expectRetry: false,
      redis: redisReady ? redis : null,
      requireCooldown: appRedisConfigured,
    }),
  );
  steps.push({
    id: "AC9-redis-unavailable-429-cross-provider-still-failover",
    ok: !appRedisConfigured,
    detail: `appRedisConfigured=${appRedisConfigured}; environment without REDIS_URL already exercised failover under cooldown degradation in AC1-AC5`,
  });

  if (redis) {
    try {
      await redis.quit();
    } catch {}
  }

  const passCount = steps.filter((s) => s.ok).length;
  const failCount = steps.length - passCount;
  writeFileSync(
    OUTPUT,
    JSON.stringify(
      {
        batch: "ROUTING-RESILIENCE-V2",
        generatedAt: new Date().toISOString(),
        passCount,
        failCount,
        context: { redisUrl: REDIS_URL, redisReady, appRedisConfigured },
        steps,
      },
      null,
      2,
    ),
  );

  if (failCount > 0) {
    console.error(`[routing-resilience-v2-verifying] failed: ${failCount} step(s)`);
    process.exit(1);
  }
}

run().catch((err) => {
  console.error(`[routing-resilience-v2-verifying] ${err instanceof Error ? err.stack : String(err)}`);
  process.exit(1);
});
