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
      if (!projectId) {
        return {
          content: [
            {
              type: "text" as const,
              text: "[no_project] No project found. Use create_project to create one.",
            },
          ],
          isError: true,
        };
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
        const payload =
          groups.length === 0
            ? {
                period: p,
                group_by,
                groups,
                message:
                  "No usage data found for this period. Make some API calls first using chat or generate_image, then check back.",
              }
            : { period: p, group_by, groups };
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(payload, null, 2),
            },
          ],
        };
      }

      // Aggregate query (default)
      // F-RL-07: rateLimitedCount from SystemLog(RATE_LIMIT) — project-scoped.
      // F-WP-07: successCalls / errorCalls split.
      const [agg, topModels, successAgg, rateLimitedCount] = await Promise.all([
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
        prisma.callLog.count({ where: { ...where, status: "SUCCESS" } }),
        prisma.systemLog.count({
          where: {
            category: "RATE_LIMIT",
            createdAt: { gte: (where.createdAt as { gte?: Date })?.gte ?? new Date(0) },
            detail: {
              path: ["identifier"],
              equals: projectId,
            },
          },
        }),
      ]);
      const errorAgg = Math.max(0, agg._count - successAgg);

      // Check which top models are still enabled (available in list_models)
      const topModelNames = topModels.map((m) => m.modelName);
      const activeModels =
        topModelNames.length > 0
          ? await prisma.model.findMany({
              where: { name: { in: topModelNames }, enabled: true },
              select: { name: true },
            })
          : [];
      const activeSet = new Set(activeModels.map((m) => m.name));

      const result = {
        period: p,
        totalCalls: agg._count,
        successCalls: successAgg,
        errorCalls: errorAgg,
        totalCost: `$${Number(agg._sum.sellPrice ?? 0).toFixed(8)}`,
        totalTokens: agg._sum.totalTokens ?? 0,
        rateLimitedCount,
        avgLatency:
          agg._avg.latencyMs != null ? `${(agg._avg.latencyMs / 1000).toFixed(1)}s` : null,
        topModels: topModels.map((m) => ({
          model: m.modelName,
          calls: m._count,
          cost: `$${Number(m._sum.sellPrice ?? 0).toFixed(8)}`,
          ...(!activeSet.has(m.modelName) ? { deprecated: true } : {}),
        })),
        ...(agg._count === 0
          ? {
              message:
                "No usage data found for this period. Make some API calls first using chat or generate_image, then check back.",
            }
          : {}),
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
): Promise<
  {
    key: string;
    totalCalls: number;
    successCalls?: number;
    errorCalls?: number;
    totalCost: string;
    totalTokens?: number;
    totalImages?: number;
  }[]
> {
  if (groupBy === "model") {
    const groups = await prisma.callLog.groupBy({
      by: ["modelName"],
      where,
      _count: true,
      _sum: { totalTokens: true, sellPrice: true },
      orderBy: { _count: { modelName: "desc" } },
    });
    // F-WP-07: model-level success/error split.
    const successByModel = await prisma.callLog.groupBy({
      by: ["modelName"],
      where: { ...where, status: "SUCCESS" },
      _count: true,
    });
    const successMap = new Map(successByModel.map((s) => [s.modelName, s._count]));

    // F-AP-06: look up modality to suppress totalTokens for IMAGE models
    const modelNames = groups.map((g) => g.modelName);
    const aliases = modelNames.length
      ? await prisma.modelAlias.findMany({
          where: { alias: { in: modelNames } },
          select: { alias: true, modality: true },
        })
      : [];
    const modalityMap = new Map(aliases.map((a) => [a.alias, a.modality]));

    return groups.map((g) => {
      const successCalls = successMap.get(g.modelName) ?? 0;
      const isImage = modalityMap.get(g.modelName) === "IMAGE";
      return {
        key: g.modelName,
        totalCalls: g._count,
        successCalls,
        errorCalls: Math.max(0, g._count - successCalls),
        totalCost: `$${Number(g._sum.sellPrice ?? 0).toFixed(8)}`,
        // F-AP-06: IMAGE models use per-call pricing, tokens are meaningless
        ...(isImage ? { totalImages: successCalls } : { totalTokens: g._sum.totalTokens ?? 0 }),
      };
    });
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
      totalCost: `$${Number(g._sum.sellPrice ?? 0).toFixed(8)}`,
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
      totalCost: `$${Number(g._sum.sellPrice ?? 0).toFixed(8)}`,
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
      totalCost: `$${Number(g._sum.sellPrice ?? 0).toFixed(8)}`,
      totalTokens: g._sum.totalTokens ?? 0,
    }));
  }

  // day grouping — use raw SQL with ISO 8601 date format
  const dayGroups = await prisma.$queryRaw<
    { day: string; count: bigint; tokens: bigint; cost: number }[]
  >`
    SELECT to_char(DATE("createdAt"), 'YYYY-MM-DD') as day,
           COUNT(*) as count,
           COALESCE(SUM("totalTokens"), 0) as tokens,
           COALESCE(SUM("sellPrice"::numeric), 0) as cost
    FROM "call_logs"
    WHERE "projectId" = ${where.projectId as string}
      AND "createdAt" >= ${(where.createdAt as { gte: Date }).gte}
    GROUP BY DATE("createdAt")
    ORDER BY DATE("createdAt") DESC
  `;

  return dayGroups.map((g) => ({
    key: g.day,
    totalCalls: Number(g.count),
    totalCost: `$${Number(g.cost).toFixed(8)}`,
    totalTokens: Number(g.tokens),
  }));
}
