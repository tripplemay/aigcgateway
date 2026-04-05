/**
 * MCP Tool: run_action
 *
 * 运行单个 Action，传 action_id + variables，返回完整文本输出。
 * AI 调用类 Tool — 写入 CallLog (source='mcp')，执行 deduct_balance。
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/api/rate-limit";
import { checkMcpPermission } from "@/lib/mcp/auth";
import { runActionNonStream, InjectionError } from "@/lib/action/runner";
import type { McpServerOptions } from "@/lib/mcp/server";

export function registerRunAction(server: McpServer, opts: McpServerOptions): void {
  const { projectId, permissions, keyRateLimit } = opts;

  server.tool(
    "run_action",
    "Run a single Action by its ID. Pass variables to inject into the Action's prompt template. Returns the complete text output, trace ID, and token usage.",
    {
      action_id: z.string().describe("Action ID to run"),
      variables: z.record(z.string()).optional().describe("Variables to inject, e.g. {\"topic\": \"AI\"}"),
    },
    async ({ action_id, variables = {} }) => {
      // Permission check
      const permErr = checkMcpPermission(permissions, "chatCompletion");
      if (permErr) {
        return { content: [{ type: "text" as const, text: permErr }], isError: true };
      }

      // Balance check
      const project = await prisma.project.findUnique({ where: { id: projectId } });
      if (!project || Number(project.balance) <= 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Insufficient balance. Current: $${Number(project?.balance ?? 0).toFixed(4)}`,
            },
          ],
          isError: true,
        };
      }

      // Rate limit
      const rateCheck = await checkRateLimit(project, "text", keyRateLimit);
      if (!rateCheck.ok) {
        return {
          content: [{ type: "text" as const, text: "Rate limit exceeded. Retry after 60s." }],
          isError: true,
        };
      }

      try {
        const result = await runActionNonStream({
          actionId: action_id,
          projectId,
          variables,
          source: "mcp",
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  output: result.output,
                  traceId: result.traceId,
                  usage: result.usage
                    ? {
                        promptTokens: result.usage.prompt_tokens,
                        completionTokens: result.usage.completion_tokens,
                        totalTokens: result.usage.total_tokens,
                      }
                    : null,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err) {
        if (err instanceof InjectionError) {
          return {
            content: [{ type: "text" as const, text: `Action error: ${err.message}` }],
            isError: true,
          };
        }
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );
}
