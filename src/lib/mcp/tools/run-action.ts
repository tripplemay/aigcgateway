/**
 * MCP Tool: run_action
 *
 * 运行单个 Action，传 action_id + variables，返回完整文本输出。
 * AI 调用类 Tool — 写入 CallLog (source='mcp')，执行 deduct_balance。
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, checkTokenLimit, checkSpendingRate } from "@/lib/api/rate-limit";
import { checkMcpPermission } from "@/lib/mcp/auth";
import { runActionNonStream, InjectionError } from "@/lib/action/runner";
import { injectVariables } from "@/lib/action/inject";
import type { McpServerOptions } from "@/lib/mcp/server";

export function registerRunAction(server: McpServer, opts: McpServerOptions): void {
  const { userId, projectId, apiKeyId, permissions, keyRateLimit } = opts;

  server.tool(
    "run_action",
    "Run a single Action by its ID. Pass variables to inject into the Action's prompt template. Returns the complete text output, trace ID, and token usage (prompt_tokens, output_tokens, total_tokens, thinking_tokens for reasoning models).",
    {
      action_id: z.string().describe("Action ID to run"),
      variables: z
        .record(z.string())
        .optional()
        .describe('Variables to inject, e.g. {"topic": "AI"}'),
      version_id: z
        .string()
        .optional()
        .describe(
          "Run a specific version instead of the active version. Must belong to the target action.",
        ),
      dry_run: z
        .boolean()
        .optional()
        .describe(
          "Preview mode: render variables into messages without calling the model. No cost, no billing.",
        ),
    },
    async ({ action_id, variables = {}, version_id, dry_run }) => {
      // Permission check
      const permErr = checkMcpPermission(permissions, "chatCompletion");
      if (permErr) {
        return { content: [{ type: "text" as const, text: permErr }], isError: true };
      }

      if (!projectId) {
        return {
          content: [
            {
              type: "text" as const,
              text: `[no_project] No project found. Use create_project to create one.`,
            },
          ],
          isError: true,
        };
      }

      // Dry run: render variables without calling model
      if (dry_run) {
        try {
          const action = await prisma.action.findFirst({
            where: { id: action_id, projectId },
          });
          if (!action) {
            return {
              content: [
                { type: "text" as const, text: `Action "${action_id}" not found in this project.` },
              ],
              isError: true,
            };
          }
          const targetVersionId = version_id ?? action.activeVersionId;
          if (!targetVersionId) {
            return {
              content: [{ type: "text" as const, text: `Action has no active version.` }],
              isError: true,
            };
          }
          const version = await prisma.actionVersion.findFirst({
            where: { id: targetVersionId, actionId: action_id },
          });
          if (!version) {
            return {
              content: [{ type: "text" as const, text: "Active version not found." }],
              isError: true,
            };
          }
          const messages = version.messages as { role: string; content: string }[];
          const variableDefs = (version.variables ?? []) as {
            name: string;
            description?: string;
            required: boolean;
            defaultValue?: string;
          }[];
          const rendered = injectVariables(messages, variableDefs, variables);
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  { dry_run: true, action_id, model: action.model, rendered_messages: rendered },
                  null,
                  2,
                ),
              },
            ],
          };
        } catch (err) {
          return {
            content: [{ type: "text" as const, text: `[dry_run_error] ${(err as Error).message}` }],
            isError: true,
          };
        }
      }

      // Balance check
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user || Number(user.balance) <= 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Insufficient balance. Current: $${Number(user?.balance ?? 0).toFixed(4)}`,
            },
          ],
          isError: true,
        };
      }

      // Rate limit (三维度 + TPM + 消费速率)
      const project = await prisma.project.findUnique({ where: { id: projectId } });
      const projectForLimits = project ?? { id: projectId, rateLimit: null };
      const rateCheck = await checkRateLimit(projectForLimits, "text", keyRateLimit, {
        apiKeyId: apiKeyId ?? null,
        userId,
      });
      if (!rateCheck.ok) {
        return {
          content: [{ type: "text" as const, text: "Rate limit exceeded. Retry after 60s." }],
          isError: true,
        };
      }
      const tpmCheck = await checkTokenLimit(projectForLimits);
      if (!tpmCheck.ok) {
        return {
          content: [
            {
              type: "text" as const,
              text: "[token_rate_limit_exceeded] Token rate limit exceeded. Retry after 60s.",
            },
          ],
          isError: true,
        };
      }
      const userRateLimit = (user.rateLimit as { spendPerMin?: number } | null) ?? null;
      const spendCheck = await checkSpendingRate(userId, userRateLimit?.spendPerMin ?? null);
      if (!spendCheck.ok) {
        return {
          content: [
            {
              type: "text" as const,
              text: "[spend_rate_exceeded] Spending rate limit exceeded. Retry after 60s.",
            },
          ],
          isError: true,
        };
      }

      try {
        const result = await runActionNonStream({
          actionId: action_id,
          projectId,
          userId,
          variables,
          versionId: version_id,
          source: "mcp",
        });

        // F-AF2-06: align usage format with run_template (snake_case + thinking_tokens)
        const rawUsage = result.usage;
        let usagePayload: Record<string, number> | null = null;
        if (rawUsage) {
          const promptTokens = rawUsage.prompt_tokens ?? 0;
          const completionTokens = rawUsage.completion_tokens ?? 0;
          const reasoningTokens = rawUsage.reasoning_tokens;
          const outputTokens =
            reasoningTokens !== undefined
              ? Math.max(0, completionTokens - reasoningTokens)
              : completionTokens;
          const totalTokens =
            rawUsage.total_tokens ?? promptTokens + completionTokens + (reasoningTokens ?? 0);
          usagePayload = {
            prompt_tokens: promptTokens,
            output_tokens: outputTokens,
            total_tokens: totalTokens,
          };
          if (reasoningTokens !== undefined) usagePayload.thinking_tokens = reasoningTokens;
        }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  output: result.output,
                  traceId: result.traceId,
                  usage: usagePayload,
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
            content: [{ type: "text" as const, text: `[action_error] ${err.message}` }],
            isError: true,
          };
        }
        const code = (err as { code?: string }).code ?? "provider_error";
        return {
          content: [{ type: "text" as const, text: `[${code}] ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );
}
