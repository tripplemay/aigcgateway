/**
 * TemplateTestRunner — 模板测试执行器（复用于 POST API + MCP test_mode）
 *
 * 两种模式：
 *   - dry_run：渲染变量后返回完整 prompt，不调模型，免费
 *   - execute：真实调用每步，收集 input/output/tokens/cost/latency，写 TemplateTestRun
 *
 * 鉴权：template.project.userId 必须 === 调用方 userId
 *   （forked 公共模板被复制到 user 项目，同一逻辑覆盖）
 */

import { prisma } from "@/lib/prisma";
import { runActionNonStream } from "@/lib/action/runner";
import { injectVariables, InjectionError } from "@/lib/action/inject";
import type { Message, VarDef } from "@/lib/action/inject";

export type TestMode = "dry_run" | "execute";
export type TestStatus = "success" | "error" | "partial";

export interface TemplateTestStep {
  order: number;
  actionId: string;
  actionName: string;
  model: string;
  input: Message[];
  output: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  cost: string | null;
  latencyMs: number | null;
  status: "success" | "error" | "skipped";
  error?: string;
}

export interface TemplateTestRunResult {
  runId: string;
  mode: TestMode;
  status: TestStatus;
  steps: TemplateTestStep[];
  totalTokens: number;
  totalCost: string;
  totalLatency: number;
}

export class TemplateTestError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
  ) {
    super(message);
    this.name = "TemplateTestError";
  }
}

const MAX_RUNS_PER_USER_TEMPLATE = 20;
const CALL_LOG_POLL_INTERVAL_MS = 100;
const CALL_LOG_POLL_MAX_ATTEMPTS = 30;

export interface RunTemplateTestParams {
  templateId: string;
  userId: string;
  variables: Record<string, string>;
  mode: TestMode;
}

export async function runTemplateTest(
  params: RunTemplateTestParams,
): Promise<TemplateTestRunResult> {
  const { templateId, userId, variables, mode } = params;

  const template = await prisma.template.findUnique({
    where: { id: templateId },
    include: {
      project: { select: { id: true, userId: true } },
      steps: {
        orderBy: { order: "asc" },
        include: {
          action: { select: { id: true, name: true, model: true, activeVersionId: true } },
        },
      },
    },
  });
  if (!template) {
    throw new TemplateTestError("Template not found", 404, "not_found");
  }
  if (template.project.userId !== userId) {
    if (template.isPublic) {
      throw new TemplateTestError(
        "Please fork this public template before testing it.",
        403,
        "fork_required",
      );
    }
    throw new TemplateTestError(
      "You do not have permission to test this template.",
      403,
      "forbidden",
    );
  }
  if (template.steps.length === 0) {
    throw new TemplateTestError("Template has no steps.", 400, "empty_template");
  }

  const versionIds = template.steps
    .map((step) => step.lockedVersionId ?? step.action.activeVersionId)
    .filter((id): id is string => typeof id === "string");
  const versions = versionIds.length
    ? await prisma.actionVersion.findMany({ where: { id: { in: versionIds } } })
    : [];
  const versionMap = new Map(versions.map((v) => [v.id, v]));

  const steps: TemplateTestStep[] = [];
  let previousOutput: string | null = null;
  let totalTokens = 0;
  let totalCostUsd = 0;
  let totalLatency = 0;
  let runStatus: TestStatus = "success";

  for (let i = 0; i < template.steps.length; i++) {
    const step = template.steps[i];
    const versionId = step.lockedVersionId ?? step.action.activeVersionId;
    const version = versionId ? versionMap.get(versionId) : undefined;
    if (!version) {
      steps.push({
        order: step.order,
        actionId: step.action.id,
        actionName: step.action.name,
        model: step.action.model,
        input: [],
        output: null,
        promptTokens: null,
        completionTokens: null,
        totalTokens: null,
        cost: null,
        latencyMs: null,
        status: "error",
        error: "Action has no active version",
      });
      runStatus = i === 0 ? "error" : "partial";
      break;
    }

    const stepVars: Record<string, string> = { ...variables };
    if (previousOutput !== null) {
      stepVars.previous_output = previousOutput;
    }

    const rawMessages = version.messages as unknown as Message[];
    const rawVarDefs = (version.variables ?? []) as unknown as VarDef[];

    let injected: Message[];
    try {
      injected = injectVariables(rawMessages, rawVarDefs, stepVars);
    } catch (err) {
      steps.push({
        order: step.order,
        actionId: step.action.id,
        actionName: step.action.name,
        model: step.action.model,
        input: rawMessages,
        output: null,
        promptTokens: null,
        completionTokens: null,
        totalTokens: null,
        cost: null,
        latencyMs: null,
        status: "error",
        error: err instanceof InjectionError ? err.message : (err as Error).message,
      });
      runStatus = i === 0 ? "error" : "partial";
      break;
    }

    if (mode === "dry_run") {
      steps.push({
        order: step.order,
        actionId: step.action.id,
        actionName: step.action.name,
        model: step.action.model,
        input: injected,
        output: null,
        promptTokens: null,
        completionTokens: null,
        totalTokens: null,
        cost: null,
        latencyMs: null,
        status: "success",
      });
      previousOutput = injected.map((m) => `[${m.role}] ${m.content}`).join("\n");
      continue;
    }

    const startedAt = Date.now();
    let actionResult;
    try {
      actionResult = await runActionNonStream({
        actionId: step.action.id,
        projectId: template.project.id,
        userId,
        variables: stepVars,
        versionId: versionId ?? undefined,
        source: "api",
        templateRunId: templateId,
      });
    } catch (err) {
      const elapsed = Date.now() - startedAt;
      totalLatency += elapsed;
      const errAny = err as { message?: string };
      steps.push({
        order: step.order,
        actionId: step.action.id,
        actionName: step.action.name,
        model: step.action.model,
        input: injected,
        output: null,
        promptTokens: null,
        completionTokens: null,
        totalTokens: null,
        cost: null,
        latencyMs: elapsed,
        status: "error",
        error: errAny?.message ?? String(err),
      });
      runStatus = i === 0 ? "error" : "partial";
      break;
    }

    const elapsed = Date.now() - startedAt;
    totalLatency += elapsed;

    const callLog = await waitForCallLog(actionResult.traceId);
    const promptTokens = callLog?.promptTokens ?? actionResult.usage?.prompt_tokens ?? null;
    const completionTokens =
      callLog?.completionTokens ?? actionResult.usage?.completion_tokens ?? null;
    const stepTotal = callLog?.totalTokens ?? actionResult.usage?.total_tokens ?? null;
    const sellPrice = callLog?.sellPrice ? callLog.sellPrice.toString() : "0";
    if (stepTotal) totalTokens += stepTotal;
    if (callLog?.sellPrice) {
      totalCostUsd += Number(callLog.sellPrice);
    }

    steps.push({
      order: step.order,
      actionId: step.action.id,
      actionName: step.action.name,
      model: step.action.model,
      input: injected,
      output: actionResult.output,
      promptTokens,
      completionTokens,
      totalTokens: stepTotal,
      cost: sellPrice,
      latencyMs: callLog?.latencyMs ?? elapsed,
      status: "success",
    });

    previousOutput = actionResult.output;
  }

  const totalCost = totalCostUsd.toFixed(8);

  const run = await prisma.templateTestRun.create({
    data: {
      templateId,
      userId,
      variables: variables as unknown as object,
      mode,
      status: runStatus,
      steps: steps as unknown as object,
      totalTokens: mode === "execute" ? totalTokens : null,
      totalCost: mode === "execute" ? totalCost : null,
      totalLatency: mode === "execute" ? totalLatency : null,
    },
    select: { id: true },
  });

  await pruneOldRuns(userId, templateId);

  return {
    runId: run.id,
    mode,
    status: runStatus,
    steps,
    totalTokens,
    totalCost,
    totalLatency,
  };
}

async function waitForCallLog(traceId: string) {
  for (let attempt = 0; attempt < CALL_LOG_POLL_MAX_ATTEMPTS; attempt++) {
    const log = await prisma.callLog.findUnique({
      where: { traceId },
      select: {
        promptTokens: true,
        completionTokens: true,
        totalTokens: true,
        sellPrice: true,
        latencyMs: true,
      },
    });
    if (log) return log;
    await new Promise((resolve) => setTimeout(resolve, CALL_LOG_POLL_INTERVAL_MS));
  }
  return null;
}

async function pruneOldRuns(userId: string, templateId: string) {
  const keep = await prisma.templateTestRun.findMany({
    where: { userId, templateId },
    orderBy: { createdAt: "desc" },
    select: { id: true },
    take: MAX_RUNS_PER_USER_TEMPLATE,
  });
  if (keep.length < MAX_RUNS_PER_USER_TEMPLATE) return;
  const keepIds = keep.map((r) => r.id);
  await prisma.templateTestRun.deleteMany({
    where: { userId, templateId, id: { notIn: keepIds } },
  });
}
