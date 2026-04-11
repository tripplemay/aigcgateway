export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-guard";
import { errorResponse } from "@/lib/api/errors";

interface OpenRouterModel {
  id: string;
  pricing: { prompt: string; completion: string } | null;
}

/**
 * GET /api/admin/openrouter-prices
 * 批量返回 OpenRouter 模型价格（CNY/1M tokens），供别名页标题栏显示市场售价。
 * 返回格式: { prices: { [openRouterModelId]: { inputPer1M, outputPer1M } }, rate }
 */
export async function GET(request: Request) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  const rateConfig = await prisma.systemConfig.findUnique({
    where: { key: "USD_TO_CNY_RATE" },
  });
  const rate = rateConfig ? parseFloat(rateConfig.value) : 7.3;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const res = await fetch("https://openrouter.ai/api/v1/models", {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return errorResponse(502, "provider_error", `OpenRouter returned ${res.status}`);
    }

    const json = await res.json();
    const allModels = (json.data ?? []) as OpenRouterModel[];

    const prices: Record<string, { inputPer1M: number; outputPer1M: number }> = {};
    for (const m of allModels) {
      if (m.pricing) {
        const inputUsd = parseFloat(m.pricing.prompt) * 1_000_000;
        const outputUsd = parseFloat(m.pricing.completion) * 1_000_000;
        prices[m.id] = {
          inputPer1M: Math.round(inputUsd * rate * 100) / 100,
          outputPer1M: Math.round(outputUsd * rate * 100) / 100,
        };
      }
    }

    return NextResponse.json({ prices, rate });
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      return errorResponse(504, "timeout", "OpenRouter request timed out");
    }
    return errorResponse(502, "provider_error", (err as Error).message);
  }
}
