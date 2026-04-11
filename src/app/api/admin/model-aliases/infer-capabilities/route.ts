export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-guard";
import { inferMissingCapabilities, reinferAllCapabilities } from "@/lib/sync/alias-classifier";

/**
 * POST /api/admin/model-aliases/infer-capabilities
 * 触发 LLM 批量推断 capabilities
 * - 默认：仅填充空值，不覆盖已有
 * - ?force=true：迁移 image_input → vision，然后对所有别名重跑推断（覆盖已有）
 */
export async function POST(request: Request) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  const url = new URL(request.url);
  const force = url.searchParams.get("force") === "true";

  if (force) {
    const result = await reinferAllCapabilities();
    return NextResponse.json({
      mode: "reinfer_all",
      migrated: result.migrated,
      updated: result.updated,
      skipped: result.skipped,
      errors: result.errors,
    });
  }

  const result = await inferMissingCapabilities();
  return NextResponse.json({
    mode: "missing_only",
    updated: result.updated,
    errors: result.errors,
  });
}
