/**
 * MCP Tool: list_models
 *
 * 查看平台可用的 AI 模型、价格、能力。
 * 查询类 Tool —— 不写入审计日志，不扣费。
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { prisma } from "@/lib/prisma";

export function registerListModels(server: McpServer): void {
  server.tool(
    "list_models",
    `List available AI models on AIGC Gateway with pricing and capabilities. Use this to find the right model for a task, or to generate SDK code with correct model names. Filter by modality (text/image) if needed.`,
    {
      modality: z
        .enum(["text", "image"])
        .optional()
        .describe("Filter by modality: text or image. Omit to return all models."),
    },
    async ({ modality }) => {
      const modalityFilter = modality?.toUpperCase();

      const models = await prisma.model.findMany({
        where: {
          channels: { some: { status: "ACTIVE" } },
          ...(modalityFilter
            ? { modality: modalityFilter as "TEXT" | "IMAGE" }
            : {}),
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
        const sellPrice = model.channels[0]?.sellPrice as
          | Record<string, unknown>
          | undefined;

        let price = "N/A";
        if (sellPrice) {
          if (sellPrice.unit === "token") {
            price = `$${sellPrice.inputPer1M} in / $${sellPrice.outputPer1M} out per 1M tokens`;
          } else if (sellPrice.unit === "call") {
            const perCall = Number(sellPrice.perCall);
            price = perCall === 0 ? "Free" : `$${sellPrice.perCall} per image`;
          }
        }

        const capabilities =
          (model.capabilities as Record<string, unknown>) ?? {};

        return {
          name: model.name,
          displayName: model.displayName,
          modality: model.modality.toLowerCase(),
          contextWindow: model.contextWindow ?? null,
          price,
          capabilities,
        };
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(data, null, 2),
          },
        ],
      };
    },
  );
}
