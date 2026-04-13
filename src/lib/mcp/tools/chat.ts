/**
 * MCP Tool: chat
 *
 * 调用文本模型生成内容。
 * AI 调用类 Tool —— 写入 CallLog（source='mcp'），执行 deduct_balance。
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { resolveEngine } from "@/lib/engine";
import { generateTraceId } from "@/lib/api/response";
import { processChatResult } from "@/lib/api/post-process";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/api/rate-limit";
import { EngineError, sanitizeErrorMessage } from "@/lib/engine/types";
import type { ChatCompletionRequest } from "@/lib/engine/types";
import { checkMcpPermission } from "@/lib/mcp/auth";
import type { McpServerOptions } from "@/lib/mcp/server";

const messageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string(),
});

export function registerChat(server: McpServer, opts: McpServerOptions): void {
  const { userId, projectId, permissions, keyRateLimit } = opts;
  server.tool(
    "chat",
    `Send a chat completion request to an AI model via AIGC Gateway. Pass model name and messages array. Returns generated text, trace ID, and token usage. IMPORTANT: Call list_models first to get available model names.`,
    {
      model: z
        .string()
        .describe(
          "Exact model name from list_models output (e.g. gpt-4o-mini, claude-sonnet-4.6, deepseek-v3, gemini-3-flash)",
        ),
      messages: z.array(messageSchema).describe("Message array [{role, content}]."),
      temperature: z.number().min(0).max(2).optional().describe("Sampling temperature, 0-2"),
      max_tokens: z
        .number()
        .int()
        .positive()
        .optional()
        .describe(
          "Maximum completion (answer) tokens. For reasoning models, this limits the visible answer length only; reasoning/thinking tokens are controlled separately via max_reasoning_tokens.",
        ),
      max_reasoning_tokens: z
        .number()
        .int()
        .positive()
        .optional()
        .describe(
          "Maximum reasoning/thinking tokens for reasoning models (OpenAI o-series, DeepSeek R1, Zhipu GLM Thinking, Anthropic extended thinking). Ignored by non-reasoning models.",
        ),
      stream: z
        .boolean()
        .optional()
        .describe(
          "Enable streaming mode. The response is still returned as a single result, but includes ttftMs (time to first token) for performance insight.",
        ),
      response_format: z
        .object({ type: z.enum(["text", "json_object"]) })
        .optional()
        .describe("Response format. Use json_object for structured JSON output."),
      top_p: z
        .number()
        .gt(0)
        .max(1)
        .optional()
        .describe("Nucleus sampling probability, (0, 1]. Must be greater than 0."),
      frequency_penalty: z
        .number()
        .min(-2)
        .max(2)
        .optional()
        .describe("Frequency penalty, -2 to 2. Positive values reduce repetition."),
      presence_penalty: z
        .number()
        .min(-2)
        .max(2)
        .optional()
        .describe("Presence penalty, -2 to 2. Positive values encourage new topics."),
      stop: z
        .union([z.string(), z.array(z.string()).max(4)])
        .optional()
        .describe(
          "Stop sequence(s). Generation stops when encountered. String or array of up to 4 strings.",
        ),
      tools: z
        .array(
          z.object({
            type: z.literal("function"),
            function: z.object({
              name: z.string(),
              description: z.string().optional(),
              parameters: z.record(z.unknown()).optional(),
            }),
          }),
        )
        .optional()
        .describe(
          "Function calling tool definitions. Each tool has type:'function' and a function object with name, description, and JSON Schema parameters.",
        ),
      tool_choice: z
        .union([
          z.enum(["auto", "none", "required"]),
          z.object({
            type: z.literal("function"),
            function: z.object({ name: z.string() }),
          }),
        ])
        .optional()
        .describe(
          "Tool choice strategy: 'auto', 'none', 'required', or a specific function object.",
        ),
    },
    async ({
      model,
      messages,
      temperature,
      max_tokens,
      max_reasoning_tokens,
      stream,
      response_format,
      top_p,
      frequency_penalty,
      presence_penalty,
      stop,
      tools,
      tool_choice,
    }) => {
      // Permission check
      const permErr = checkMcpPermission(permissions, "chatCompletion");
      if (permErr) {
        return { content: [{ type: "text" as const, text: permErr }], isError: true };
      }

      // Check balance
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user || Number(user.balance) <= 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `[insufficient_balance] Insufficient balance. Current balance: $${Number(user?.balance ?? 0).toFixed(4)}. Please recharge at the console.`,
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

      // Rate limit
      const project = await prisma.project.findUnique({ where: { id: projectId } });
      const rateCheck = await checkRateLimit(
        project ?? { id: projectId, rateLimit: null },
        "text",
        keyRateLimit,
      );
      if (!rateCheck.ok) {
        return {
          content: [
            {
              type: "text" as const,
              text: `[rate_limited] Rate limit exceeded. Please retry after 60 seconds.`,
            },
          ],
          isError: true,
        };
      }

      if (!messages || messages.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `[invalid_request] messages is required and cannot be empty.`,
            },
          ],
          isError: true,
        };
      }

      // Validate no empty content
      const emptyContentIdx = messages.findIndex(
        (m) => !m.content || m.content.trim().length === 0,
      );
      if (emptyContentIdx >= 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `[invalid_request] messages[${emptyContentIdx}].content is empty. All messages must have non-empty content.`,
            },
          ],
          isError: true,
        };
      }

      // Resolve engine
      let route;
      let adapter;
      try {
        const resolved = await resolveEngine(model);
        route = resolved.route;
        adapter = resolved.adapter;
      } catch (err) {
        if (
          err instanceof EngineError &&
          (err.code === "model_not_found" || err.code === "model_not_available")
        ) {
          const available = await prisma.modelAlias.findMany({
            where: { enabled: true, modality: "TEXT" },
            select: { alias: true },
            orderBy: { alias: "asc" },
            take: 10,
          });
          const names = available.map((m) => m.alias).join(", ");
          const reason =
            err.code === "model_not_available"
              ? `Model "${model}" is not available (disabled by admin).`
              : `Model "${model}" not found.`;
          return {
            content: [
              {
                type: "text" as const,
                text: `[${err.code}] ${reason} Available text models: ${names || "none"}. Use list_models for full details.`,
              },
            ],
            isError: true,
          };
        }
        if (err instanceof EngineError && err.code === "channel_unavailable") {
          return {
            content: [
              {
                type: "text" as const,
                text: `[channel_unavailable] No available channel for model "${model}". The model may be temporarily unavailable. Try another model or retry later.`,
              },
            ],
            isError: true,
          };
        }
        const routeCode = err instanceof EngineError ? err.code : "routing_error";
        return {
          content: [{ type: "text" as const, text: `[${routeCode}] ${(err as Error).message}` }],
          isError: true,
        };
      }

      // F-DP-09: modality 校验——拒绝使用 image 模型进行 text chat
      if (route.alias?.modality === "IMAGE") {
        return {
          content: [
            {
              type: "text" as const,
              text: `[invalid_model_modality] Model "${model}" is an image generation model and cannot be used for text chat. Use the generate_image tool instead.`,
            },
          ],
          isError: true,
        };
      }

      // F-ACF-06: max_tokens must not exceed the routed model's context window.
      const modelContextWindow = route.model?.contextWindow ?? null;
      if (
        typeof max_tokens === "number" &&
        modelContextWindow !== null &&
        max_tokens > modelContextWindow
      ) {
        return {
          content: [
            {
              type: "text" as const,
              text: `[invalid_parameter] max_tokens (${max_tokens}) exceeds the context window of model "${model}" (${modelContextWindow}).`,
            },
          ],
          isError: true,
        };
      }

      // F-ACF-05: default max_reasoning_tokens cap for reasoning models.
      const mcpCapabilities = (route.model?.capabilities ?? null) as { reasoning?: boolean } | null;
      let effectiveMaxReasoningTokens = max_reasoning_tokens;
      if (
        mcpCapabilities?.reasoning === true &&
        effectiveMaxReasoningTokens === undefined &&
        modelContextWindow !== null
      ) {
        effectiveMaxReasoningTokens = Math.min(Math.floor(modelContextWindow * 0.5), 32000);
      }

      const traceId = generateTraceId();
      const startTime = Date.now();

      const request: ChatCompletionRequest = {
        model,
        messages: messages,
        ...(temperature !== undefined ? { temperature } : {}),
        ...(max_tokens !== undefined ? { max_tokens } : {}),
        ...(effectiveMaxReasoningTokens !== undefined
          ? { max_reasoning_tokens: effectiveMaxReasoningTokens }
          : {}),
        ...(response_format ? { response_format } : {}),
        ...(top_p !== undefined ? { top_p } : {}),
        ...(frequency_penalty !== undefined ? { frequency_penalty } : {}),
        ...(presence_penalty !== undefined ? { presence_penalty } : {}),
        ...(stop !== undefined ? { stop } : {}),
        ...(tools ? { tools } : {}),
        ...(tool_choice ? { tool_choice } : {}),
        stream: !!stream,
      };

      try {
        // Stream mode: consume server-side, return with ttftMs
        if (stream) {
          const streamResult = await adapter.chatCompletionsStream(request, route);
          const reader = streamResult.getReader();
          let fullContent = "";
          let lastUsage: import("@/lib/engine/types").Usage | null = null;
          let lastFinishReason: string | null = null;
          let ttftTime: number | undefined;
          // Accumulate tool_calls from stream deltas
          const toolCallsMap = new Map<
            number,
            { id: string; type: string; function: { name: string; arguments: string } }
          >();

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = value as {
              choices?: {
                delta?: {
                  content?: string;
                  tool_calls?: {
                    index: number;
                    id?: string;
                    type?: string;
                    function?: { name?: string; arguments?: string };
                  }[];
                };
                finish_reason?: string;
              }[];
              usage?: import("@/lib/engine/types").Usage;
            };
            if (!ttftTime && chunk.choices?.[0]?.delta?.content) ttftTime = Date.now();
            const delta = chunk.choices?.[0]?.delta;
            if (delta?.content) fullContent += delta.content;
            // Accumulate streamed tool_calls
            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls) {
                const existing = toolCallsMap.get(tc.index);
                if (existing) {
                  if (tc.function?.arguments) existing.function.arguments += tc.function.arguments;
                } else {
                  toolCallsMap.set(tc.index, {
                    id: tc.id ?? "",
                    type: tc.type ?? "function",
                    function: {
                      name: tc.function?.name ?? "",
                      arguments: tc.function?.arguments ?? "",
                    },
                  });
                }
              }
            }
            if (chunk.usage) lastUsage = chunk.usage;
            if (chunk.choices?.[0]?.finish_reason)
              lastFinishReason = chunk.choices[0].finish_reason;
          }
          const streamToolCalls =
            toolCallsMap.size > 0
              ? Array.from(toolCallsMap.entries())
                  .sort(([a], [b]) => a - b)
                  .map(([, v]) => v)
              : undefined;

          const ttftMs = ttftTime ? ttftTime - startTime : null;
          processChatResult({
            traceId,
            userId,
            projectId,
            route,
            modelName: model,
            promptSnapshot: messages,
            requestParams: { temperature, max_tokens, stream: true },
            startTime,
            ttftTime,
            streamChunks: {
              content: fullContent,
              usage: lastUsage,
              finishReason: lastFinishReason,
            },
            source: "mcp",
          });

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    content: fullContent,
                    traceId,
                    model,
                    ttftMs,
                    usage: lastUsage
                      ? {
                          promptTokens: lastUsage.prompt_tokens,
                          completionTokens: lastUsage.completion_tokens,
                          totalTokens: lastUsage.total_tokens,
                          ...(lastUsage.reasoning_tokens !== undefined
                            ? { reasoningTokens: lastUsage.reasoning_tokens }
                            : {}),
                        }
                      : null,
                    finishReason: lastFinishReason,
                    ...(streamToolCalls ? { tool_calls: streamToolCalls } : {}),
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        // Non-stream mode (default)
        const response = await adapter.chatCompletions(request, route);

        // Post-process: write CallLog (source='mcp') + deduct balance
        processChatResult({
          traceId,
          userId,
          projectId,
          route,
          modelName: model,
          promptSnapshot: messages,
          requestParams: { temperature, max_tokens },
          startTime,
          response,
          source: "mcp",
        });

        const choice = response.choices?.[0];
        const content = choice?.message?.content ?? "";
        const toolCalls = choice?.message?.tool_calls ?? undefined;
        const usage = response.usage;

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  content,
                  traceId,
                  model,
                  usage: usage
                    ? {
                        promptTokens: usage.prompt_tokens,
                        completionTokens: usage.completion_tokens,
                        totalTokens: usage.total_tokens,
                        ...(usage.reasoning_tokens !== undefined
                          ? { reasoningTokens: usage.reasoning_tokens }
                          : {}),
                      }
                    : null,
                  finishReason: choice?.finish_reason ?? null,
                  ...(toolCalls ? { tool_calls: toolCalls } : {}),
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err) {
        processChatResult({
          traceId,
          userId,
          projectId,
          route,
          modelName: model,
          promptSnapshot: messages,
          requestParams: { temperature, max_tokens },
          startTime,
          error: { message: (err as Error).message, code: (err as EngineError)?.code },
          source: "mcp",
        });

        const engineErr = err instanceof EngineError ? err : null;
        const latencyMs = Date.now() - startTime;

        if (engineErr?.code === "provider_timeout") {
          return {
            content: [
              {
                type: "text" as const,
                text: `[provider_timeout] Provider timeout after ${(latencyMs / 1000).toFixed(1)}s. Try again or use a different model.`,
              },
            ],
            isError: true,
          };
        }

        const errorCode = engineErr?.code ?? "provider_error";
        return {
          content: [
            {
              type: "text" as const,
              text: `[${errorCode}] ${sanitizeErrorMessage((err as Error).message)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
