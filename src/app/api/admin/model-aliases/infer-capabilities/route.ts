export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-guard";
import { inferMissingCapabilities } from "@/lib/sync/alias-classifier";

/**
 * POST /api/admin/model-aliases/infer-capabilities
 * 触发 LLM 批量推断 capabilities（仅填充空值，不覆盖已有）
 */
export async function POST(request: Request) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  const result = await inferMissingCapabilities();

  return NextResponse.json({
    updated: result.updated,
    errors: result.errors,
  });
}
