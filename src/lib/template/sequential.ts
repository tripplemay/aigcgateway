/**
 * TemplateRunner Sequential：串行多步执行
 *
 * 步骤按 order 顺序执行，每步的完整输出自动作为下一步的 {{previous_output}} 注入
 */

import { prisma } from "@/lib/prisma";
import { runAction, InjectionError } from "@/lib/action/runner";
import type { SSEWriter } from "@/lib/action/runner";

export interface SequentialRunParams {
  templateId: string;
  projectId: string;
  userId: string;
  variables: Record<string, string>;
  /** F-WP-02: per-step overrides keyed by 0-based step index. */
  stepVariables?: Record<number, Record<string, string>>;
  source?: string;
}

export async function runSequential(
  params: SequentialRunParams,
  write: SSEWriter,
): Promise<{ output: string; totalSteps: number }> {
  const { templateId, projectId, userId, variables, stepVariables = {}, source = "api" } = params;

  const template = await prisma.template.findFirst({
    where: { id: templateId, projectId },
    include: {
      steps: {
        orderBy: { order: "asc" },
        include: { action: { select: { id: true, name: true, model: true } } },
      },
    },
  });
  if (!template) throw new InjectionError("Template not found", 404);
  if (template.steps.length === 0) throw new InjectionError("Template has no steps", 400);

  const templateRunId = templateId;
  let previousOutput: string | null = null;

  for (let stepIndex = 0; stepIndex < template.steps.length; stepIndex++) {
    const step = template.steps[stepIndex];
    // SSE: step_start
    write(
      JSON.stringify({
        type: "step_start",
        step: step.order,
        role: step.role,
        action_id: step.action.id,
        action_name: step.action.name,
        model: step.action.model,
      }),
    );

    // F-WP-02: merge global variables with the per-step override (override wins).
    const stepVars: Record<string, string> = {
      ...variables,
      ...(stepVariables[stepIndex] ?? {}),
    };
    if (previousOutput !== null) {
      stepVars.previous_output = previousOutput;
    }

    try {
      const result = await runAction(
        {
          actionId: step.actionId,
          // F-WP-03: honor per-step version lock when present.
          versionId: step.lockedVersionId ?? undefined,
          projectId,
          userId,
          variables: stepVars,
          source,
          templateRunId,
        },
        (data) => {
          // Wrap content events with step number
          const parsed = JSON.parse(data);
          if (parsed.type === "content") {
            write(JSON.stringify({ type: "content", step: step.order, delta: parsed.delta }));
          }
          // action_start/action_end are suppressed (we emit step_start/step_end)
        },
      );

      previousOutput = result.output;

      // SSE: step_end (includes output for collectors)
      write(
        JSON.stringify({
          type: "step_end",
          step: step.order,
          output: result.output,
          usage: result.usage
            ? {
                prompt_tokens: result.usage.prompt_tokens,
                completion_tokens: result.usage.completion_tokens,
                ...(result.usage.reasoning_tokens !== undefined
                  ? { reasoning_tokens: result.usage.reasoning_tokens }
                  : {}),
                total_tokens: result.usage.total_tokens,
              }
            : null,
        }),
      );
    } catch (err) {
      write(
        JSON.stringify({
          type: "error",
          step: step.order,
          message: (err as Error).message,
        }),
      );
      throw err;
    }
  }

  // SSE: done
  write(JSON.stringify({ type: "done", total_steps: template.steps.length }));

  return { output: previousOutput ?? "", totalSteps: template.steps.length };
}
