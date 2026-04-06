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
import { injectVariables } from "@/lib/action/inject";
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
        interface StepDetail {
          stepIndex: number;
          actionName?: string;
          model?: string;
          input?: unknown[];
          output?: string;
          usage?: { prompt_tokens: number; completion_tokens: number } | null;
          latencyMs?: number;
        }
        const steps: StepDetail[] = [];
        let currentStep: StepDetail | null = null;
        let stepStartTime = 0;

        const collectWriter = (data: string) => {
          try {
            const evt = JSON.parse(data);
            if (evt.type === "step_start") {
              stepStartTime = Date.now();
              currentStep = {
                stepIndex: evt.step,
                actionName: evt.action_name ?? undefined,
                model: evt.model,
              };
            } else if (evt.type === "step_end" && currentStep) {
              if (evt.output && !currentStep.output) currentStep.output = evt.output;
              currentStep.usage = evt.usage ?? null;
              currentStep.latencyMs = Date.now() - stepStartTime;
              steps.push(currentStep);
              currentStep = null;
            } else if (evt.type === "content" && currentStep) {
              currentStep.output = (currentStep.output ?? "") + (evt.delta ?? "");
            }
          } catch {
            // ignore parse errors
          }
        };

        // Pre-load action versions for input rendering
        const actionIds = template.steps.map((s) => s.actionId);
        const actions = await prisma.action.findMany({
          where: { id: { in: actionIds } },
          include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
        });

        const params = {
          templateId: template_id,
          projectId,
          variables,
          source: "mcp",
        };

        const result = hasSplitter
          ? await runFanout(params, collectWriter)
          : await runSequential(params, collectWriter);

        // Populate input (rendered messages) for each step
        const actionMap = new Map(actions.map((a) => [a.id, a]));
        let prevOutput: string | null = null;
        for (let i = 0; i < steps.length; i++) {
          const templateStep = template.steps[i];
          if (templateStep) {
            const act = actionMap.get(templateStep.actionId);
            const ver = act?.versions[0];
            if (ver) {
              const msgs = ver.messages as { role: string; content: string }[];
              const varDefs = (ver.variables ?? []) as {
                name: string;
                description?: string;
                required: boolean;
                defaultValue?: string;
              }[];
              const stepVars: Record<string, string> = { ...variables };
              if (prevOutput !== null) stepVars.previous_output = prevOutput;
              try {
                steps[i].input = injectVariables(msgs, varDefs, stepVars);
              } catch {
                steps[i].input = msgs;
              }
            }
          }
          prevOutput = steps[i].output ?? null;
        }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  output: result.output,
                  totalSteps: result.totalSteps,
                  executionMode: hasSplitter ? "fan-out" : "sequential",
                  steps,
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
            content: [{ type: "text" as const, text: `[template_error] ${err.message}` }],
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
