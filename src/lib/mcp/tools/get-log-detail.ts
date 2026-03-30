/**
 * MCP Tool: get_log_detail
 *
 * 查看单次调用的完整详情。
 * 查询类 Tool —— 不写入审计日志，不扣费。
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { prisma } from "@/lib/prisma";

export function registerGetLogDetail(server: McpServer, projectId: string): void {
  server.tool(
    "get_log_detail",
    `Get full details of a specific AI call by trace ID. Returns the complete prompt (messages array), AI response, model parameters, token usage, cost, and latency. Useful for debugging prompt quality issues.`,
    {
      trace_id: z.string().describe("The traceId of the call to look up"),
    },
    async ({ trace_id }) => {
      const log = await prisma.callLog.findUnique({
        where: { traceId: trace_id },
        select: {
          traceId: true,
          projectId: true,
          modelName: true,
          promptSnapshot: true,
          requestParams: true,
          responseContent: true,
          finishReason: true,
          status: true,
          promptTokens: true,
          completionTokens: true,
          totalTokens: true,
          sellPrice: true,
          latencyMs: true,
          ttftMs: true,
          tokensPerSecond: true,
          errorMessage: true,
          source: true,
          createdAt: true,
        },
      });

      if (!log) {
        return {
          content: [{ type: "text" as const, text: `Call log with traceId "${trace_id}" not found.` }],
          isError: true,
        };
      }

      // Cross-project access check
      if (log.projectId !== projectId) {
        return {
          content: [{ type: "text" as const, text: `Access denied: this call log belongs to a different project.` }],
          isError: true,
        };
      }

      const result = {
        traceId: log.traceId,
        model: log.modelName,
        status: log.status.toLowerCase(),
        source: log.source,
        prompt: log.promptSnapshot,
        parameters: log.requestParams,
        response: log.responseContent,
        finishReason: log.finishReason,
        usage: {
          promptTokens: log.promptTokens,
          completionTokens: log.completionTokens,
          totalTokens: log.totalTokens,
        },
        cost: log.sellPrice != null ? `$${Number(log.sellPrice).toFixed(4)}` : null,
        latency: log.latencyMs != null ? `${(log.latencyMs / 1000).toFixed(1)}s` : null,
        ttft: log.ttftMs != null ? `${(log.ttftMs / 1000).toFixed(2)}s` : null,
        tokensPerSecond: log.tokensPerSecond ? Math.round(log.tokensPerSecond) : null,
        error: log.errorMessage,
        createdAt: log.createdAt,
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
