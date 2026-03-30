/**
 * MCP Tool: generate_image
 *
 * 调用图片模型生成图片。
 * AI 调用类 Tool —— 写入 CallLog（source='mcp'），执行 deduct_balance。
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { resolveEngine } from "@/lib/engine";
import { generateTraceId } from "@/lib/api/response";
import { processImageResult } from "@/lib/api/post-process";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/api/rate-limit";
import { EngineError } from "@/lib/engine/types";
import type { ImageGenerationRequest } from "@/lib/engine/types";

export function registerGenerateImage(server: McpServer, projectId: string): void {
  server.tool(
    "generate_image",
    `Generate images using an AI model via AIGC Gateway. Returns image URLs, trace ID, and cost. Use list_models with modality 'image' to find available image models.`,
    {
      model: z.string().describe("Image model name, e.g. openai/dall-e-3, zhipu/cogview-4"),
      prompt: z.string().describe("Image description / prompt"),
      size: z.string().optional().describe("Image size, e.g. 1024x1024"),
      n: z
        .number()
        .int()
        .min(1)
        .max(4)
        .optional()
        .describe("Number of images to generate, default 1"),
    },
    async ({ model, prompt, size, n }) => {
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

      // Rate limit (image RPM)
      const rateCheck = await checkRateLimit(project, "image");
      if (!rateCheck.ok) {
        return {
          content: [
            { type: "text" as const, text: "Rate limit exceeded. Please retry after 60 seconds." },
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
        if (err instanceof EngineError && err.code === "model_not_found") {
          const available = await prisma.model.findMany({
            where: { channels: { some: { status: "ACTIVE" } }, modality: "IMAGE" },
            select: { name: true },
            orderBy: { name: "asc" },
            take: 10,
          });
          const names = available.map((m) => m.name).join(", ");
          return {
            content: [
              {
                type: "text" as const,
                text: `Model "${model}" not found. Available image models: ${names || "none"}. Use list_models with modality 'image' for full details.`,
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
                text: `No available channel for model "${model}". Try another model or retry later.`,
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

      const request: ImageGenerationRequest = {
        model,
        prompt,
        ...(size ? { size } : {}),
        ...(n ? { n } : {}),
      };

      try {
        const response = await adapter.imageGenerations(request, route);

        // Post-process: write CallLog (source='mcp') + deduct balance
        processImageResult({
          traceId,
          projectId,
          route,
          modelName: model,
          promptSnapshot: [{ role: "user", content: prompt }],
          requestParams: request as unknown as Record<string, unknown>,
          startTime,
          response,
          source: "mcp",
        });

        const urls = response.data.map((d) => d.url).filter(Boolean);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  images: urls,
                  traceId,
                  model,
                  count: urls.length,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err) {
        processImageResult({
          traceId,
          projectId,
          route,
          modelName: model,
          promptSnapshot: [{ role: "user", content: prompt }],
          requestParams: request as unknown as Record<string, unknown>,
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
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );
}
