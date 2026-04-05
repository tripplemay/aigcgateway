/**
 * ActionRunner：单个 Action 执行引擎
 *
 * 1. 加载 activeVersion → messages + variables
 * 2. 校验必填变量
 * 3. {{variable}} 替换
 * 4. 调用 engine.chatCompletions
 * 5. SSE 输出 action_start / content delta / action_end
 * 6. 写 CallLog + 扣费
 * 7. 返回完整 output 字符串
 */

import { prisma } from "@/lib/prisma";
import { resolveEngine } from "@/lib/engine";
import { generateTraceId } from "@/lib/api/response";
import { processChatResult } from "@/lib/api/post-process";
import { injectVariables, InjectionError } from "./inject";
import type { VarDef, Message } from "./inject";
import type { ChatCompletionRequest, Usage } from "@/lib/engine/types";
import { EngineError } from "@/lib/engine/types";

export { InjectionError };

export interface ActionRunParams {
  actionId: string;
  projectId: string;
  variables: Record<string, string>;
  source?: string;
  templateRunId?: string;
}

export interface ActionRunResult {
  output: string;
  traceId: string;
  usage: Usage | null;
  actionVersionId: string;
}

export type SSEWriter = (data: string) => void;

/**
 * Run an Action with streaming SSE output
 */
export async function runAction(
  params: ActionRunParams,
  write: SSEWriter,
): Promise<ActionRunResult> {
  const { actionId, projectId, variables, source = "api", templateRunId } = params;

  // 1. Load Action + activeVersion
  const action = await prisma.action.findFirst({
    where: { id: actionId, projectId },
  });
  if (!action) throw new InjectionError("Action not found", 404);
  if (!action.activeVersionId) throw new InjectionError("Action has no active version", 400);

  const version = await prisma.actionVersion.findUnique({
    where: { id: action.activeVersionId },
  });
  if (!version) throw new InjectionError("Active version not found", 404);

  // 2. Inject variables
  const messages = version.messages as unknown as Message[];
  const variableDefs = version.variables as unknown as VarDef[];
  const injectedMessages = injectVariables(messages, variableDefs, variables);

  // 3. Resolve engine
  let route;
  let adapter;
  try {
    const resolved = await resolveEngine(action.model);
    route = resolved.route;
    adapter = resolved.adapter;
  } catch (err) {
    if (err instanceof EngineError) {
      throw new InjectionError(`Engine error: ${err.message}`, err.statusCode);
    }
    throw err;
  }

  const traceId = generateTraceId();
  const startTime = Date.now();

  // 4. SSE: action_start
  write(
    JSON.stringify({
      type: "action_start",
      action_id: actionId,
      model: action.model,
    }),
  );

  // 5. Stream response
  const request: ChatCompletionRequest = {
    model: action.model,
    messages: injectedMessages as ChatCompletionRequest["messages"],
    stream: true,
  };

  let fullContent = "";
  let lastUsage: Usage | null = null;
  let lastFinishReason: string | null = null;
  let ttftTime: number | undefined;

  try {
    const stream = await adapter.chatCompletionsStream(request, route);
    const reader = stream.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = value as {
        choices?: { delta?: { content?: string }; finish_reason?: string }[];
        usage?: Usage;
      };

      if (!ttftTime && chunk.choices?.[0]?.delta?.content) {
        ttftTime = Date.now();
      }

      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) {
        fullContent += delta;
        write(JSON.stringify({ type: "content", delta }));
      }

      if (chunk.usage) lastUsage = chunk.usage;
      if (chunk.choices?.[0]?.finish_reason) {
        lastFinishReason = chunk.choices[0].finish_reason;
      }
    }

    // 6. SSE: action_end
    write(
      JSON.stringify({
        type: "action_end",
        usage: lastUsage
          ? {
              prompt_tokens: lastUsage.prompt_tokens,
              completion_tokens: lastUsage.completion_tokens,
            }
          : null,
      }),
    );

    // 7. Post-process: CallLog + billing
    processChatResult({
      traceId,
      projectId,
      route,
      modelName: action.model,
      promptSnapshot: injectedMessages,
      requestParams: { variables },
      startTime,
      ttftTime,
      streamChunks: {
        content: fullContent,
        usage: lastUsage,
        finishReason: lastFinishReason,
      },
      source,
      actionId,
      actionVersionId: version.id,
      templateRunId,
    });

    return {
      output: fullContent,
      traceId,
      usage: lastUsage,
      actionVersionId: version.id,
    };
  } catch (err) {
    processChatResult({
      traceId,
      projectId,
      route,
      modelName: action.model,
      promptSnapshot: injectedMessages,
      requestParams: { variables },
      startTime,
      ttftTime,
      error: { message: (err as Error).message, code: (err as EngineError)?.code },
      source,
      actionId,
      actionVersionId: version.id,
      templateRunId,
    });

    write(JSON.stringify({ type: "error", message: (err as Error).message }));
    throw err;
  }
}

/**
 * Run an Action without streaming — returns full result
 */
export async function runActionNonStream(params: ActionRunParams): Promise<ActionRunResult> {
  const { actionId, projectId, variables, source = "api", templateRunId } = params;

  const action = await prisma.action.findFirst({
    where: { id: actionId, projectId },
  });
  if (!action) throw new InjectionError("Action not found", 404);
  if (!action.activeVersionId) throw new InjectionError("Action has no active version", 400);

  const version = await prisma.actionVersion.findUnique({
    where: { id: action.activeVersionId },
  });
  if (!version) throw new InjectionError("Active version not found", 404);

  const messages = version.messages as unknown as Message[];
  const variableDefs = version.variables as unknown as VarDef[];
  const injectedMessages = injectVariables(messages, variableDefs, variables);

  let route;
  let adapter;
  try {
    const resolved = await resolveEngine(action.model);
    route = resolved.route;
    adapter = resolved.adapter;
  } catch (err) {
    if (err instanceof EngineError) {
      throw new InjectionError(`Engine error: ${err.message}`, err.statusCode);
    }
    throw err;
  }

  const traceId = generateTraceId();
  const startTime = Date.now();

  const request: ChatCompletionRequest = {
    model: action.model,
    messages: injectedMessages as ChatCompletionRequest["messages"],
    stream: false,
  };

  try {
    const response = await adapter.chatCompletions(request, route);
    const content = response.choices?.[0]?.message?.content ?? "";

    processChatResult({
      traceId,
      projectId,
      route,
      modelName: action.model,
      promptSnapshot: injectedMessages,
      requestParams: { variables },
      startTime,
      response,
      source,
      actionId,
      actionVersionId: version.id,
      templateRunId,
    });

    return {
      output: content,
      traceId,
      usage: response.usage ?? null,
      actionVersionId: version.id,
    };
  } catch (err) {
    processChatResult({
      traceId,
      projectId,
      route,
      modelName: action.model,
      promptSnapshot: injectedMessages,
      requestParams: { variables },
      startTime,
      error: { message: (err as Error).message, code: (err as EngineError)?.code },
      source,
      actionId,
      actionVersionId: version.id,
      templateRunId,
    });
    throw err;
  }
}
