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
  content: z.string().refine((s) => s.trim().length > 0, { message: "Message content must not be empty or whitespace-only" }),
});

export function registerChat(server: McpServer, opts: McpServerOptions): void {
  const { projectId, permissions, keyRateLimit } = opts;
  server.tool(
    "chat",
    `Send a chat completion request to an AI model via AIGC Gateway. Pass model name and messages array. Returns generated text, trace ID, and token usage. IMPORTANT: Call list_models first to get available model names.`,
    {
      model: z.string().describe("Exact model name from list_models output"),
      messages: z.array(messageSchema).describe("Message array [{role, content}]."),
      temperature: z.number().min(0).max(2).optional().describe("Sampling temperature, 0-2"),
      max_tokens: z.number().int().positive().optional().describe("Maximum output tokens"),
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
      stream,
      response_format,
      top_p,
      frequency_penalty,
      tools,
      tool_choice,
    }) => {
      // Permission check
      const permErr = checkMcpPermission(permissions, "chatCompletion");
      if (permErr) {
        return { content: [{ type: "text" as const, text: permErr }], isError: true };
      }

      // Check balance
      const project = await prisma.project.findUnique({ where: { id: projectId } });
      if (!project || Number(project.balance) <= 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `[insufficient_balance] Insufficient balance. Current balance: $${Number(project?.balance ?? 0).toFixed(4)}. Please recharge at the console.`,
            },
          ],
          isError: true,
        };
      }

      // Rate limit
      const rateCheck = await checkRateLimit(project, "text", keyRateLimit);
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
          const available = await prisma.model.findMany({
            where: { enabled: true, channels: { some: { status: "ACTIVE" } }, modality: "TEXT" },
            select: { name: true },
            orderBy: { name: "asc" },
            take: 10,
          });
          const names = available.map((m) => m.name).join(", ");
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

      const traceId = generateTraceId();
      const startTime = Date.now();

      const request: ChatCompletionRequest = {
        model,
        messages: messages,
        ...(temperature !== undefined ? { temperature } : {}),
        ...(max_tokens !== undefined ? { max_tokens } : {}),
        ...(response_format ? { response_format } : {}),
        ...(top_p !== undefined ? { top_p } : {}),
        ...(frequency_penalty !== undefined ? { frequency_penalty } : {}),
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

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = value as {
              choices?: { delta?: { content?: string }; finish_reason?: string }[];
              usage?: import("@/lib/engine/types").Usage;
            };
            if (!ttftTime && chunk.choices?.[0]?.delta?.content) ttftTime = Date.now();
            const delta = chunk.choices?.[0]?.delta?.content;
            if (delta) fullContent += delta;
            if (chunk.usage) lastUsage = chunk.usage;
            if (chunk.choices?.[0]?.finish_reason)
              lastFinishReason = chunk.choices[0].finish_reason;
          }

          const ttftMs = ttftTime ? ttftTime - startTime : null;
          processChatResult({
            traceId,
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
                        }
                      : null,
                    finishReason: lastFinishReason,
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
