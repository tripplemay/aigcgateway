/**
 * MCP Tool: run_template
 *
 * 运行 Template，传 template_id + variables，返回完整输出。
 * 自动判断执行模式（sequential / fan-out）。
 * AI 调用类 Tool — 写入 CallLog (source='mcp')，执行 deduct_balance。
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/api/rate-limit";
import { checkMcpPermission } from "@/lib/mcp/auth";
import { InjectionError } from "@/lib/action/runner";
import { runSequential } from "@/lib/template/sequential";
import { runFanout } from "@/lib/template/fanout";
import type { McpServerOptions } from "@/lib/mcp/server";

export function registerRunTemplate(server: McpServer, opts: McpServerOptions): void {
  const { projectId, permissions, keyRateLimit } = opts;

  server.tool(
    "run_template",
    `Run a Template workflow. Automatically detects execution mode:
- Single/Sequential: steps run in order, each receiving {{previous_output}} from the prior step.
- Fan-out: SPLITTER outputs JSON array → BRANCH runs in parallel → optional MERGE combines results.
Pass variables to inject into each step's Action prompts.`,
    {
      template_id: z.string().describe("Template ID to run"),
      variables: z
        .record(z.string())
        .optional()
        .describe("Variables to inject into the template steps"),
    },
    async ({ template_id, variables = {} }) => {
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

      // Determine execution mode
      const template = await prisma.template.findFirst({
        where: { id: template_id, projectId },
        include: { steps: { orderBy: { order: "asc" } } },
      });
      if (!template) {
        return {
          content: [{ type: "text" as const, text: `Template "${template_id}" not found.` }],
          isError: true,
        };
      }

      const hasSplitter = template.steps.some((s) => s.role === "SPLITTER");

      try {
        const collected: string[] = [];
        const collectWriter = (data: string) => {
          collected.push(data);
        };

        const params = {
          templateId: template_id,
          projectId,
          variables,
          source: "mcp",
        };

        const result = hasSplitter
          ? await runFanout(params, collectWriter)
          : await runSequential(params, collectWriter);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  output: result.output,
                  totalSteps: result.totalSteps,
                  executionMode: hasSplitter ? "fan-out" : "sequential",
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
            content: [{ type: "text" as const, text: `Template error: ${err.message}` }],
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
