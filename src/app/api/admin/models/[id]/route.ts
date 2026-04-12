export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-guard";
import { errorResponse } from "@/lib/api/errors";

const VALID_CAPABILITY_KEYS = new Set([
  "streaming",
  "json_mode",
  "function_calling",
  "vision",
  "reasoning",
  "search",
]);

/**
 * PATCH /api/admin/models/:id
 *
 * 支持字段：
 *   enabled: boolean          — 启用/禁用模型
 *   capabilities: object      — 更新 capabilities（仅允许合法 key）
 *   supportedSizes: string[]  — 更新 supportedSizes（image 模型用）
 */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  const body = await request.json();

  // Whitelist allowed fields
  const modelUpdate: Record<string, unknown> = {};
  if (typeof body.enabled === "boolean") {
    modelUpdate.enabled = body.enabled;
  }

  // Capabilities update
  if (body.capabilities !== undefined) {
    if (
      typeof body.capabilities !== "object" ||
      body.capabilities === null ||
      Array.isArray(body.capabilities)
    ) {
      return errorResponse(400, "invalid_parameter", "capabilities must be a valid object");
    }
    const invalidKeys = Object.keys(body.capabilities).filter((k) => !VALID_CAPABILITY_KEYS.has(k));
    if (invalidKeys.length > 0) {
      return errorResponse(
        400,
        "invalid_parameter",
        `Invalid capability keys: ${invalidKeys.join(", ")}`,
      );
    }
    modelUpdate.capabilities = body.capabilities;
  }

  // SupportedSizes update
  if (body.supportedSizes !== undefined) {
    if (body.supportedSizes !== null && !Array.isArray(body.supportedSizes)) {
      return errorResponse(400, "invalid_parameter", "supportedSizes must be an array or null");
    }
    if (
      Array.isArray(body.supportedSizes) &&
      !body.supportedSizes.every((s: unknown) => typeof s === "string")
    ) {
      return errorResponse(400, "invalid_parameter", "supportedSizes must be an array of strings");
    }
    modelUpdate.supportedSizes = body.supportedSizes;
  }

  // Update model if there are model-level changes
  if (Object.keys(modelUpdate).length > 0) {
    await prisma.model.update({
      where: { id: params.id },
      data: modelUpdate,
    });
  }

  // Return updated model with channels
  const model = await prisma.model.findUnique({
    where: { id: params.id },
    include: {
      channels: {
        include: {
          provider: { select: { name: true, displayName: true } },
        },
        orderBy: { priority: "asc" },
      },
    },
  });

  if (!model) {
    return errorResponse(404, "not_found", "Model not found");
  }

  return NextResponse.json(model);
}
