/**
 * BL-IMAGE-PRICING-OR-P2 F-BIPOR-03 — OR pricing apply 后生产 smoke。
 *
 * 调用一次最便宜的 google/gemini-2.5-flash-image（input 0.3 / output 2.5
 * USD per 1M），查 call_logs 断言：
 *   1) costPrice > 0
 *   2) costPrice == (prompt_tokens × 0.30 + completion_tokens × 2.50) / 1e6
 *      （±1e-6 浮点容差，铁律 1.3）
 *
 * 用法（生产）：
 *   BASE_URL=https://aigc.guangai.ai API_KEY=pk_xxx \
 *     npx tsx scripts/pricing/verify-or-image-channels-2026-04-25.ts
 */
import { prisma } from "../../src/lib/prisma";
import { disconnectRedis } from "../../src/lib/redis";

/**
 * 集中清理：prisma + redis 都要 quit，否则 .env.production 下 ioredis
 * 单例 keep-alive 会让 node 进程不退出（Codex 复验跑 idempotency 用 timeout 124）。
 */
async function cleanup(): Promise<void> {
  await prisma.$disconnect().catch(() => {});
  await disconnectRedis();
}

async function exitWith(code: number): Promise<never> {
  await cleanup();
  process.exit(code);
}

// Codex 复验 2026-04-25 实证：生产 enabled alias 是 OR canonical 全名（带
// google/ 前缀），不是 spec § 3.1 表的去前缀简写。复验 trc_b5b1fk03vzr1ia80pvl04au8
// 用 'google/gemini-2.5-flash-image' 收到 HTTP 200。
const TARGET_ALIAS = "google/gemini-2.5-flash-image";
const TARGET_INPUT_PER_1M = 0.3;
const TARGET_OUTPUT_PER_1M = 2.5;

async function trigger(
  baseUrl: string,
  apiKey: string,
): Promise<{ traceId: string; status: number; body: string }> {
  const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/v1/images/generations`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: TARGET_ALIAS,
      prompt: "a small green dot on white",
      size: "1024x1024",
    }),
  });
  const traceId = res.headers.get("x-trace-id") ?? "";
  const text = await res.text();
  return { traceId, status: res.status, body: text };
}

async function fetchCallLog(traceId: string): Promise<{
  costPrice: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
  modelName: string;
  status: string;
} | null> {
  for (let i = 0; i < 10; i++) {
    const row = await prisma.callLog.findUnique({
      where: { traceId },
      select: {
        costPrice: true,
        promptTokens: true,
        completionTokens: true,
        modelName: true,
        status: true,
      },
    });
    if (row && row.status !== null) {
      return {
        costPrice: row.costPrice ? Number(row.costPrice) : null,
        promptTokens: row.promptTokens,
        completionTokens: row.completionTokens,
        modelName: row.modelName,
        status: row.status,
      };
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
}

async function main(): Promise<void> {
  const baseUrl = process.env.BASE_URL ?? "http://localhost:3099";
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    console.error("API_KEY env required");
    return exitWith(2);
  }
  console.log(`=== F-BIPOR-03 OR pricing smoke (${baseUrl}) ===`);
  console.log(
    `alias=${TARGET_ALIAS} pricing=(${TARGET_INPUT_PER_1M}/${TARGET_OUTPUT_PER_1M} USD per 1M)`,
  );

  const { traceId, status, body } = await trigger(baseUrl, apiKey);
  console.log(`http=${status} traceId=${traceId || "(missing)"}`);
  if (status >= 400) {
    console.error(`[fail] body=${body.slice(0, 200)}`);
    return exitWith(1);
  }
  if (!traceId) {
    console.error("[fail] no traceId — verify panel can't proceed");
    return exitWith(1);
  }

  const log = await fetchCallLog(traceId);
  if (!log) {
    console.error(`[fail] call_log not found for traceId=${traceId}`);
    return exitWith(1);
  }
  console.log(
    `call_log: model=${log.modelName} prompt=${log.promptTokens} completion=${log.completionTokens} costPrice=${log.costPrice}`,
  );

  const expected =
    ((log.promptTokens ?? 0) * TARGET_INPUT_PER_1M +
      (log.completionTokens ?? 0) * TARGET_OUTPUT_PER_1M) /
    1e6;
  const actual = log.costPrice ?? 0;
  const diff = Math.abs(expected - actual);
  const tolerance = 1e-6;
  if (actual <= 0) {
    console.error(`[FAIL] costPrice=${actual} (expected>0)`);
    return exitWith(1);
  }
  if (diff > tolerance) {
    console.error(
      `[FAIL] costPrice mismatch — expected=${expected}, actual=${actual}, diff=${diff} (tolerance=${tolerance})`,
    );
    return exitWith(1);
  }
  console.log(`[PASS] costPrice=${actual} matches formula (expected=${expected}, diff=${diff})`);
  await cleanup();
}

const isDirectRun =
  typeof process.argv[1] === "string" &&
  process.argv[1].endsWith("verify-or-image-channels-2026-04-25.ts");
if (isDirectRun) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
