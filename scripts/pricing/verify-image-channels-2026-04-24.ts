/**
 * BL-BILLING-AUDIT-EXT-P1 F-BAX-08 — image pricing apply 后抽样 smoke。
 *
 * 对 3 家 provider 各触发一次真实 image 调用，查 call_logs 断言 costPrice > 0。
 * spec § 3.6。
 *
 * 用法（生产）：
 *   BASE_URL=https://aigc.guangai.ai API_KEY=pk_xxx \
 *     npx tsx scripts/pricing/verify-image-channels-2026-04-24.ts
 *
 * 环境变量：
 *   BASE_URL  — 网关域，默认 http://localhost:3099
 *   API_KEY   — 触发请求用的有效 API key（pk_xxx）
 */
import { prisma } from "../../src/lib/prisma";

interface SmokeTarget {
  alias: string;
  label: string;
}

// F-BAX-08 smoke: 挑 3 个在生产 enabled 的 image alias，每个覆盖一个 provider
// （/v1/models 实测可用：seedream-3 / gpt-image / gpt-image-mini / gemini-3-pro-image）。
const TARGETS: readonly SmokeTarget[] = [
  { alias: "seedream-3", label: "volcengine" },
  { alias: "gpt-image-mini", label: "openai(CAW) mini" },
  { alias: "gemini-3-pro-image", label: "openai(CAW) gemini" },
];

async function triggerImage(
  baseUrl: string,
  apiKey: string,
  alias: string,
): Promise<{ traceId: string; status: number; errBody?: string }> {
  const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/v1/images/generations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: alias, prompt: "a tiny red dot on white", size: "1024x1024" }),
  });
  // traceId is returned in X-Trace-Id header (jsonResponse helper), not body.
  const traceId = res.headers.get("x-trace-id") ?? "";
  const text = await res.text();
  const errBody = res.ok ? undefined : text.slice(0, 200);
  return { traceId, status: res.status, errBody };
}

async function fetchCostPrice(traceId: string): Promise<number | null> {
  // small retry loop: post-process is async
  for (let i = 0; i < 10; i++) {
    const row = await prisma.callLog.findUnique({
      where: { traceId },
      select: { costPrice: true, status: true, errorMessage: true },
    });
    if (row && row.status !== null) {
      const cp = row.costPrice ? Number(row.costPrice) : 0;
      return cp;
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
    process.exit(2);
  }

  console.log(`=== F-BAX-08 pricing smoke (${baseUrl}) ===`);
  let failed = 0;
  for (const t of TARGETS) {
    console.log(`\n--- ${t.label} / ${t.alias} ---`);
    try {
      const { traceId, status, errBody } = await triggerImage(baseUrl, apiKey, t.alias);
      console.log(`http=${status} traceId=${traceId || "(missing)"}`);
      if (errBody) console.warn(`[body] ${errBody}`);
      if (!traceId) {
        console.warn(`[warn] no traceId returned — upstream may have failed`);
        failed++;
        continue;
      }
      const costPrice = await fetchCostPrice(traceId);
      if (costPrice === null) {
        console.warn(`[warn] call_log not found for traceId=${traceId}`);
        failed++;
        continue;
      }
      const pass = costPrice > 0;
      console.log(`call_logs.costPrice=${costPrice} → ${pass ? "PASS" : "FAIL"}`);
      if (!pass) failed++;
    } catch (err) {
      console.error(`[error] ${err instanceof Error ? err.message : String(err)}`);
      failed++;
    }
  }

  console.log(`\nSummary: ${TARGETS.length - failed}/${TARGETS.length} PASS`);
  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

const isDirectRun =
  typeof process.argv[1] === "string" &&
  process.argv[1].endsWith("verify-image-channels-2026-04-24.ts");
if (isDirectRun) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
