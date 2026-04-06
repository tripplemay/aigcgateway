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
  const { projectId, permissions, keyRateLimit } = opts;
  server.tool(
    "chat",
    `Send a chat completion request to an AI model via AIGC Gateway. Pass model name and messages array. Returns generated text, trace ID, and token usage.

IMPORTANT: Use list_models first to get exact model names available on this instance. Model names vary by deployment (e.g. openrouter/anthropic/claude-sonnet-4 or anthropic/claude-sonnet-4).`,
    {
      model: z
        .string()
        .describe("Exact model name from list_models output"),
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
    },
    async ({ model, messages, temperature, max_tokens, stream, response_format }) => {
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
              text: `Insufficient balance. Current balance: $${Number(project?.balance ?? 0).toFixed(4)}. Please recharge at the console.`,
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
            { type: "text" as const, text: "Rate limit exceeded. Please retry after 60 seconds." },
          ],
          isError: true,
        };
      }

      if (!messages || messages.length === 0) {
        return {
          content: [{ type: "text" as const, text: "messages is required and cannot be empty." }],
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
        if (err instanceof EngineError && err.code === "model_not_found") {
          const available = await prisma.model.findMany({
            where: { channels: { some: { status: "ACTIVE" } }, modality: "TEXT" },
            select: { name: true },
            orderBy: { name: "asc" },
            take: 10,
          });
          const names = available.map((m) => m.name).join(", ");
          return {
            content: [
              {
                type: "text" as const,
                text: `Model "${model}" not found. Available text models: ${names || "none"}. Use list_models for full details.`,
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
                text: `No available channel for model "${model}". The model may be temporarily unavailable. Try another model or retry later.`,
              },
            ],
            isError: true,
          };
        }
        return {
          content: [{ type: "text" as const, text: `Routing error: ${(err as Error).message}` }],
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

        const content = response.choices?.[0]?.message?.content ?? "";
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
                  finishReason: response.choices?.[0]?.finish_reason ?? null,
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
                text: `Provider timeout after ${(latencyMs / 1000).toFixed(1)}s. Try again or use a different model.`,
              },
            ],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${sanitizeErrorMessage((err as Error).message)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
