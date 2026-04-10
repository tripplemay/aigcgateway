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
import { injectVariables } from "@/lib/action/inject";
import type { McpServerOptions } from "@/lib/mcp/server";

export function registerRunAction(server: McpServer, opts: McpServerOptions): void {
  const { userId, projectId, permissions, keyRateLimit } = opts;

  server.tool(
    "run_action",
    "Run a single Action by its ID. Pass variables to inject into the Action's prompt template. Returns the complete text output, trace ID, and token usage.",
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
              text: `[no_project] No default project configured. Please set a default project in the console.`,
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

      // Rate limit
      const project = await prisma.project.findUnique({ where: { id: projectId } });
      const rateCheck = await checkRateLimit(
        project ?? { id: projectId, rateLimit: null },
        "text",
        keyRateLimit,
      );
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
          versionId: version_id,
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
