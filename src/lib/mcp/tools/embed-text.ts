/**
 * MCP Tool: embed_text — BL-EMBEDDING-MVP F-EM-05
 *
 * 调用 embedding 模型生成向量。
 * AI 调用类 Tool —— 写入 CallLog（source='mcp'），执行 deduct_balance。
 *
 * Permission: 复用 chatCompletion（MVP 简化；Phase 2 可加 embedding 独立权限）
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { resolveEngine } from "@/lib/engine";
import { generateTraceId } from "@/lib/api/response";
import { processEmbeddingResult, calculateTokenCost } from "@/lib/api/post-process";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, checkTokenLimit, checkSpendingRate } from "@/lib/api/rate-limit";
import { EngineError, sanitizeErrorMessage } from "@/lib/engine/types";
import type { Usage } from "@/lib/engine/types";
import { checkMcpPermission } from "@/lib/mcp/auth";
import type { McpServerOptions } from "@/lib/mcp/server";

const MAX_BATCH_INPUTS = 100;

export function registerEmbedText(server: McpServer, opts: McpServerOptions): void {
  const { userId, projectId, apiKeyId, permissions, keyRateLimit } = opts;
  server.tool(
    "embed_text",
    "Generate vector embeddings from text using an AIGC Gateway embedding model. Pass model name + input (string or array up to 100). Returns embedding(s) + token usage. Use list_models with modality='embedding' to discover available embedding models.",
    {
      model: z
        .string()
        .describe(
          "Embedding model name from list_models?modality=embedding (e.g. 'bge-m3' / 'text-embedding-3-small')",
        ),
      input: z
        .union([z.string().min(1, "input must be non-empty"), z.array(z.string().min(1)).max(MAX_BATCH_INPUTS)])
        .describe(`Text to embed: single string or array up to ${MAX_BATCH_INPUTS} entries.`),
    },
    async ({ model, input }) => {
      const permErr = checkMcpPermission(permissions, "chatCompletion");
      if (permErr) {
        return { content: [{ type: "text" as const, text: permErr }], isError: true };
      }

      // Balance
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

      // Rate limit (text 维度复用 + TPM + spend)
      const project = await prisma.project.findUnique({ where: { id: projectId } });
      const projectForLimits = project ?? { id: projectId, rateLimit: null };
      const rateCheck = await checkRateLimit(projectForLimits, "text", keyRateLimit, {
        apiKeyId: apiKeyId ?? null,
        userId,
      });
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
      const tpmCheck = await checkTokenLimit(projectForLimits);
      if (!tpmCheck.ok) {
        return {
          content: [
            {
              type: "text" as const,
              text: `[token_rate_limit_exceeded] Token rate limit exceeded. Please retry after 60 seconds.`,
            },
          ],
          isError: true,
        };
      }
      const userRateLimit = (user.rateLimit as { spendPerMin?: number } | null) ?? null;
      const spendCheck = await checkSpendingRate(userId, userRateLimit?.spendPerMin ?? null);
      if (!spendCheck.ok) {
        return {
          content: [
            {
              type: "text" as const,
              text: `[spend_rate_exceeded] Spending rate limit exceeded. Please retry after 60 seconds.`,
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
            where: { enabled: true, modality: "EMBEDDING" },
            select: { alias: true },
            orderBy: { alias: "asc" },
            take: 10,
          });
          const names = available.map((a) => a.alias).join(", ");
          return {
            content: [
              {
                type: "text" as const,
                text: `[${err.code}] Model "${model}" ${err.code === "model_not_available" ? "is not available" : "not found"}. Available embedding models: ${names || "none"}.`,
              },
            ],
            isError: true,
          };
        }
        const code = err instanceof EngineError ? err.code : "routing_error";
        return {
          content: [{ type: "text" as const, text: `[${code}] ${(err as Error).message}` }],
          isError: true,
        };
      }

      // Modality 校验：必须 EMBEDDING
      if (route.model?.modality !== "EMBEDDING") {
        return {
          content: [
            {
              type: "text" as const,
              text: `[invalid_model_modality] Model "${model}" is not an embedding model. Use list_models with modality='embedding' to find compatible models.`,
            },
          ],
          isError: true,
        };
      }

      // Adapter 必须支持 embeddings
      if (!adapter.embeddings) {
        return {
          content: [
            {
              type: "text" as const,
              text: `[provider_error] Provider does not support embeddings for model "${model}".`,
            },
          ],
          isError: true,
        };
      }

      const traceId = generateTraceId();
      const startTime = Date.now();

      try {
        const result = await adapter.embeddings({ model, input }, route);

        // 内联计算 sellUsd 用于响应
        const usageForCost: Usage = {
          prompt_tokens: result.usage.prompt_tokens,
          completion_tokens: 0,
          total_tokens: result.usage.total_tokens,
        };
        const { sellUsd } = calculateTokenCost(usageForCost, route, "SUCCESS");

        processEmbeddingResult({
          traceId,
          userId,
          projectId,
          route,
          modelName: model,
          promptSnapshot: [
            typeof input === "string"
              ? { role: "user", content: input.slice(0, 4000) }
              : { role: "user", content: input.map((s) => s.slice(0, 1000)).join("\n---\n").slice(0, 4000) },
          ],
          requestParams: {
            model,
            input_type: typeof input === "string" ? "single" : "batch",
            input_count: typeof input === "string" ? 1 : input.length,
          },
          startTime,
          response: result,
          source: "mcp",
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  data: result.data.map((d) => ({
                    index: d.index,
                    embedding: d.embedding,
                    dimensions: d.embedding.length,
                  })),
                  model,
                  traceId,
                  cost: `$${sellUsd.toFixed(8)}`,
                  usage: {
                    promptTokens: result.usage.prompt_tokens,
                    totalTokens: result.usage.total_tokens,
                  },
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err) {
        processEmbeddingResult({
          traceId,
          userId,
          projectId,
          route,
          modelName: model,
          promptSnapshot: [
            typeof input === "string"
              ? { role: "user", content: input.slice(0, 4000) }
              : { role: "user", content: "(batch)" },
          ],
          requestParams: {
            model,
            input_type: typeof input === "string" ? "single" : "batch",
            input_count: typeof input === "string" ? 1 : input.length,
          },
          startTime,
          error: { message: (err as Error).message, code: (err as EngineError)?.code },
          source: "mcp",
        });
        const code = err instanceof EngineError ? err.code : "provider_error";
        return {
          content: [
            {
              type: "text" as const,
              text: `[${code}] ${sanitizeErrorMessage((err as Error).message)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
