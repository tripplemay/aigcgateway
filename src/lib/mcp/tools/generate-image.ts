/**
 * MCP Tool: generate_image
 *
 * 调用图片模型生成图片。
 * AI 调用类 Tool —— 写入 CallLog（source='mcp'），执行 deduct_balance。
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { resolveEngine, withFailover, getAttemptChainFromError } from "@/lib/engine";
import { generateTraceId } from "@/lib/api/response";
import { processImageResult } from "@/lib/api/post-process";
import { persistGeneratedImages } from "@/lib/api/persist-image";
import { buildProxyUrl } from "@/lib/api/image-proxy";
import { validatePrompt } from "@/lib/api/prompt-validation";
import { validateImageInput, sanitizeImageInputForLog } from "@/lib/api/image-input";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, checkSpendingRate } from "@/lib/api/rate-limit";
import { EngineError, sanitizeErrorMessage } from "@/lib/engine/types";
import type { ImageGenerationRequest } from "@/lib/engine/types";
import { checkMcpPermission } from "@/lib/mcp/auth";
import type { McpServerOptions } from "@/lib/mcp/server";

export function registerGenerateImage(server: McpServer, opts: McpServerOptions): void {
  const { userId, projectId, apiKeyId, permissions, keyRateLimit } = opts;
  server.tool(
    "generate_image",
    `Generate images using an AI model via AIGC Gateway. Returns image URLs, trace ID, and cost. Supports image-to-image (i2i): pass source image(s) via the optional "image" parameter — the model must have the image_to_image capability. IMPORTANT: Call list_models(modality='image') first to get available image model names, supported sizes, and capabilities.`,
    {
      model: z.string().describe("Exact image model name from list_models output"),
      prompt: z
        .string()
        .min(1, "prompt must be non-empty")
        .max(4000, "prompt must be at most 4000 characters")
        .describe("Image description / prompt"),
      // fix_round 1 (IIV-DEF-02): 不在 zod 层设 max(10)——SDK 会把超限转成
      // JSON-RPC -32602 协议错误；张数上限交给 handler 内 validateImageInput，
      // 返回 spec D7 要求的业务信封（isError:true + code + param）。
      image: z
        .union([z.string(), z.array(z.string())])
        .optional()
        .describe(
          "Optional source image(s) for image-to-image generation: an http(s) URL or data:image base64 URI, or an array of up to 10 (multi-image fusion). Prefer URLs over base64 (base64 payloads are heavy over MCP; max 5MB per base64 image). Requires a model with the image_to_image capability (check list_models).",
        ),
      size: z
        .string()
        .optional()
        .describe(
          "Image size. Common values: 1024x1024, 1024x1792, 1792x1024, auto. Check supportedSizes in list_models(modality='image') for valid values per model.",
        ),
      n: z
        .number()
        .int()
        .min(1)
        .max(4)
        .optional()
        .describe("Number of images to generate, default 1"),
    },
    async ({ model, prompt, image, size, n }) => {
      // Permission check
      const permErr = checkMcpPermission(permissions, "imageGeneration");
      if (permErr) {
        return { content: [{ type: "text" as const, text: permErr }], isError: true };
      }

      // F-WP-05: binary payload detection on top of schema-level min/max.
      const promptCheck = validatePrompt(prompt, { maxLength: 4000 });
      if (!promptCheck.ok) {
        return {
          content: [
            {
              type: "text" as const,
              text: `[invalid_prompt] ${promptCheck.message}`,
            },
          ],
          isError: true,
        };
      }

      // BL-IMG-I2I-VISION F-IIV-06 (D1): 源图校验——与 REST 同一 helper
      // （image-input.ts：归一化 / 协议白名单 / base64 大小 / 张数）。
      let sourceImages: string[] = [];
      if (image !== undefined) {
        const imageCheck = validateImageInput(image);
        if (!imageCheck.ok) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  code: imageCheck.error.code,
                  message: imageCheck.error.message,
                  param: imageCheck.error.param,
                }),
              },
            ],
            isError: true,
          };
        }
        sourceImages = imageCheck.images;
      }

      // Check balance
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user || Number(user.balance) <= 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Insufficient balance. Current balance: $${Number(user?.balance ?? 0).toFixed(4)}. Please recharge at the console.`,
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

      // Rate limit (image RPM — three-layer + spend guard)
      const project = await prisma.project.findUnique({ where: { id: projectId } });
      const projectForLimits = project ?? { id: projectId, rateLimit: null };
      const rateCheck = await checkRateLimit(projectForLimits, "image", keyRateLimit, {
        apiKeyId: apiKeyId ?? null,
        userId,
      });
      if (!rateCheck.ok) {
        return {
          content: [
            { type: "text" as const, text: "Rate limit exceeded. Please retry after 60 seconds." },
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
              text: "[spend_rate_exceeded] Spending rate limit exceeded. Please retry after 60 seconds.",
            },
          ],
          isError: true,
        };
      }

      // Resolve engine
      let route;
      let adapter;
      let candidates: import("@/lib/engine/types").RouteResult[] = [];
      try {
        const resolved = await resolveEngine(model);
        route = resolved.route;
        adapter = resolved.adapter;
        candidates = resolved.candidates;
      } catch (err) {
        if (
          err instanceof EngineError &&
          (err.code === "model_not_found" || err.code === "model_not_available")
        ) {
          const available = await prisma.modelAlias.findMany({
            where: { enabled: true, modality: "IMAGE" },
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
                text: JSON.stringify({
                  code: err.code,
                  message: `${reason} Available image models: ${names || "none"}. Use list_models with modality 'image' for full details.`,
                }),
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
                text: JSON.stringify({
                  code: "channel_unavailable",
                  message: `No available channel for model "${model}". Try another model or retry later.`,
                }),
              },
            ],
            isError: true,
          };
        }
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                code: (err instanceof EngineError ? err.code : null) ?? "routing_error",
                message: sanitizeErrorMessage((err as Error).message),
              }),
            },
          ],
          isError: true,
        };
      }

      // F-ACF-11: modality 校验——text 模型不允许用于图片生成
      if (route.alias?.modality === "TEXT") {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                code: "invalid_model_modality",
                message: `Model "${model}" is a text model and cannot be used for image generation. Use the chat tool instead.`,
              }),
            },
          ],
          isError: true,
        };
      }

      // BL-IMG-I2I-VISION F-IIV-06 (D2): i2i 能力门禁——与 REST 同语义
      // （alias 优先，回退 model；null 按不支持）。
      if (sourceImages.length > 0) {
        const aliasCaps = (route.alias?.capabilities ?? null) as {
          image_to_image?: boolean;
        } | null;
        const modelCaps = (route.model?.capabilities ?? null) as {
          image_to_image?: boolean;
        } | null;
        if (aliasCaps?.image_to_image !== true && modelCaps?.image_to_image !== true) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  code: "model_not_i2i_capable",
                  message: `Model "${model}" does not support image-to-image generation (source image input). Use list_models to find a model with the image_to_image capability.`,
                }),
              },
            ],
            isError: true,
          };
        }
      }

      // Size 预校验
      if (size) {
        const supportedSizes = route.model.supportedSizes as string[] | null;
        if (supportedSizes && supportedSizes.length > 0 && !supportedSizes.includes(size)) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  code: "invalid_size",
                  message: `Invalid size "${size}" for model "${model}". Supported sizes: ${supportedSizes.join(", ")}`,
                  supportedSizes,
                }),
              },
            ],
            isError: true,
          };
        }
      }

      const traceId = generateTraceId();
      const startTime = Date.now();

      const request: ImageGenerationRequest = {
        model,
        prompt,
        ...(sourceImages.length > 0 ? { image: sourceImages } : {}),
        ...(size ? { size } : {}),
        ...(n ? { n } : {}),
      };

      // F-IIV-06 (D6) 日志卫生：requestParams 落库前源图占位符化
      const requestParamsForLog: Record<string, unknown> = {
        ...(request as unknown as Record<string, unknown>),
        ...(sourceImages.length > 0 ? { image: sanitizeImageInputForLog(sourceImages) } : {}),
      };
      const sourceImagesCount = sourceImages.length > 0 ? sourceImages.length : undefined;

      try {
        // F-RR-02: failover
        const {
          result: response,
          route: usedRoute,
          attemptChain,
        } = await withFailover(candidates.length > 0 ? candidates : [route], (r, a) =>
          a.imageGenerations(request, r),
        );
        route = usedRoute;

        // BL-IMG-PERSIST-GCS F-IGP-02 (D4/D5): 同步转存三形态图到 GCS，再同步
        // await CallLog 写入（original_urls = GCS keys），保证响应返回前代理
        // 回源已可解析。存储故障 → null 项，按 D6 兜底不硬失败。
        const persistedKeys = await persistGeneratedImages(traceId, projectId, response);

        // Post-process: write CallLog (source='mcp') + deduct balance
        await processImageResult({
          traceId,
          userId,
          projectId,
          route,
          modelName: model,
          promptSnapshot: [{ role: "user", content: prompt }],
          requestParams: requestParamsForLog,
          sourceImagesCount,
          startTime,
          response,
          persistedKeys,
          source: "mcp",
          attemptChain,
        });

        // F-ACF-07 + F-IGP-03: build a signed proxy URL for every persisted
        // image (incl. data:/b64_json — fixes the previous data: dead link and
        // the b64_json-only empty images[] bug). D6 fallback: a non-persisted
        // http(s) upstream is still proxiable; a failed data:/b64 image is
        // dropped (MCP never returns raw base64 text — payload control).
        const baseOrigin = process.env.NEXT_PUBLIC_GATEWAY_ORIGIN ?? "https://aigc.guangai.ai";
        const urls = response.data
          .map((d, i) => {
            if (persistedKeys[i]) return buildProxyUrl(traceId, i, baseOrigin);
            const u = typeof d?.url === "string" ? d.url : undefined;
            return u && /^https?:\/\//i.test(u) ? buildProxyUrl(traceId, i, baseOrigin) : null;
          })
          .filter((u): u is string => typeof u === "string");

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
        const failedChain = getAttemptChainFromError(err) ?? undefined;
        processImageResult({
          traceId,
          userId,
          projectId,
          route,
          modelName: model,
          promptSnapshot: [{ role: "user", content: prompt }],
          requestParams: requestParamsForLog,
          sourceImagesCount,
          startTime,
          error: { message: (err as Error).message, code: (err as EngineError)?.code },
          source: "mcp",
          attemptChain: failedChain,
        });

        const engineErr = err instanceof EngineError ? err : null;
        const latencyMs = Date.now() - startTime;

        if (engineErr?.code === "provider_timeout") {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  code: "provider_timeout",
                  message: `Provider timeout after ${(latencyMs / 1000).toFixed(1)}s. Try again or use a different model.`,
                }),
              },
            ],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                code: engineErr?.code ?? "provider_error",
                message: sanitizeErrorMessage((err as Error).message),
              }),
            },
          ],
          isError: true,
        };
      }
    },
  );
}
