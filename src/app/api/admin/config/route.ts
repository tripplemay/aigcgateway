export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-guard";
import { errorResponse } from "@/lib/api/errors";
import { clearRateLimitDefaultsCache } from "@/lib/api/rate-limit";

export async function GET(request: Request) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  const configs = await prisma.systemConfig.findMany({
    orderBy: { key: "asc" },
  });

  return NextResponse.json({ data: configs });
}

export async function PUT(request: Request) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  const body = await request.json();
  if (!body.key || body.value === undefined) {
    return errorResponse(400, "invalid_parameter", "key and value required");
  }

  const config = await prisma.systemConfig.upsert({
    where: { key: body.key },
    update: {
      value: String(body.value),
      ...(body.description !== undefined ? { description: body.description } : {}),
    },
    create: {
      key: body.key,
      value: String(body.value),
      description: body.description,
    },
  });

  // F-RL-06: rate-limit defaults changed → drop the in-process cache so the
  // next request reads the new value immediately.
  if (typeof body.key === "string" && body.key.startsWith("GLOBAL_DEFAULT_")) {
    clearRateLimitDefaultsCache();
  }

  return NextResponse.json({ data: config });
}
