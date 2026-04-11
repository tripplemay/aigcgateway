export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-guard";
import { errorResponse } from "@/lib/api/errors";

interface OpenRouterModel {
  id: string;
  name: string;
  pricing: { prompt: string; completion: string } | null;
}

/**
 * GET /api/admin/model-aliases/[id]/suggest-price?q=optional_search
 *
 * If alias has openRouterModelId → fetch that model's pricing directly.
 * Otherwise → search OpenRouter models by alias name, return top 5 candidates.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  const { id } = await params;
  const alias = await prisma.modelAlias.findUnique({
    where: { id },
    select: { alias: true, openRouterModelId: true },
  });
  if (!alias) return errorResponse(404, "not_found", "Alias not found");

  const url = new URL(request.url);
  const query = url.searchParams.get("q") ?? alias.alias;

  // Fetch exchange rate
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

    // If alias already has a mapping, return that model directly
    if (alias.openRouterModelId) {
      const mapped = allModels.find((m) => m.id === alias.openRouterModelId);
      if (mapped && mapped.pricing) {
        const inputUsd = parseFloat(mapped.pricing.prompt) * 1_000_000;
        const outputUsd = parseFloat(mapped.pricing.completion) * 1_000_000;
        return NextResponse.json({
          bound: true,
          openRouterModelId: alias.openRouterModelId,
          model: {
            id: mapped.id,
            name: mapped.name,
            inputPriceCNYPerM: inputUsd * rate,
            outputPriceCNYPerM: outputUsd * rate,
          },
          rate,
        });
      }
    }

    // Search candidates by query
    const lowerQuery = query.toLowerCase();
    const candidates = allModels
      .filter((m) => m.pricing && m.id.toLowerCase().includes(lowerQuery))
      .slice(0, 5)
      .map((m) => {
        const inputUsd = parseFloat(m.pricing!.prompt) * 1_000_000;
        const outputUsd = parseFloat(m.pricing!.completion) * 1_000_000;
        return {
          id: m.id,
          name: m.name,
          inputPriceCNYPerM: inputUsd * rate,
          outputPriceCNYPerM: outputUsd * rate,
        };
      });

    return NextResponse.json({
      bound: false,
      candidates,
      rate,
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      return errorResponse(504, "timeout", "OpenRouter request timed out");
    }
    return errorResponse(502, "provider_error", (err as Error).message);
  }
}
