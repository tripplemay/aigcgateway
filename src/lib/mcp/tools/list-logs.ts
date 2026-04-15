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
      model: z
        .string()
        .optional()
        .describe(
          "Filter by model name (canonical alias from list_models), e.g. gpt-4o-mini, claude-sonnet-4.6, deepseek-v3",
        ),
      status: z.enum(["success", "error", "filtered"]).optional().describe("Filter by status"),
      search: z.string().optional().describe("Full-text search in prompt content"),
      // F-AF-03 (DX-005): optional ISO 8601 time bounds for log filtering.
      since: z
        .string()
        .datetime({ offset: true })
        .optional()
        .describe("Only return logs created at or after this ISO 8601 timestamp"),
      until: z
        .string()
        .datetime({ offset: true })
        .optional()
        .describe("Only return logs created strictly before this ISO 8601 timestamp"),
    },
    async ({ limit, model, status, search, since, until }) => {
      const permErr = checkMcpPermission(permissions, "logAccess");
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
      const take = limit ?? 10;

      // F-AF-03 (DX-005): parse optional time-range bounds. Zod already
      // enforced ISO 8601 shape so new Date() is safe.
      const sinceDate = since ? new Date(since) : null;
      const untilDate = until ? new Date(until) : null;

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
            responseSummary: unknown;
            createdAt: Date;
            promptSnapshot: unknown;
          }>
        >`
          SELECT "traceId", "modelName", status, "sellPrice"::float, "latencyMs", "totalTokens", "responseSummary", "createdAt", "promptSnapshot"
          FROM call_logs
          WHERE "projectId" = ${projectId}
            AND (${sinceDate}::timestamptz IS NULL OR "createdAt" >= ${sinceDate}::timestamptz)
            AND (${untilDate}::timestamptz IS NULL OR "createdAt" < ${untilDate}::timestamptz)
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

        const formatted = results.map(formatLog);
        return {
          content: [
            {
              type: "text" as const,
              text:
                formatted.length === 0
                  ? JSON.stringify(
                      {
                        message:
                          "No logs found matching your search. Try using chat or generate_image first to create some call logs.",
                        results: [],
                      },
                      null,
                      2,
                    )
                  : JSON.stringify(formatted, null, 2),
            },
          ],
        };
      }

      // Standard query
      const createdAtFilter: { gte?: Date; lt?: Date } = {};
      if (sinceDate) createdAtFilter.gte = sinceDate;
      if (untilDate) createdAtFilter.lt = untilDate;
      const where = {
        projectId,
        ...(status ? { status: status.toUpperCase() as "SUCCESS" | "ERROR" | "FILTERED" } : {}),
        ...(model ? { modelName: model } : {}),
        ...(sinceDate || untilDate ? { createdAt: createdAtFilter } : {}),
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
          responseSummary: true,
          createdAt: true,
        },
      });

      const formatted = logs.map(formatLog);
      return {
        content: [
          {
            type: "text" as const,
            text:
              formatted.length === 0
                ? JSON.stringify(
                    {
                      message:
                        "No call logs yet. Use chat or generate_image to make your first API call, then check back here.",
                      results: [],
                    },
                    null,
                    2,
                  )
                : JSON.stringify(formatted, null, 2),
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
  responseSummary?: unknown;
  createdAt: Date | string;
}) {
  const snapshot = log.promptSnapshot as Array<{ content?: string }> | null;
  const lastUserMsg = snapshot?.filter((m) => (m as { role?: string }).role === "user").pop();
  const preview =
    typeof lastUserMsg?.content === "string"
      ? lastUserMsg.content.slice(0, 100) + (lastUserMsg.content.length > 100 ? "..." : "")
      : null;

  // F-AF-02: bubble reasoning_tokens from responseSummary into a reasoningTokens
  // field, matching the usage object shape returned by get_log_detail.
  const summary = log.responseSummary as Record<string, unknown> | null;
  const reasoningRaw = summary?.reasoning_tokens;
  const reasoningTokens =
    typeof reasoningRaw === "number" && reasoningRaw > 0 ? reasoningRaw : null;

  return {
    traceId: log.traceId,
    model: log.modelName,
    status: log.status.toLowerCase(),
    promptPreview: preview,
    cost: log.sellPrice != null ? `$${Number(log.sellPrice).toFixed(8)}` : null,
    latency: log.latencyMs != null ? `${(log.latencyMs / 1000).toFixed(1)}s` : null,
    tokens: log.totalTokens ?? null,
    ...(reasoningTokens !== null ? { reasoningTokens } : {}),
    createdAt: log.createdAt,
  };
}
