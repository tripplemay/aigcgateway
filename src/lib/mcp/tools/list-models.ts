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
    },
    async ({ modality }) => {
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
          const sellPrice = bestChannel?.sellPrice as Record<string, unknown> | undefined;

          let price = "N/A";
          if (sellPrice) {
            if (sellPrice.unit === "token") {
              price = `$${sellPrice.inputPer1M} in / $${sellPrice.outputPer1M} out per 1M tokens`;
            } else if (sellPrice.unit === "call") {
              const perCall = Number(sellPrice.perCall);
              price = perCall === 0 ? "Free" : `$${sellPrice.perCall} per image`;
            }
          }

          const capabilities = (alias.capabilities as ModelCapabilities | null) ?? {};

          const result: Record<string, unknown> = {
            name: alias.alias,
            brand: alias.brand ?? "Unknown",
            modality: alias.modality.toLowerCase(),
            contextWindow: alias.modality === "IMAGE" ? null : (alias.contextWindow ?? null),
            price,
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
        .filter(Boolean);

      return {
        content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
      };
    },
  );
}
