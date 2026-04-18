export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-guard";
import { errorResponse } from "@/lib/api/errors";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { providerCreateSchema, zodErrorResponse } from "@/lib/api/admin-schemas";

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

  // F-IG-01: strict zod whitelist + baseUrl http(s) protocol refine (H-29).
  let parsed;
  try {
    parsed = providerCreateSchema.parse(body);
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err);
    throw err;
  }
  const { name, displayName, baseUrl, authType, apiKey, adapterType, proxyUrl, rateLimit } = parsed;

  // Adapters that support /v1/models API
  const MODELS_API_ADAPTERS = new Set([
    "openai",
    "anthropic",
    "deepseek",
    "zhipu",
    "siliconflow",
    "openrouter",
    "minimax",
    "moonshot",
    "qwen",
    "stepfun",
  ]);

  // Providers whose /models endpoint is unavailable or non-standard
  const SKIP_HEALTH_CHECK_PROVIDERS = new Set(["minimax", "anthropic"]);

  const provider = await prisma.provider.create({
    data: {
      name,
      displayName,
      baseUrl,
      authType: authType ?? "bearer",
      authConfig: { apiKey: apiKey ?? "" },
      adapterType: adapterType ?? "openai-compat",
      proxyUrl: proxyUrl ?? null,
      rateLimit: rateLimit ?? Prisma.JsonNull,
      config: {
        create: {
          chatEndpoint: "/chat/completions",
          supportsModelsApi: MODELS_API_ADAPTERS.has(name.toLowerCase()),
          healthCheckEndpoint: SKIP_HEALTH_CHECK_PROVIDERS.has(name.toLowerCase()) ? "skip" : null,
        },
      },
    },
    include: { config: true },
  });

  return NextResponse.json(provider, { status: 201 });
}
