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

export async function POST(request: Request) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  const classify = await classifyNewModels();
  const brand = await inferMissingBrands();
  const capabilities = await inferMissingCapabilities();

  const result = {
    timestamp: new Date().toISOString(),
    classify,
    brand,
    capabilities,
  };

  // 持久化结果
  await setConfig(
    "LAST_INFERENCE_RESULT",
    JSON.stringify(result),
    "最近一次 LLM 推断结果（分类/品牌/能力）",
  );

  return NextResponse.json(result);
}
