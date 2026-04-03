/**
 * MCP Tool: list_logs
 *
 * 查看最近的 AI 调用记录。
 * 查询类 Tool —— 不写入审计日志，不扣费。
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { prisma } from "@/lib/prisma";
import { checkMcpPermission } from "@/lib/mcp/auth";
import type { McpServerOptions } from "@/lib/mcp/server";

export function registerListLogs(server: McpServer, opts: McpServerOptions): void {
  const { projectId, permissions } = opts;

  server.tool(
    "list_logs",
    `List recent AI call logs for your project. Shows trace ID, model, status, prompt preview, cost, and latency. Use 'search' to find calls by prompt content. Use get_log_detail with a trace ID for the full prompt and response.`,
    {
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe("Number of logs to return, default 10, max 50"),
      model: z.string().optional().describe("Filter by model name, e.g. openai/gpt-4o"),
      status: z.enum(["success", "error", "filtered"]).optional().describe("Filter by status"),
      search: z.string().optional().describe("Full-text search in prompt content"),
    },
    async ({ limit, model, status, search }) => {
      const permErr = checkMcpPermission(permissions, "logAccess");
      if (permErr) {
        return { content: [{ type: "text" as const, text: permErr }], isError: true };
      }
      const take = limit ?? 10;

      // Full-text search path — extract text from JSONB promptSnapshot before matching
      if (search) {
        const likePattern = `%${search}%`;
        const results = await prisma.$queryRaw<
          Array<{
            traceId: string;
            modelName: string;
            status: string;
            sellPrice: number | null;
            latencyMs: number | null;
            totalTokens: number | null;
            createdAt: Date;
            promptSnapshot: unknown;
          }>
        >`
          SELECT "traceId", "modelName", status, "sellPrice"::float, "latencyMs", "totalTokens", "createdAt", "promptSnapshot"
          FROM call_logs
          WHERE "projectId" = ${projectId}
            AND (
              -- Extract text content from JSONB array elements for reliable matching
              EXISTS (
                SELECT 1 FROM jsonb_array_elements("promptSnapshot"::jsonb) AS msg
                WHERE msg->>'content' ILIKE ${likePattern}
              )
              OR "responseContent" ILIKE ${likePattern}
              OR "modelName" ILIKE ${likePattern}
            )
          ORDER BY "createdAt" DESC LIMIT ${take}
        `;

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(results.map(formatLog), null, 2),
            },
          ],
        };
      }

      // Standard query
      const where = {
        projectId,
        ...(status ? { status: status.toUpperCase() as "SUCCESS" | "ERROR" | "FILTERED" } : {}),
        ...(model ? { modelName: model } : {}),
      };

      const logs = await prisma.callLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take,
        select: {
          traceId: true,
          modelName: true,
          status: true,
          promptSnapshot: true,
          sellPrice: true,
          latencyMs: true,
          totalTokens: true,
          createdAt: true,
        },
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(logs.map(formatLog), null, 2),
          },
        ],
      };
    },
  );
}

function formatLog(log: {
  traceId: string;
  modelName: string;
  status: string;
  promptSnapshot: unknown;
  sellPrice: unknown;
  latencyMs: number | null;
  totalTokens?: number | null;
  createdAt: Date | string;
}) {
  const snapshot = log.promptSnapshot as Array<{ content?: string }> | null;
  const lastUserMsg = snapshot?.filter((m) => (m as { role?: string }).role === "user").pop();
  const preview =
    typeof lastUserMsg?.content === "string"
      ? lastUserMsg.content.slice(0, 100) + (lastUserMsg.content.length > 100 ? "..." : "")
      : null;

  return {
    traceId: log.traceId,
    model: log.modelName,
    status: log.status.toLowerCase(),
    promptPreview: preview,
    cost: log.sellPrice != null ? `$${Number(log.sellPrice).toFixed(4)}` : null,
    latency: log.latencyMs != null ? `${(log.latencyMs / 1000).toFixed(1)}s` : null,
    tokens: log.totalTokens ?? null,
    createdAt: log.createdAt,
  };
}
