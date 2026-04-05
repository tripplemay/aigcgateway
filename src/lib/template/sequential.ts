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
  variables: Record<string, string>;
  source?: string;
}

export async function runSequential(
  params: SequentialRunParams,
  write: SSEWriter,
): Promise<{ output: string; totalSteps: number }> {
  const { templateId, projectId, variables, source = "api" } = params;

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

  for (const step of template.steps) {
    // SSE: step_start
    write(
      JSON.stringify({
        type: "step_start",
        step: step.order,
        role: step.role,
        action_id: step.action.id,
        model: step.action.model,
      }),
    );

    // Build variables with previous_output injection
    const stepVars: Record<string, string> = { ...variables };
    if (previousOutput !== null) {
      stepVars.previous_output = previousOutput;
    }

    try {
      const result = await runAction(
        {
          actionId: step.actionId,
          projectId,
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

      // SSE: step_end
      write(
        JSON.stringify({
          type: "step_end",
          step: step.order,
          usage: result.usage
            ? {
                prompt_tokens: result.usage.prompt_tokens,
                completion_tokens: result.usage.completion_tokens,
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
