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
import { checkRateLimit, checkTokenLimit, checkSpendingRate } from "@/lib/api/rate-limit";
import { checkMcpPermission } from "@/lib/mcp/auth";
import { InjectionError } from "@/lib/action/runner";
import { injectVariables } from "@/lib/action/inject";
import { runSequential } from "@/lib/template/sequential";
import { runFanout } from "@/lib/template/fanout";
import { runTemplateTest, TemplateTestError } from "@/lib/template/test-runner";
import type { McpServerOptions } from "@/lib/mcp/server";

export function registerRunTemplate(server: McpServer, opts: McpServerOptions): void {
  const { userId, projectId, apiKeyId, permissions, keyRateLimit } = opts;

  server.tool(
    "run_template",
    `Run a Template workflow. Automatically detects execution mode:
- Single/Sequential: steps run in order, each receiving {{previous_output}} from the prior step.
- Fan-out: SPLITTER outputs JSON array → BRANCH runs in parallel → optional MERGE combines results.
Pass variables to inject into each step's Action prompts.

Two formats are supported:
  - Flat \`{var: value}\` — applies globally to every step (backward compatible).
  - Per-step override \`{__global: {...}, __step_0: {...}, __step_1: {...}}\` —
    step-level overrides win over the global block for the corresponding step
    (0-based index). Unknown \`__step_N\` keys are ignored.`,
    {
      template_id: z.string().describe("Template ID to run"),
      variables: z
        .record(z.any())
        .optional()
        .describe(
          "Variables to inject. Accepts flat {var:value} or {__global:{...}, __step_0:{...}, __step_1:{...}}.",
        ),
      test_mode: z
        .enum(["dry_run", "execute"])
        .optional()
        .describe(
          "Optional test harness mode: 'dry_run' renders variables without calling models (free). 'execute' runs each step and records the run under template_test_runs (latest 20 per user+template). Omit for normal execution (no test record).",
        ),
    },
    async ({ template_id, variables = {}, test_mode }) => {
      // Permission check
      const permErr = checkMcpPermission(permissions, "chatCompletion");
      if (permErr) {
        return { content: [{ type: "text" as const, text: permErr }], isError: true };
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

      // BL-SEC-POLISH H-46: lift RPM rate limit above the test_mode branch so
      // every path (test_mode=dry_run / test_mode=execute / normal run) shares
      // the same quota. test_mode retains its "no billing" property because
      // runTemplateTest internals still skip deduct_balance; only the gate
      // position changes. TPM / spending-rate checks stay below for execute,
      // where they're meaningful (no token usage during test_mode).
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

      // F-TT-04: test harness branch — routes through the same runner as the
      // console /templates/[id]/test page so API + MCP share behavior.
      if (test_mode) {
        const flatVars: Record<string, string> = {};
        for (const [k, v] of Object.entries(variables as Record<string, unknown>)) {
          if (typeof v === "string") flatVars[k] = v;
        }
        try {
          const result = await runTemplateTest({
            templateId: template_id,
            userId,
            variables: flatVars,
            mode: test_mode,
          });
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        } catch (err) {
          if (err instanceof TemplateTestError) {
            return {
              content: [{ type: "text" as const, text: `[${err.code}] ${err.message}` }],
              isError: true,
            };
          }
          const code = (err as { code?: string }).code ?? "template_test_error";
          return {
            content: [{ type: "text" as const, text: `[${code}] ${(err as Error).message}` }],
            isError: true,
          };
        }
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
        // Collect per-step details from SSE events
        // F-WP-01: capture reasoning_tokens + total_tokens so the response
        // can surface thinking vs. output cost separately.
        interface RawUsage {
          prompt_tokens: number;
          completion_tokens: number;
          reasoning_tokens?: number;
          total_tokens?: number;
        }
        interface StepEvent {
          actionName?: string;
          model?: string;
          output: string;
          usage: RawUsage | null;
          latencyMs: number;
        }
        const stepEvents: StepEvent[] = [];
        let curOutput = "";
        let curUsage: RawUsage | null = null;
        let curActionName: string | undefined;
        let curModel: string | undefined;
        let stepStart = 0;

        const collectWriter = (data: string) => {
          try {
            const evt = JSON.parse(data);
            if (evt.type === "step_start") {
              curOutput = "";
              curUsage = null;
              curActionName = evt.action_name;
              curModel = evt.model;
              stepStart = Date.now();
            } else if (evt.type === "content") {
              if (evt.delta) curOutput += evt.delta;
            } else if (evt.type === "step_end") {
              // step_end.output is authoritative (from runner result)
              const finalOutput = evt.output !== undefined ? String(evt.output) : curOutput;
              stepEvents.push({
                actionName: curActionName,
                model: curModel,
                output: finalOutput,
                usage: evt.usage ?? curUsage,
                latencyMs: Date.now() - stepStart,
              });
            }
          } catch {
            // ignore
          }
        };

        // F-WP-02: normalise the variables argument into { global, stepVariables }.
        const normalized = normalizeTemplateVariables(variables);
        const params = {
          templateId: template_id,
          projectId,
          userId,
          variables: normalized.global,
          stepVariables: normalized.stepVariables,
          source: "mcp",
        };

        const result = hasSplitter
          ? await runFanout(params, collectWriter)
          : await runSequential(params, collectWriter);

        // Build steps with input (rendered messages).
        // F-ACF-04: read each action's ACTIVE version, not the latest. The
        // runner already executes the active version; the MCP response must
        // agree so users see the prompt they actually ran.
        const actionIds = template.steps.map((s) => s.actionId);
        const actions = await prisma.action.findMany({
          where: { id: { in: actionIds } },
          select: { id: true, name: true, model: true, activeVersionId: true },
        });
        const actionMap = new Map(actions.map((a) => [a.id, a]));

        const activeVersionIds = actions
          .map((a) => a.activeVersionId)
          .filter((v): v is string => typeof v === "string");
        const activeVersions = activeVersionIds.length
          ? await prisma.actionVersion.findMany({
              where: { id: { in: activeVersionIds } },
            })
          : [];
        const versionMap = new Map(activeVersions.map((v) => [v.id, v]));

        let prevOutput: string | null = null;
        const steps = template.steps.map((ts, i) => {
          const se = stepEvents[i];
          const act = actionMap.get(ts.actionId);
          const ver = act?.activeVersionId ? versionMap.get(act.activeVersionId) : undefined;
          let input: unknown[] | undefined;
          if (ver) {
            const msgs = ver.messages as { role: string; content: string }[];
            const varDefs = (ver.variables ?? []) as {
              name: string;
              description?: string;
              required: boolean;
              defaultValue?: string;
            }[];
            const stepVars: Record<string, string> = {
              ...normalized.global,
              ...(normalized.stepVariables[i] ?? {}),
            };
            if (prevOutput !== null) stepVars.previous_output = prevOutput;
            try {
              input = injectVariables(msgs, varDefs, stepVars);
            } catch {
              input = msgs;
            }
          }
          const stepOutput = se?.output ?? "";
          prevOutput = stepOutput;
          // F-WP-01: split usage into prompt / thinking / output / total.
          const rawUsage = se?.usage ?? null;
          const promptTokens = rawUsage?.prompt_tokens ?? 0;
          const completionTokens = rawUsage?.completion_tokens ?? 0;
          const reasoningTokens = rawUsage?.reasoning_tokens;
          const outputTokens =
            reasoningTokens !== undefined
              ? Math.max(0, completionTokens - reasoningTokens)
              : completionTokens;
          const totalTokens =
            rawUsage?.total_tokens ?? promptTokens + completionTokens + (reasoningTokens ?? 0);
          const usagePayload: Record<string, number> = {
            prompt_tokens: promptTokens,
            output_tokens: outputTokens,
            total_tokens: totalTokens,
          };
          if (reasoningTokens !== undefined) usagePayload.thinking_tokens = reasoningTokens;
          return {
            stepIndex: i,
            actionName: se?.actionName ?? act?.name ?? null,
            model: se?.model ?? act?.model ?? null,
            input,
            output: stepOutput,
            usage: usagePayload,
            latencyMs: se?.latencyMs ?? null,
          };
        });

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

// F-WP-02: variables input may be a flat map (legacy) or a keyed object with
// __global / __step_N entries. Returns { global, stepVariables } always.
export function normalizeTemplateVariables(input: Record<string, unknown> | undefined): {
  global: Record<string, string>;
  stepVariables: Record<number, Record<string, string>>;
} {
  const global: Record<string, string> = {};
  const stepVariables: Record<number, Record<string, string>> = {};
  if (!input || typeof input !== "object") return { global, stepVariables };

  const looksKeyed = Object.keys(input).some((k) => k === "__global" || /^__step_\d+$/.test(k));

  if (!looksKeyed) {
    for (const [k, v] of Object.entries(input)) {
      if (typeof v === "string") global[k] = v;
    }
    return { global, stepVariables };
  }

  for (const [key, raw] of Object.entries(input)) {
    if (raw === null || typeof raw !== "object") continue;
    const bag: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v === "string") bag[k] = v;
    }
    if (key === "__global") {
      Object.assign(global, bag);
    } else {
      const m = /^__step_(\d+)$/.exec(key);
      if (m) stepVariables[Number(m[1])] = bag;
    }
  }
  return { global, stepVariables };
}
