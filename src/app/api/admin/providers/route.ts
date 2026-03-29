import { PrismaClient } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-guard";
import { errorResponse } from "@/lib/api/errors";

const prisma = new PrismaClient();

export async function GET(request: Request) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  const providers = await prisma.provider.findMany({
    include: { _count: { select: { channels: true } }, config: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({
    data: providers.map((p) => ({
      id: p.id,
      name: p.name,
      displayName: p.displayName,
      baseUrl: p.baseUrl,
      adapterType: p.adapterType,
      status: p.status,
      channelCount: p._count.channels,
      proxyUrl: p.proxyUrl,
      hasConfig: !!p.config,
    })),
  });
}

export async function POST(request: Request) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  const body = await request.json();
  const { name, displayName, baseUrl, authType, apiKey, adapterType, proxyUrl, rateLimit } = body;

  if (!name || !displayName || !baseUrl) {
    return errorResponse(400, "invalid_parameter", "name, displayName, baseUrl are required");
  }

  const provider = await prisma.provider.create({
    data: {
      name,
      displayName,
      baseUrl,
      authType: authType ?? "bearer",
      authConfig: { apiKey: apiKey ?? "" },
      adapterType: adapterType ?? "openai-compat",
      proxyUrl: proxyUrl ?? null,
      rateLimit: rateLimit ?? null,
    },
  });

  return NextResponse.json(provider, { status: 201 });
}
