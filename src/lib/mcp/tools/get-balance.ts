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
  const { projectId, permissions } = opts;

  server.tool(
    "get_balance",
    `Check your current balance (user-level, shared across all projects) and optionally view recent transactions. Set include_transactions to true to see the last 10 charges, top-ups, and adjustments.`,
    {
      include_transactions: z
        .boolean()
        .optional()
        .describe("Include last 10 transactions, default false"),
    },
    async ({ include_transactions }) => {
      const permErr = checkMcpPermission(permissions, "projectInfo");
      if (permErr) {
        return { content: [{ type: "text" as const, text: permErr }], isError: true };
      }

      // Get user-level balance via project → user
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { userId: true, user: { select: { balance: true } } },
      });

      if (!project) {
        return {
          content: [{ type: "text" as const, text: "Project not found." }],
          isError: true,
        };
      }

      const result: Record<string, unknown> = {
        balance: `$${Number(project.user.balance).toFixed(8)}`,
      };

      if (include_transactions) {
        // Transactions still filtered by projectId for per-project detail
        const transactions = await prisma.transaction.findMany({
          where: { projectId },
          orderBy: { createdAt: "desc" },
          take: 10,
          select: {
            type: true,
            amount: true,
            balanceAfter: true,
            traceId: true,
            description: true,
            createdAt: true,
          },
        });

        result.transactions = transactions.map((t) => ({
          type: t.type.toLowerCase(),
          amount: `$${Number(t.amount).toFixed(8)}`,
          balanceAfter: `$${Number(t.balanceAfter).toFixed(8)}`,
          traceId: t.traceId ?? null,
          description: t.description,
          createdAt: t.createdAt,
        }));
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
