/**
 * MCP Tool: get_usage_summary
 *
 * 查看用量和费用汇总，支持筛选和分组。
 * 查询类 Tool —— 不写入审计日志，不扣费。
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { prisma } from "@/lib/prisma";
import { checkMcpPermission } from "@/lib/mcp/auth";
import type { McpServerOptions } from "@/lib/mcp/server";

export function registerGetUsageSummary(server: McpServer, opts: McpServerOptions): void {
  const { projectId, permissions } = opts;

  server.tool(
    "get_usage_summary",
    `Get usage summary for your project. Supports filtering by model, source, action_id, template_id. Supports grouping by model, day, source, action, or template. Default period is 7d.`,
    {
      period: z
        .enum(["today", "7d", "30d"])
        .optional()
        .describe("Time period: today, 7d (default), or 30d"),
      model: z.string().optional().describe("Filter by model name"),
      source: z.enum(["api", "mcp"]).optional().describe("Filter by call source"),
      action_id: z.string().optional().describe("Filter by Action ID"),
      template_id: z.string().optional().describe("Filter by Template run ID"),
      group_by: z
        .enum(["model", "day", "source", "action", "template"])
        .optional()
        .describe("Group results by dimension. Default: no grouping (aggregate only)"),
    },
    async ({ period, model, source, action_id, template_id, group_by }) => {
      const permErr = checkMcpPermission(permissions, "projectInfo");
      if (permErr) {
        return { content: [{ type: "text" as const, text: permErr }], isError: true };
      }

      const p = period ?? "7d";
      const days = p === "today" ? 1 : p === "30d" ? 30 : 7;
      const since = new Date(Date.now() - days * 86400000);

      // Build where clause
      const where: Record<string, unknown> = {
        projectId,
        createdAt: { gte: since },
      };
      if (model) where.modelName = model;
      if (source) where.source = source;
      if (action_id) where.actionId = action_id;
      if (template_id) where.templateRunId = template_id;

      // Grouped query
      if (group_by) {
        const groups = await buildGroupedQuery(where, group_by);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ period: p, group_by, groups }, null, 2),
            },
          ],
        };
      }

      // Aggregate query (default)
      const [agg, topModels] = await Promise.all([
        prisma.callLog.aggregate({
          where,
          _count: true,
          _sum: { totalTokens: true, sellPrice: true },
          _avg: { latencyMs: true },
        }),
        prisma.callLog.groupBy({
          by: ["modelName"],
          where,
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
        avgLatency:
          agg._avg.latencyMs != null ? `${(agg._avg.latencyMs / 1000).toFixed(1)}s` : null,
        topModels: topModels.map((m) => ({
          model: m.modelName,
          calls: m._count,
          cost: `$${Number(m._sum.sellPrice ?? 0).toFixed(4)}`,
        })),
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}

async function buildGroupedQuery(
  where: Record<string, unknown>,
  groupBy: string,
): Promise<{ key: string; totalCalls: number; totalCost: string; totalTokens: number }[]> {
  if (groupBy === "model") {
    const groups = await prisma.callLog.groupBy({
      by: ["modelName"],
      where,
      _count: true,
      _sum: { totalTokens: true, sellPrice: true },
      orderBy: { _count: { modelName: "desc" } },
    });
    return groups.map((g) => ({
      key: g.modelName,
      totalCalls: g._count,
      totalCost: `$${Number(g._sum.sellPrice ?? 0).toFixed(4)}`,
      totalTokens: g._sum.totalTokens ?? 0,
    }));
  }

  if (groupBy === "source") {
    const groups = await prisma.callLog.groupBy({
      by: ["source"],
      where,
      _count: true,
      _sum: { totalTokens: true, sellPrice: true },
      orderBy: { _count: { source: "desc" } },
    });
    return groups.map((g) => ({
      key: g.source,
      totalCalls: g._count,
      totalCost: `$${Number(g._sum.sellPrice ?? 0).toFixed(4)}`,
      totalTokens: g._sum.totalTokens ?? 0,
    }));
  }

  if (groupBy === "action") {
    const groups = await prisma.callLog.groupBy({
      by: ["actionId"],
      where: { ...where, actionId: { not: null } },
      _count: true,
      _sum: { totalTokens: true, sellPrice: true },
      orderBy: { _count: { actionId: "desc" } },
    });
    // Fetch action names
    const actionIds = groups.map((g) => g.actionId!).filter(Boolean);
    const actions = await prisma.action.findMany({
      where: { id: { in: actionIds } },
      select: { id: true, name: true },
    });
    const nameMap = new Map(actions.map((a) => [a.id, a.name]));
    return groups.map((g) => ({
      key: `${g.actionId} (${nameMap.get(g.actionId!) ?? "unknown"})`,
      totalCalls: g._count,
      totalCost: `$${Number(g._sum.sellPrice ?? 0).toFixed(4)}`,
      totalTokens: g._sum.totalTokens ?? 0,
    }));
  }

  if (groupBy === "template") {
    const groups = await prisma.callLog.groupBy({
      by: ["templateRunId"],
      where: { ...where, templateRunId: { not: null } },
      _count: true,
      _sum: { totalTokens: true, sellPrice: true },
      orderBy: { _count: { templateRunId: "desc" } },
    });
    // templateRunId now stores the Template ID — look up names
    const templateIds = groups.map((g) => g.templateRunId!).filter(Boolean);
    const templates = await prisma.template.findMany({
      where: { id: { in: templateIds } },
      select: { id: true, name: true },
    });
    const nameMap = new Map(templates.map((t) => [t.id, t.name]));
    return groups.map((g) => ({
      key: `${g.templateRunId} (${nameMap.get(g.templateRunId!) ?? "unknown"})`,
      totalCalls: g._count,
      totalCost: `$${Number(g._sum.sellPrice ?? 0).toFixed(4)}`,
      totalTokens: g._sum.totalTokens ?? 0,
    }));
  }

  // day grouping — use raw SQL
  const dayGroups = await prisma.$queryRaw<
    { day: string; count: bigint; tokens: bigint; cost: number }[]
  >`
    SELECT DATE(\"createdAt\") as day,
           COUNT(*) as count,
           COALESCE(SUM("totalTokens"), 0) as tokens,
           COALESCE(SUM("sellPrice"::numeric), 0) as cost
    FROM "call_logs"
    WHERE "projectId" = ${where.projectId as string}
      AND "createdAt" >= ${(where.createdAt as { gte: Date }).gte}
    GROUP BY DATE("createdAt")
    ORDER BY day DESC
  `;

  return dayGroups.map((g) => ({
    key: String(g.day),
    totalCalls: Number(g.count),
    totalCost: `$${Number(g.cost).toFixed(4)}`,
    totalTokens: Number(g.tokens),
  }));
}
