export const dynamic = "force-dynamic";
/**
 * POST /api/admin/run-inference
 *
 * 手动触发 LLM 推断（分类 + 品牌 + 能力），同步执行并返回结果。
 */

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-guard";
import {
  classifyNewModels,
  inferMissingBrands,
  inferMissingCapabilities,
} from "@/lib/sync/alias-classifier";
import { setConfig } from "@/lib/config";
import { writeSystemLog } from "@/lib/system-logger";
import { getRedis } from "@/lib/redis";

function setInferenceProgress(phase: string, step: number, total: number) {
  const redis = getRedis();
  if (!redis) return;
  redis
    .set(
      "inference:progress",
      JSON.stringify({ status: "running", phase, step, total }),
      "EX",
      300,
    )
    .catch(() => {});
}

export async function POST(request: Request) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  setInferenceProgress("classify", 1, 3);
  const classify = await classifyNewModels();

  setInferenceProgress("brand", 2, 3);
  const brand = await inferMissingBrands();

  setInferenceProgress("capabilities", 3, 3);
  const capabilities = await inferMissingCapabilities();

  const result = {
    timestamp: new Date().toISOString(),
    classify,
    brand,
    capabilities,
  };

  // Mark progress done
  const redis = getRedis();
  if (redis) {
    await redis.set("inference:progress", JSON.stringify({ status: "done", step: 3, total: 3 }), "EX", 60).catch(() => {});
  }

  // 持久化结果
  await setConfig(
    "LAST_INFERENCE_RESULT",
    JSON.stringify(result),
    "最近一次 LLM 推断结果（分类/品牌/能力）",
  );

  const totalErrors = classify.errors.length + brand.errors.length + capabilities.errors.length;
  const level = totalErrors > 0 ? "ERROR" : "INFO";
  await writeSystemLog(
    "INFERENCE",
    level,
    `Inference completed: ${classify.classified} classified, ${brand.updated} brands, ${capabilities.updated} capabilities, ${totalErrors} errors`,
    JSON.parse(JSON.stringify(result)),
  );

  return NextResponse.json(result);
}
