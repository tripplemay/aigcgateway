/**
 * MCP Tool: list_models
 *
 * 查看平台可用的 AI 模型别名、价格、能力。
 * 查询类 Tool —— 不写入审计日志，不扣费。
 * 返回别名列表，不暴露底层模型和服务商信息。
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { prisma } from "@/lib/prisma";
import { checkMcpPermission } from "@/lib/mcp/auth";
import type { McpServerOptions } from "@/lib/mcp/server";
interface ModelCapabilities {
  [key: string]: boolean | undefined;
}

export function registerListModels(server: McpServer, opts: McpServerOptions): void {
  const { permissions } = opts;

  server.tool(
    "list_models",
    `List available AI models on AIGC Gateway with pricing and capabilities. Models are shown by alias (user-friendly name). Use the alias as the model name when calling chat or generate_image.`,
    {
      modality: z
        .enum(["text", "image"])
        .optional()
        .describe("Filter by modality: text or image. Omit to return all models."),
      capability: z
        .string()
        .optional()
        .describe(
          "Filter by capability: function_calling, vision, reasoning, search, json_mode, streaming. Only models with this capability set to true are returned.",
        ),
      free_only: z
        .boolean()
        .optional()
        .describe("Set to true to only return free models (price = 0)."),
    },
    async ({ modality, capability, free_only }) => {
      const permErr = checkMcpPermission(permissions, "projectInfo");
      if (permErr) {
        return { content: [{ type: "text" as const, text: permErr }], isError: true };
      }
      const modalityFilter = modality?.toUpperCase();

      const aliases = await prisma.modelAlias.findMany({
        where: {
          enabled: true,
          ...(modalityFilter ? { modality: modalityFilter as "TEXT" | "IMAGE" } : {}),
        },
        include: {
          models: {
            include: {
              model: {
                select: {
                  supportedSizes: true,
                  channels: {
                    where: { status: "ACTIVE" },
                    orderBy: { priority: "asc" },
                    select: {
                      sellPrice: true,
                      priority: true,
                      healthChecks: {
                        orderBy: { createdAt: "desc" },
                        take: 1,
                        select: { result: true },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: { alias: "asc" },
      });

      const data = aliases
        .map((alias) => {
          // Collect all healthy channels across linked models
          const allChannels = alias.models
            .flatMap((link) => link.model.channels)
            .filter((ch) => {
              const lastCheck = ch.healthChecks[0];
              return !lastCheck || lastCheck.result !== "FAIL";
            })
            .sort((a, b) => a.priority - b.priority);

          if (allChannels.length === 0) return null;

          const bestChannel = allChannels[0];
          // Prefer alias-level sellPrice, fallback to best channel
          const aliasSellPrice = alias.sellPrice as Record<string, unknown> | null;
          const sellPrice =
            aliasSellPrice && Object.keys(aliasSellPrice).length > 0
              ? aliasSellPrice
              : (bestChannel?.sellPrice as Record<string, unknown> | undefined);

          let price = "N/A";
          const pricing: Record<string, unknown> = {};
          if (sellPrice) {
            // Infer unit for legacy data
            const unit =
              sellPrice.unit ??
              (sellPrice.inputPer1M !== undefined || sellPrice.outputPer1M !== undefined
                ? "token"
                : sellPrice.perCall !== undefined
                  ? "call"
                  : undefined);

            if (unit === "token") {
              const inputPer1M = Number(sellPrice.inputPer1M);
              const outputPer1M = Number(sellPrice.outputPer1M);
              if (inputPer1M === 0 && outputPer1M === 0) {
                price = "Free";
              } else {
                price = `$${sellPrice.inputPer1M} in / $${sellPrice.outputPer1M} out per 1M tokens`;
              }
              pricing.inputPerMillion = inputPer1M;
              pricing.outputPerMillion = outputPer1M;
              pricing.currency = "USD";
            } else if (unit === "call") {
              const perCall = Number(sellPrice.perCall);
              price = perCall === 0 ? "Free" : `$${sellPrice.perCall} per image`;
              pricing.perCall = perCall;
              pricing.currency = "USD";
            }
          }

          // Strip supported_sizes from capabilities (moved to top-level supportedSizes)
          const rawCapabilities = (alias.capabilities as ModelCapabilities | null) ?? {};
          const { supported_sizes: _stripSizes, ...capabilities } = rawCapabilities;

          const result: Record<string, unknown> = {
            name: alias.alias,
            brand: alias.brand ?? "Unknown",
            modality: alias.modality.toLowerCase(),
            contextWindow: alias.modality === "IMAGE" ? null : (alias.contextWindow ?? null),
            price,
            pricing,
            capabilities,
          };

          // Aggregate supportedSizes from linked models for IMAGE aliases
          if (alias.modality === "IMAGE") {
            const sizesSet = new Set<string>();
            for (const link of alias.models) {
              const sizes = link.model.supportedSizes;
              if (Array.isArray(sizes)) {
                for (const s of sizes) sizesSet.add(String(s));
              }
            }
            if (sizesSet.size > 0) {
              result.supportedSizes = Array.from(sizesSet).sort();
            }
          }

          if (alias.description) result.description = alias.description;

          return result;
        })
        .filter((item): item is Record<string, unknown> => {
          if (!item) return false;
          // Filter by capability
          if (capability) {
            const caps = item.capabilities as Record<string, unknown> | undefined;
            if (!caps || caps[capability] !== true) return false;
          }
          // Filter by free_only
          if (free_only) {
            const p = item.pricing as Record<string, unknown> | undefined;
            if (!p) return false;
            if (p.perCall !== undefined) {
              if (Number(p.perCall) !== 0) return false;
            } else {
              if (Number(p.inputPerMillion) !== 0 || Number(p.outputPerMillion) !== 0) return false;
            }
          }
          return true;
        });

      return {
        content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
      };
    },
  );
}
