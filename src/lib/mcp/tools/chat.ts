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
import { EngineError } from "@/lib/engine/types";
import type { ChatCompletionRequest } from "@/lib/engine/types";

const messageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string(),
});

export function registerChat(server: McpServer, projectId: string): void {
  server.tool(
    "chat",
    `Send a chat completion request to an AI model via AIGC Gateway. The platform handles provider routing, cost tracking, and audit logging. Returns the generated text, trace ID for debugging, and token usage with cost. Use list_models first to find available models and their pricing.`,
    {
      model: z.string().describe("Model name, e.g. openai/gpt-4o, deepseek/v3"),
      messages: z.array(messageSchema).describe("Message array [{role, content}]"),
      temperature: z.number().min(0).max(2).optional().describe("Sampling temperature, 0-2"),
      max_tokens: z.number().int().positive().optional().describe("Maximum output tokens"),
    },
    async ({ model, messages, temperature, max_tokens }) => {
      // Check balance
      const project = await prisma.project.findUnique({ where: { id: projectId } });
      if (!project || Number(project.balance) <= 0) {
        return {
          content: [{
            type: "text" as const,
            text: `Insufficient balance. Current balance: $${Number(project?.balance ?? 0).toFixed(4)}. Please recharge at the console.`,
          }],
          isError: true,
        };
      }

      // Rate limit
      const rateCheck = await checkRateLimit(project, "text");
      if (!rateCheck.ok) {
        return {
          content: [{ type: "text" as const, text: "Rate limit exceeded. Please wait and try again." }],
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
          return {
            content: [{ type: "text" as const, text: `Model "${model}" not found. Use list_models to see available models.` }],
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
        messages,
        ...(temperature !== undefined ? { temperature } : {}),
        ...(max_tokens !== undefined ? { max_tokens } : {}),
        stream: false,
      };

      try {
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
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              content,
              traceId,
              model,
              usage: usage ? {
                promptTokens: usage.prompt_tokens,
                completionTokens: usage.completion_tokens,
                totalTokens: usage.total_tokens,
              } : null,
              finishReason: response.choices?.[0]?.finish_reason ?? null,
            }, null, 2),
          }],
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

        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );
}
