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
import { processChatResult, processEmbeddingResult } from "@/lib/api/post-process";
import { injectVariables, InjectionError } from "./inject";
import type { VarDef, Message } from "./inject";
import type { ChatCompletionRequest, Usage } from "@/lib/engine/types";
import { EngineError } from "@/lib/engine/types";

export { InjectionError };

export interface ActionRunParams {
  actionId: string;
  projectId: string;
  userId: string;
  variables: Record<string, string>;
  source?: string;
  templateRunId?: string;
  versionId?: string;
}

export interface ActionRunResult {
  /** Chat 路径 = 模型完整文本输出；Embedding 路径 = "" */
  output: string;
  traceId: string;
  usage: Usage | null;
  actionVersionId: string;
  /** BL-EMBEDDING-MVP F-EM-03: 区分 chat / embedding 输出。缺省 'TEXT' 兼容旧调用方。 */
  modality?: "TEXT" | "EMBEDDING";
  /** Embedding 路径专属：模型生成的向量。 */
  embedding?: number[];
  /** Embedding 路径专属：向量维度（embedding.length）。 */
  dimensions?: number;
}

export type SSEWriter = (data: string) => void;

/**
 * Run an Action with streaming SSE output
 */
export async function runAction(
  params: ActionRunParams,
  write: SSEWriter,
): Promise<ActionRunResult> {
  const {
    actionId,
    projectId,
    userId,
    variables,
    source = "api",
    templateRunId,
    versionId,
  } = params;

  // 1. Load Action + version (specific or active)
  const action = await prisma.action.findFirst({
    where: { id: actionId, projectId },
  });
  if (!action) throw new InjectionError("Action not found", 404);

  const targetVersionId = versionId ?? action.activeVersionId;
  if (!targetVersionId) throw new InjectionError("Action has no active version", 400);

  const version = await prisma.actionVersion.findFirst({
    where: { id: targetVersionId, actionId },
  });
  if (!version) throw new InjectionError("Version not found", 404);

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
      modality: action.modality,
    }),
  );

  // BL-EMBEDDING-MVP F-EM-03: embedding 分支 — 不走 stream，调 adapter.embeddings
  // 拼接 messages 内容为单一 input string；写 SSE embedding 事件 + processEmbeddingResult
  if (action.modality === "EMBEDDING") {
    if (!adapter.embeddings) {
      const msg = `Provider does not support embeddings for model "${action.model}"`;
      write(JSON.stringify({ type: "error", message: msg }));
      throw new InjectionError(msg, 502);
    }
    const inputText = (injectedMessages as Message[]).map((m) => m.content).join("\n");
    try {
      const result = await adapter.embeddings({ model: action.model, input: inputText }, route);
      const embedding = result.data?.[0]?.embedding ?? [];
      const dimensions = embedding.length;
      const usage: Usage = {
        prompt_tokens: result.usage.prompt_tokens,
        completion_tokens: 0,
        total_tokens: result.usage.total_tokens,
      };

      write(
        JSON.stringify({
          type: "embedding",
          embedding,
          dimensions,
          usage: {
            prompt_tokens: usage.prompt_tokens,
            total_tokens: usage.total_tokens,
          },
        }),
      );

      write(
        JSON.stringify({
          type: "action_end",
          modality: "EMBEDDING",
          dimensions,
          usage: {
            prompt_tokens: usage.prompt_tokens,
            total_tokens: usage.total_tokens,
          },
        }),
      );

      processEmbeddingResult({
        traceId,
        userId,
        projectId,
        route,
        modelName: action.model,
        promptSnapshot: injectedMessages,
        requestParams: { variables, modality: "EMBEDDING" },
        startTime,
        response: result,
        source,
        actionId,
        actionVersionId: version.id,
        templateRunId,
      });

      return {
        output: "",
        traceId,
        usage,
        actionVersionId: version.id,
        modality: "EMBEDDING",
        embedding,
        dimensions,
      };
    } catch (err) {
      processEmbeddingResult({
        traceId,
        userId,
        projectId,
        route,
        modelName: action.model,
        promptSnapshot: injectedMessages,
        requestParams: { variables, modality: "EMBEDDING" },
        startTime,
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

  // 5. Stream response (chat path)
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
      userId,
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
      modality: "TEXT",
    };
  } catch (err) {
    processChatResult({
      traceId,
      userId,
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
  const {
    actionId,
    projectId,
    userId,
    variables,
    source = "api",
    templateRunId,
    versionId,
  } = params;

  const action = await prisma.action.findFirst({
    where: { id: actionId, projectId },
  });
  if (!action) throw new InjectionError("Action not found", 404);

  const targetVersionId = versionId ?? action.activeVersionId;
  if (!targetVersionId) throw new InjectionError("Action has no active version", 400);

  const version = await prisma.actionVersion.findFirst({
    where: { id: targetVersionId, actionId },
  });
  if (!version) throw new InjectionError("Version not found", 404);

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

  // BL-EMBEDDING-MVP F-EM-03: embedding 分支（非流路径）
  if (action.modality === "EMBEDDING") {
    if (!adapter.embeddings) {
      throw new InjectionError(
        `Provider does not support embeddings for model "${action.model}"`,
        502,
      );
    }
    const inputText = (injectedMessages as Message[]).map((m) => m.content).join("\n");
    try {
      const result = await adapter.embeddings({ model: action.model, input: inputText }, route);
      const embedding = result.data?.[0]?.embedding ?? [];
      const dimensions = embedding.length;
      const usage: Usage = {
        prompt_tokens: result.usage.prompt_tokens,
        completion_tokens: 0,
        total_tokens: result.usage.total_tokens,
      };

      processEmbeddingResult({
        traceId,
        userId,
        projectId,
        route,
        modelName: action.model,
        promptSnapshot: injectedMessages,
        requestParams: { variables, modality: "EMBEDDING" },
        startTime,
        response: result,
        source,
        actionId,
        actionVersionId: version.id,
        templateRunId,
      });

      return {
        output: "",
        traceId,
        usage,
        actionVersionId: version.id,
        modality: "EMBEDDING",
        embedding,
        dimensions,
      };
    } catch (err) {
      processEmbeddingResult({
        traceId,
        userId,
        projectId,
        route,
        modelName: action.model,
        promptSnapshot: injectedMessages,
        requestParams: { variables, modality: "EMBEDDING" },
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

  // Chat path
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
      userId,
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
      modality: "TEXT",
    };
  } catch (err) {
    processChatResult({
      traceId,
      userId,
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
