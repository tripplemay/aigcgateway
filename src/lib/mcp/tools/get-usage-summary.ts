/**
 * MCP Tool: get_usage_summary
 *
 * 查看用量和费用汇总。
 * 查询类 Tool —— 不写入审计日志，不扣费。
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { prisma } from "@/lib/prisma";

export function registerGetUsageSummary(server: McpServer, projectId: string): void {
  server.tool(
    "get_usage_summary",
    `Get usage summary for your project over a time period. Returns total calls, cost, tokens, average latency, and top models by usage. Default period is last 7 days. Use 'today', '7d', or '30d'.`,
    {
      period: z.enum(["today", "7d", "30d"]).optional().describe("Time period: today, 7d (default), or 30d"),
    },
    async ({ period }) => {
      const p = period ?? "7d";
      const days = p === "today" ? 1 : p === "30d" ? 30 : 7;
      const since = new Date(Date.now() - days * 86400000);

      const [agg, topModels] = await Promise.all([
        prisma.callLog.aggregate({
          where: { projectId, createdAt: { gte: since } },
          _count: true,
          _sum: { totalTokens: true, sellPrice: true },
          _avg: { latencyMs: true },
        }),
        prisma.callLog.groupBy({
          by: ["modelName"],
          where: { projectId, createdAt: { gte: since } },
          _count: true,
          _sum: { sellPrice: true },
          orderBy: { _count: { modelName: "desc" } },
          take: 5,
        }),
      ]);

      const result = {
        period: p,
        totalCalls: agg._count,
        totalCost: `$${Number(agg._sum.sellPrice ?? 0).toFixed(4)}`,
        totalTokens: agg._sum.totalTokens ?? 0,
        avgLatency: agg._avg.latencyMs != null ? `${(agg._avg.latencyMs / 1000).toFixed(1)}s` : null,
        topModels: topModels.map((m) => ({
          model: m.modelName,
          calls: m._count,
          cost: `$${Number(m._sum.sellPrice ?? 0).toFixed(4)}`,
        })),
      };

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify(result, null, 2),
        }],
      };
    },
  );
}
