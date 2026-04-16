/**
 * MCP Tool: get_balance
 *
 * 查看用户余额和最近交易。
 * 查询类 Tool —— 不写入审计日志，不扣费。
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { prisma } from "@/lib/prisma";
import { checkMcpPermission } from "@/lib/mcp/auth";
import type { McpServerOptions } from "@/lib/mcp/server";

export function registerGetBalance(server: McpServer, opts: McpServerOptions): void {
  const { userId, projectId, permissions } = opts;

  server.tool(
    "get_balance",
    `Check your current balance (user-level, shared across all projects) and optionally view recent transactions. Set include_transactions to true to see charges, top-ups, and adjustments. Supports pagination via limit/offset.`,
    {
      include_transactions: z.boolean().optional().describe("Include transactions, default false"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe(
          "Number of transactions to return (default 10, max 100). Only used when include_transactions=true.",
        ),
      offset: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Offset for pagination (default 0). Only used when include_transactions=true."),
    },
    async ({ include_transactions, limit, offset }) => {
      const permErr = checkMcpPermission(permissions, "projectInfo");
      if (permErr) {
        return { content: [{ type: "text" as const, text: permErr }], isError: true };
      }

      // Get user-level balance
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { balance: true },
      });

      if (!user) {
        return {
          content: [{ type: "text" as const, text: "User not found." }],
          isError: true,
        };
      }

      const result: Record<string, unknown> = {
        balance: `$${Number(user.balance).toFixed(8)}`,
      };

      if (include_transactions) {
        const take = limit ?? 10;
        const skip = offset ?? 0;
        const transactions = await prisma.transaction.findMany({
          where: { userId },
          orderBy: { createdAt: "desc" },
          take: take + 1, // fetch one extra to determine hasMore
          skip,
          select: {
            type: true,
            amount: true,
            balanceAfter: true,
            traceId: true,
            batchId: true,
            description: true,
            createdAt: true,
          },
        });

        // F-AP-01: pagination — trim extra record and set hasMore
        const hasMore = transactions.length > take;
        if (hasMore) transactions.pop();

        // F-WP-08: inline model + source by joining CallLog on traceId.
        const traceIds = transactions
          .map((t) => t.traceId)
          .filter((id): id is string => typeof id === "string" && id.length > 0);
        const logs = traceIds.length
          ? await prisma.callLog.findMany({
              where: { traceId: { in: traceIds } },
              select: { traceId: true, modelName: true, source: true },
            })
          : [];
        const logMap = new Map(logs.map((l) => [l.traceId, l]));

        result.transactions = transactions.map((t) => {
          const log = t.traceId ? logMap.get(t.traceId) : undefined;
          return {
            type: t.type.toLowerCase(),
            amount: `$${Number(t.amount).toFixed(8)}`,
            balanceAfter: `$${Number(t.balanceAfter).toFixed(8)}`,
            traceId: t.traceId ?? null,
            description: t.description,
            createdAt: t.createdAt,
            // F-AF2-09: expose model/source/batchId for DEDUCTION and REFUND
            ...((t.type === "DEDUCTION" || t.type === "REFUND") && log
              ? { model: log.modelName, source: log.source }
              : {}),
            ...(t.batchId ? { batchId: t.batchId } : {}),
          };
        });
        result.hasMore = hasMore;
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    },
  );
}
