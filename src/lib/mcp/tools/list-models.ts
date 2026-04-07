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
import { resolveCapabilities, resolveSupportedSizes } from "@/lib/sync/model-capabilities-fallback";

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

      const allModels = await prisma.model.findMany({
        where: {
          enabled: true,
          channels: { some: { status: "ACTIVE" } },
          ...(modalityFilter ? { modality: modalityFilter as "TEXT" | "IMAGE" } : {}),
        },
        include: {
          channels: {
            where: { status: "ACTIVE" },
            orderBy: { priority: "asc" },
            ...(show_all_channels ? {} : { take: 1 }),
            select: {
              id: true,
              sellPrice: true,
              provider: { select: { name: true } },
              healthChecks: {
                orderBy: { createdAt: "desc" },
                take: 1,
                select: { result: true },
              },
            },
          },
        },
        orderBy: { name: "asc" },
      });

      // Filter out models whose only ACTIVE channels all have latest health check FAIL
      type ModelRow = typeof allModels[number];
      type ChannelRow = ModelRow["channels"][number];
      const models: ModelRow[] = allModels.filter((m: ModelRow) => {
        const healthy = m.channels.filter((ch: ChannelRow) => {
          const lastCheck = ch.healthChecks[0];
          return !lastCheck || lastCheck.result !== "FAIL";
        });
        return healthy.length > 0;
      });

      const data = models.map((model: ModelRow) => {
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

        // Fallback: if DB capabilities is empty, resolve from static map
        const dbCaps = model.capabilities as Record<string, unknown> | null;
        const capabilities = (dbCaps && Object.keys(dbCaps).length > 0)
          ? dbCaps
          : resolveCapabilities(model.name);

        const result: Record<string, unknown> = {
          name: model.name,
          displayName: model.displayName,
          modality: model.modality.toLowerCase(),
          contextWindow: model.modality === "IMAGE" ? null : (model.contextWindow ?? null),
          price,
          capabilities,
        };

        // Add supportedSizes for image models
        if (model.modality === "IMAGE") {
          const sizes = resolveSupportedSizes(model.name);
          if (sizes) result.supportedSizes = sizes;
        }

        if (show_all_channels) {
          result.channels = model.channels.map((ch: ModelRow["channels"][number]) => ({
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
