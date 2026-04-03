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
import { checkMcpPermission } from "@/lib/mcp/auth";
import { injectByTemplateId, InjectionError } from "@/lib/template/inject";
import type { McpServerOptions } from "@/lib/mcp/server";

const messageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string(),
});

export function registerChat(server: McpServer, opts: McpServerOptions): void {
  const { projectId, permissions, keyRateLimit } = opts;
  server.tool(
    "chat",
    `Send a chat completion request to an AI model via AIGC Gateway. Supports two modes: (1) direct messages, or (2) templateId + variables for template-based calls. When templateId is provided, messages can be omitted — the template's active version will be used with variable injection. Returns generated text, trace ID, and token usage.`,
    {
      model: z.string().describe("Model name, e.g. openai/gpt-4o, deepseek/v3"),
      messages: z
        .array(messageSchema)
        .optional()
        .describe("Message array [{role, content}]. Optional when using templateId."),
      templateId: z
        .string()
        .optional()
        .describe(
          "Template ID — if provided, uses template's active version with variable injection",
        ),
      variables: z
        .record(z.string())
        .optional()
        .describe('Variables to inject into template, e.g. {"language": "Python", "code": "..."}'),
      temperature: z.number().min(0).max(2).optional().describe("Sampling temperature, 0-2"),
      max_tokens: z.number().int().positive().optional().describe("Maximum output tokens"),
    },
    async ({ model, messages, templateId, variables, temperature, max_tokens }) => {
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

      // Template injection
      let resolvedMessages = messages;
      let tplVersionId: string | undefined;
      let tplVariables: Record<string, string> | undefined;

      if (templateId) {
        try {
          const injected = await injectByTemplateId(templateId, variables || {});
          resolvedMessages = injected.messages as {
            role: "system" | "user" | "assistant";
            content: string;
          }[];
          tplVersionId = injected.templateVersionId;
          tplVariables = variables;
        } catch (err) {
          if (err instanceof InjectionError) {
            return {
              content: [{ type: "text" as const, text: `Template error: ${err.message}` }],
              isError: true,
            };
          }
          return {
            content: [{ type: "text" as const, text: `Template error: ${(err as Error).message}` }],
            isError: true,
          };
        }
      }

      if (!resolvedMessages || resolvedMessages.length === 0) {
        return {
          content: [{ type: "text" as const, text: "Either messages or templateId is required." }],
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
        if (err instanceof EngineError && err.code === "no_available_channel") {
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
        messages: resolvedMessages,
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
          promptSnapshot: resolvedMessages,
          requestParams: { temperature, max_tokens },
          startTime,
          response,
          source: "mcp",
          templateVersionId: tplVersionId,
          templateVariables: tplVariables,
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
          promptSnapshot: resolvedMessages,
          requestParams: { temperature, max_tokens },
          startTime,
          error: { message: (err as Error).message, code: (err as EngineError)?.code },
          source: "mcp",
          templateVersionId: tplVersionId,
          templateVariables: tplVariables,
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
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );
}
