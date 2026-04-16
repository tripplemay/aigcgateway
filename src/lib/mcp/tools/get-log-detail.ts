/**
 * MCP Tool: get_log_detail
 *
 * 查看单次调用的完整详情。
 * 查询类 Tool —— 不写入审计日志，不扣费。
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { prisma } from "@/lib/prisma";
import { checkMcpPermission } from "@/lib/mcp/auth";
import type { McpServerOptions } from "@/lib/mcp/server";
// F-AF2-05: escapeJsonStrings removed — API responses must return raw strings
import { sanitizeErrorMessage } from "@/lib/engine/types";

export function registerGetLogDetail(server: McpServer, opts: McpServerOptions): void {
  const { projectId, permissions } = opts;

  server.tool(
    "get_log_detail",
    `Get full details of a specific AI call by trace ID. Returns the complete prompt (messages array), AI response, model parameters, token usage, cost, and latency. Useful for debugging prompt quality issues.`,
    {
      trace_id: z.string().describe("The traceId of the call to look up"),
    },
    async ({ trace_id }) => {
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
          responseSummary: true,
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
        // F-ACF-12: unified wording so IDOR probes get the same message as genuine misses.
        return {
          content: [
            {
              type: "text" as const,
              text: `Call log with traceId "${trace_id}" not found in this project.`,
            },
          ],
          isError: true,
        };
      }

      // F-ACF-12: do not reveal cross-project existence. Collapse to the
      // same "not found in this project" message so IDOR scans see nothing
      // distinct from genuine misses.
      if (log.projectId !== projectId) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Call log with traceId "${trace_id}" not found in this project.`,
            },
          ],
          isError: true,
        };
      }

      // F-DP-10: 非 stream 调用不返回 ttftMs/ttft（避免 null 歧义）
      const params = log.requestParams as Record<string, unknown> | null;
      const isStreamCall = params?.stream === true;

      // F-AF-02 + F-AF2-04: only expose reasoning_tokens for reasoning models.
      // Look up model capabilities to suppress historical data pollution.
      const summary = log.responseSummary as Record<string, unknown> | null;
      const alias = await prisma.modelAlias.findFirst({
        where: { alias: log.modelName },
        select: { capabilities: true },
      });
      const logModelCaps = (alias?.capabilities ?? null) as {
        reasoning?: boolean;
      } | null;
      const reasoningTokensRaw =
        logModelCaps?.reasoning === true ? summary?.reasoning_tokens : undefined;
      const reasoningTokens =
        typeof reasoningTokensRaw === "number" && reasoningTokensRaw > 0
          ? reasoningTokensRaw
          : null;

      const result = {
        traceId: log.traceId,
        model: log.modelName,
        status: log.status.toLowerCase(),
        source: log.source,
        // F-AF2-05: return raw strings in API/MCP responses — HTML entity
        // encoding (&#x27; etc.) is a rendering concern handled by the frontend
        // (React auto-escapes). Applying it here corrupts programmatic output.
        prompt: log.promptSnapshot,
        parameters: log.requestParams,
        response: log.responseContent,
        finishReason: log.finishReason,
        usage: {
          promptTokens: log.promptTokens,
          completionTokens: log.completionTokens,
          totalTokens: log.totalTokens,
          ...(reasoningTokens !== null ? { reasoningTokens } : {}),
        },
        cost: log.sellPrice != null ? `$${Number(log.sellPrice).toFixed(8)}` : null,
        latency: log.latencyMs != null ? `${(log.latencyMs / 1000).toFixed(1)}s` : null,
        ...(isStreamCall
          ? {
              ttftMs: log.ttftMs,
              ttft: log.ttftMs != null ? `${(log.ttftMs / 1000).toFixed(2)}s` : null,
            }
          : {}),
        tokensPerSecond: log.tokensPerSecond ? Math.round(log.tokensPerSecond) : null,
        // F-AF-01: defense-in-depth — sanitize on read so any historical row
        // that was stored before the write-side sanitization still redacts
        // API key leakage and other sensitive upstream content.
        error: log.errorMessage ? sanitizeErrorMessage(log.errorMessage) : null,
        createdAt: log.createdAt,
      };

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
