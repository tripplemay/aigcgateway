export const dynamic = "force-dynamic";
/**
 * GET /v1/models
 *
 * 返回所有有 ACTIVE channel 的 Model + sellPrice + capabilities
 * 支持 ?modality=text|image 筛选
 */

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";


export async function GET(request: Request) {
  const url = new URL(request.url);
  const modalityFilter = url.searchParams.get("modality")?.toUpperCase();

  // 查所有有 ACTIVE channel 的模型，include provider for displayName
  const models = await prisma.model.findMany({
    where: {
      channels: { some: { status: "ACTIVE" } },
      ...(modalityFilter ? { modality: modalityFilter as "TEXT" | "IMAGE" | "VIDEO" | "AUDIO" } : {}),
    },
    include: {
      channels: {
        where: { status: "ACTIVE" },
        orderBy: { priority: "asc" },
        take: 1,
        select: {
          sellPrice: true,
          provider: { select: { displayName: true } },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  const data = models.map((model) => {
    const channel = model.channels[0];
    const sellPrice = channel?.sellPrice as Record<string, unknown> | undefined;
    const providerName = channel?.provider?.displayName ?? null;
    const capabilities = (model.capabilities as Record<string, unknown>) ?? {};

    const pricing: Record<string, unknown> = {};
    if (sellPrice) {
      if (sellPrice.unit === "token") {
        pricing.input_per_1m = sellPrice.inputPer1M;
        pricing.output_per_1m = sellPrice.outputPer1M;
        pricing.unit = "token";
        pricing.currency = "USD";
      } else if (sellPrice.unit === "call") {
        pricing.per_call = sellPrice.perCall;
        pricing.unit = "call";
        pricing.currency = "USD";
      }
    }

    return {
      id: model.name,
      object: "model" as const,
      display_name: model.displayName,
      modality: model.modality.toLowerCase(),
      ...(providerName ? { provider_name: providerName } : {}),
      ...(model.contextWindow ? { context_window: model.contextWindow } : {}),
      ...(model.maxTokens ? { max_output_tokens: model.maxTokens } : {}),
      pricing,
      capabilities,
      ...(model.description ? { description: model.description } : {}),
    };
  });

  return NextResponse.json({
    object: "list",
    data,
  });
}
