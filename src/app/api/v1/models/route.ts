/**
 * GET /v1/models
 *
 * 返回所有有 ACTIVE channel 的 Model + sellPrice + capabilities
 * 支持 ?modality=text|image 筛选
 */

import { PrismaClient } from "@prisma/client";
import { NextResponse } from "next/server";

const prisma = new PrismaClient();

export async function GET(request: Request) {
  const url = new URL(request.url);
  const modalityFilter = url.searchParams.get("modality")?.toUpperCase();

  // 查所有有 ACTIVE channel 的模型
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
        select: { sellPrice: true },
      },
    },
    orderBy: { name: "asc" },
  });

  const data = models.map((model) => {
    const sellPrice = model.channels[0]?.sellPrice as Record<string, unknown> | undefined;
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
