/**
 * MCP Tool: list_models
 *
 * 查看平台可用的 AI 模型、价格、能力。
 * 查询类 Tool —— 不写入审计日志，不扣费。
 * 默认去重（每个 canonical name 只展示一条），show_all_channels=true 展示全量。
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { prisma } from "@/lib/prisma";
import { checkMcpPermission } from "@/lib/mcp/auth";
import type { McpServerOptions } from "@/lib/mcp/server";

export function registerListModels(server: McpServer, opts: McpServerOptions): void {
  const { permissions } = opts;

  server.tool(
    "list_models",
    `List available AI models on AIGC Gateway with pricing and capabilities. Each model is shown once (best channel selected automatically). Use show_all_channels=true for debugging.`,
    {
      modality: z
        .enum(["text", "image"])
        .optional()
        .describe("Filter by modality: text or image. Omit to return all models."),
      show_all_channels: z
        .boolean()
        .optional()
        .describe("Show all channels per model (for debugging). Default: false."),
    },
    async ({ modality, show_all_channels }) => {
      const permErr = checkMcpPermission(permissions, "projectInfo");
      if (permErr) {
        return { content: [{ type: "text" as const, text: permErr }], isError: true };
      }
      const modalityFilter = modality?.toUpperCase();

      const models = await prisma.model.findMany({
        where: {
          channels: { some: { status: "ACTIVE" } },
          ...(modalityFilter ? { modality: modalityFilter as "TEXT" | "IMAGE" } : {}),
        },
        include: {
          channels: {
            where: { status: "ACTIVE" },
            orderBy: { priority: "asc" },
            ...(show_all_channels ? {} : { take: 1 }),
            select: {
              sellPrice: true,
              provider: { select: { name: true } },
            },
          },
        },
        orderBy: { name: "asc" },
      });

      const data = models.map((model) => {
        const bestChannel = model.channels[0];
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

        const capabilities = (model.capabilities as Record<string, unknown>) ?? {};

        const result: Record<string, unknown> = {
          name: model.name,
          displayName: model.displayName,
          modality: model.modality.toLowerCase(),
          contextWindow: model.contextWindow ?? null,
          price,
          capabilities,
        };

        if (show_all_channels) {
          result.channels = model.channels.map((ch) => ({
            provider: ch.provider.name,
            sellPrice: ch.sellPrice,
          }));
        }

        return result;
      });

      return {
        content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
      };
    },
  );
}
