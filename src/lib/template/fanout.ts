/**
 * TemplateRunner Fan-out：SPLITTER → BRANCH × N → MERGE
 *
 * 1. SPLITTER 执行 → 输出 JSON 数组 [{content: "..."}]
 * 2. BRANCH 并行执行（每个收到 branch_input = part.content）
 * 3. MERGE 可选，收到 all_outputs = JSON.stringify(branchOutputs[])
 */

import { prisma } from "@/lib/prisma";
import { runAction, InjectionError } from "@/lib/action/runner";
import type { SSEWriter } from "@/lib/action/runner";

export interface FanoutRunParams {
  templateId: string;
  projectId: string;
  variables: Record<string, string>;
  source?: string;
}

export async function runFanout(
  params: FanoutRunParams,
  write: SSEWriter,
): Promise<{ output: string; totalSteps: number; branches: number }> {
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

  const splitterStep = template.steps.find((s) => s.role === "SPLITTER");
  const branchStep = template.steps.find((s) => s.role === "BRANCH");
  const mergeStep = template.steps.find((s) => s.role === "MERGE");

  if (!splitterStep) throw new InjectionError("Fan-out template must have a SPLITTER step", 400);
  if (!branchStep) throw new InjectionError("Fan-out template must have a BRANCH step", 400);

  const templateRunId = templateId;

  // ── Step 0: SPLITTER ──
  let splitterOutput = "";
  write(
    JSON.stringify({
      type: "step_start",
      step: splitterStep.order,
      role: "SPLITTER",
      action_id: splitterStep.action.id,
      model: splitterStep.action.model,
    }),
  );

  const splitterResult = await runAction(
    { actionId: splitterStep.actionId, projectId, variables, source, templateRunId },
    (data) => {
      const parsed = JSON.parse(data);
      if (parsed.type === "content") {
        splitterOutput += parsed.delta;
        write(JSON.stringify({ type: "content", step: splitterStep.order, delta: parsed.delta }));
      }
    },
  );
  splitterOutput = splitterResult.output;

  // Parse SPLITTER output as JSON array
  let parts: { content: string }[];
  try {
    parts = JSON.parse(splitterOutput);
    if (!Array.isArray(parts)) throw new Error("Not an array");
  } catch {
    write(
      JSON.stringify({
        type: "error",
        message: "SPLITTER output is not a valid JSON array",
      }),
    );
    throw new InjectionError("SPLITTER output is not a valid JSON array", 500);
  }

  write(
    JSON.stringify({
      type: "step_end",
      step: splitterStep.order,
      branches: parts.length,
    }),
  );

  // ── BRANCH × N (parallel) ──
  const branchOutputs: string[] = new Array(parts.length).fill("");

  await Promise.all(
    parts.map(async (part, idx) => {
      write(
        JSON.stringify({
          type: "branch_start",
          branch: idx,
          input: part.content,
        }),
      );

      const branchVars: Record<string, string> = {
        ...variables,
        branch_input: part.content,
      };

      const result = await runAction(
        { actionId: branchStep.actionId, projectId, variables: branchVars, source, templateRunId },
        (data) => {
          const parsed = JSON.parse(data);
          if (parsed.type === "content") {
            write(JSON.stringify({ type: "content", branch: idx, delta: parsed.delta }));
          }
        },
      );

      branchOutputs[idx] = result.output;
      write(JSON.stringify({ type: "branch_end", branch: idx }));
    }),
  );

  // ── MERGE (optional) ──
  let finalOutput: string;

  if (mergeStep) {
    write(
      JSON.stringify({
        type: "step_start",
        step: mergeStep.order,
        role: "MERGE",
        action_id: mergeStep.action.id,
        model: mergeStep.action.model,
      }),
    );

    const mergeVars: Record<string, string> = {
      ...variables,
      all_outputs: JSON.stringify(branchOutputs),
    };

    const mergeResult = await runAction(
      { actionId: mergeStep.actionId, projectId, variables: mergeVars, source, templateRunId },
      (data) => {
        const parsed = JSON.parse(data);
        if (parsed.type === "content") {
          write(JSON.stringify({ type: "content", step: mergeStep.order, delta: parsed.delta }));
        }
      },
    );

    finalOutput = mergeResult.output;
    write(JSON.stringify({ type: "step_end", step: mergeStep.order }));
  } else {
    finalOutput = branchOutputs.join("\n\n");
  }

  const totalSteps = template.steps.length;
  write(
    JSON.stringify({
      type: "done",
      total_steps: totalSteps,
      branches: parts.length,
    }),
  );

  return { output: finalOutput, totalSteps, branches: parts.length };
}
