export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-guard";
import { errorResponse } from "@/lib/api/errors";
import { ZodError } from "zod";
import type { Prisma } from "@prisma/client";
import {
  modelUpdateSchema,
  zodErrorResponse,
  mapJsonNulls,
  MODEL_JSON_FIELDS,
} from "@/lib/api/admin-schemas";

/**
 * PATCH /api/admin/models/:id
 *
 * Accepted fields (F-IG-01 via modelUpdateSchema):
 *   enabled: boolean
 *   capabilities: Record<validKey, boolean>  — keys restricted to the
 *     VALID_CAPABILITY_KEYS set.
 *   supportedSizes: string[] | null
 * All other fields are rejected with a 400.
 */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  const body = await request.json();

  let modelUpdate;
  try {
    modelUpdate = modelUpdateSchema.parse(body);
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err);
    throw err;
  }

  if (Object.keys(modelUpdate).length > 0) {
    await prisma.model.update({
      where: { id: params.id },
      data: mapJsonNulls(modelUpdate, MODEL_JSON_FIELDS) as Prisma.ModelUpdateInput,
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
