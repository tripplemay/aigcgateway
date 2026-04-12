/**
 * 别名分类推断 — sync 后自动将未挂载模型归入别名
 *
 * 两种模式：
 * 1. 锚定模式（已有别名时）：LLM 将新模型分类到已有别名或建议新别名
 * 2. 冷启动模式（无别名时）：LLM 从零推断所有模型的别名和品牌
 *
 * LLM 失败不阻塞 sync，未分类模型在 Admin 页面手动处理。
 */

import { prisma } from "@/lib/prisma";
import { getApiKey, getBaseUrl } from "./adapters/base";

// ============================================================
// 重试辅助
// ============================================================

const RETRY_DELAYS = [3_000, 10_000]; // 重试间隔：3s, 10s

async function retryWithBackoff<T>(fn: () => Promise<T>, label: string): Promise<T> {
  let lastError: unknown;
  // 首次 + 2 次重试 = 共 3 次
  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < RETRY_DELAYS.length) {
        const delay = RETRY_DELAYS[attempt];
        console.warn(
          `[alias-classifier] ${label} attempt ${attempt + 1} failed, retrying in ${delay / 1000}s: ${err instanceof Error ? err.message : String(err)}`,
        );
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}

// ============================================================
// LLM 调用（复用 DeepSeek Provider 凭证）
// ============================================================

async function callInternalAI(prompt: string): Promise<string> {
  const deepseekProvider = await prisma.provider.findUnique({
    where: { name: "deepseek" },
  });

  if (!deepseekProvider) {
    throw new Error("DeepSeek provider not found in database");
  }

  const apiKey = getApiKey(deepseekProvider);
  const baseUrl = getBaseUrl(deepseekProvider);

  console.log(
    `[callInternalAI] provider=${deepseekProvider.name}, baseUrl=${baseUrl}, hasKey=${!!apiKey && !apiKey.startsWith("PLACEHOLDER")}, proxyUrl=${deepseekProvider.proxyUrl ?? "none"}`,
  );

  if (!apiKey || apiKey.startsWith("PLACEHOLDER")) {
    throw new Error("DeepSeek API key not configured");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60_000);

  try {
    const rawProxy = deepseekProvider.proxyUrl ?? process.env.PROXY_URL_PRIMARY ?? null;
    // Skip proxy for local addresses (mock servers in test)
    const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(baseUrl);
    const proxyUrl = isLocal ? null : rawProxy;

    const body = JSON.stringify({
      model: "deepseek-chat",
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
      max_tokens: 8192,
      response_format: { type: "json_object" },
    });

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    };

    let response: Response;

    if (proxyUrl) {
      const { ProxyAgent, fetch: undiciFetch } = await import("undici");
      const dispatcher = new ProxyAgent(proxyUrl);
      response = await (undiciFetch as unknown as typeof fetch)(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        body,
        signal: controller.signal,
        // @ts-expect-error undici dispatcher option
        dispatcher,
      });
    } else {
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        body,
        signal: controller.signal,
      });
    }

    if (!response.ok) {
      throw new Error(`DeepSeek API returned ${response.status}`);
    }

    const json = await response.json();
    const content = (json as { choices: Array<{ message: { content: string } }> }).choices?.[0]
      ?.message?.content;

    if (!content) {
      throw new Error("Empty response from DeepSeek");
    }

    return content;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ============================================================
// Prompt 构建
// ============================================================

function buildClassificationPrompt(
  existingAliases: string[],
  modelNames: string[],
  existingBrands: string[],
): string {
  const aliasSection =
    existingAliases.length > 0
      ? `## 已有别名列表（已确认，优先归入这些）\n${JSON.stringify(existingAliases)}`
      : `## 已有别名列表\n（空，首次初始化）\n\n## 额外规则\n- 所有别名需要从零创建\n- 同一模型在不同服务商的不同命名应归入同一个别名\n- 例如 "openai/gpt-4o-2024-08-06" 和 "gpt-4o" 应共用别名 "gpt-4o"`;

  return `你是 AI 模型分类专家。

## 任务
将新入库的底层模型 ID 归类到已有别名，或建议新别名。

${aliasSection}

## 待分类的新模型 ID
${modelNames.map((n) => `- ${n}`).join("\n")}

## 已有品牌列表（优先使用这些名称，不要创造新的变体）
${existingBrands.length > 0 ? JSON.stringify(existingBrands) : "(空)"}

## 规则
1. 如果模型明显属于某个已有别名（同一模型的不同版本/服务商命名），归入该别名
2. 如果没有匹配的已有别名，建议一个新别名（简短、用户友好、去掉服务商前缀和日期版本号）
3. 推断品牌时，必须优先使用已有品牌列表中的名称。只有当模型确实不属于任何已有品牌时，才建议新品牌名
4. 无法确定品牌则返回 null
5. 推断模型的 capabilities（function_calling / streaming / vision / system_prompt / json_mode / reasoning / search），返回为 true/false
6. 推断模型的 context_window（上下文窗口大小，整数，如 128000）和 max_tokens（最大输出 token 数，整数，如 4096）。不确定则返回 null
7. 对于图片生成模型，在顶层返回 supported_sizes 字段（字符串数组，与 capabilities 平级），如 ["1024x1024", "1024x1792"]。注意：不要把 supported_sizes 放在 capabilities 内部

## 版本号区分规则（严格执行）
- 不同大版本号的模型必须为独立别名，绝不合并。例如：
  - claude-3.5-sonnet 和 claude-3.7-sonnet 和 claude-4.5-sonnet 是不同别名
  - gpt-3.5-turbo 和 gpt-4 和 gpt-4o 是不同别名
  - deepseek-v2 和 deepseek-v3 是不同别名
- 仅以下差异才视为"同一别名的变体"，可归入同一别名：
  - 日期后缀差异：gpt-4o-2024-08-06 → gpt-4o
  - 服务商前缀差异：openai/gpt-4o → gpt-4o
  - 微小后缀差异：xxx-latest, xxx-preview → xxx
- 判断依据是模型的"代际"，而非名称的字面相似度

## 返回 JSON
返回一个对象，key 是模型 ID，value 是分类结果：

归入已有别名：
{ "existing_alias": "gpt-4o", "brand": "OpenAI", "context_window": 128000, "max_tokens": 16384, "capabilities": { "function_calling": true, "streaming": true, "vision": true, "system_prompt": true, "json_mode": true, "reasoning": false, "search": false } }

建议新别名：
{ "new_alias": "mistral-large", "brand": "Mistral", "context_window": 128000, "max_tokens": 8192, "capabilities": { "function_calling": true, "streaming": true, "vision": false, "system_prompt": true, "json_mode": true, "reasoning": false, "search": false } }

只返回 JSON 对象，不要其他文字。`;
}

// ============================================================
// 分类结果类型
// ============================================================

interface ClassificationResult {
  existing_alias?: string;
  new_alias?: string;
  brand?: string | null;
  context_window?: number | null;
  max_tokens?: number | null;
  capabilities?: Record<string, boolean>;
}

// ============================================================
// 核心：分类 + 入库
// ============================================================

/**
 * 对未挂载到任何别名的 Model 执行 LLM 分类推断。
 * 批量处理，每批最多 50 个模型（避免 prompt 过长）。
 */
export async function classifyNewModels(): Promise<{
  classified: number;
  newAliases: number;
  skipped: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let classified = 0;
  let newAliases = 0;
  let skipped = 0;

  // 1. 收集未挂载的 Model（有 ACTIVE Channel 的）
  const unlinkedModels = await prisma.model.findMany({
    where: {
      aliasLinks: { none: {} },
      channels: { some: { status: "ACTIVE" } },
    },
    select: { id: true, name: true, modality: true, contextWindow: true, maxTokens: true },
  });

  if (unlinkedModels.length === 0) {
    console.log("[alias-classifier] No unlinked models found, skipping");
    return { classified: 0, newAliases: 0, skipped: 0, errors: [] };
  }

  console.log(`[alias-classifier] Found ${unlinkedModels.length} unlinked models`);

  // 2. 获取已有别名列表和品牌列表作为锚定
  const existingAliases = await prisma.modelAlias.findMany({
    select: { id: true, alias: true, modality: true },
  });
  const aliasNames = existingAliases.map((a) => a.alias);
  const existingBrands = [
    ...new Set(
      (
        await prisma.modelAlias.findMany({
          where: { brand: { not: null } },
          select: { brand: true },
        })
      )
        .map((a) => a.brand!)
        .filter(Boolean),
    ),
  ];

  // 3. 分批处理（每批最多 15 个，避免 prompt 过长导致 DeepSeek 超时）
  const BATCH_SIZE = 15;
  for (let i = 0; i < unlinkedModels.length; i += BATCH_SIZE) {
    const batch = unlinkedModels.slice(i, i + BATCH_SIZE);
    const modelNames = batch.map((m) => m.name);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(unlinkedModels.length / BATCH_SIZE);

    console.log(
      `[alias-classifier] Classification batch ${batchNum}/${totalBatches} (${batch.length} models)...`,
    );

    try {
      // LLM 调用 + 重试
      const prompt = buildClassificationPrompt(aliasNames, modelNames, existingBrands);
      const rawResponse = await retryWithBackoff(
        () => callInternalAI(prompt),
        `classification batch ${batchNum}`,
      );

      let results: Record<string, ClassificationResult>;
      try {
        results = JSON.parse(rawResponse);
      } catch {
        errors.push(`Batch ${batchNum}: failed to parse LLM response`);
        skipped += batch.length;
        continue;
      }

      // 4. 即时持久化：逐模型写入 DB
      for (const model of batch) {
        const inference = results[model.name];
        if (!inference) {
          skipped++;
          continue;
        }

        try {
          if (inference.existing_alias) {
            // 归入已有别名
            const alias = existingAliases.find((a) => a.alias === inference.existing_alias);
            if (alias) {
              // modality 一致性检查：IMAGE 模型不应归入 TEXT 别名，反之亦然
              if (model.modality !== alias.modality) {
                console.warn(
                  `[alias-classifier] Modality mismatch: model "${model.name}" (${model.modality}) vs alias "${alias.alias}" (${alias.modality}), skipping`,
                );
                skipped++;
                continue;
              }
              const exists = await prisma.aliasModelLink.findUnique({
                where: { aliasId_modelId: { aliasId: alias.id, modelId: model.id } },
              });
              if (!exists) {
                await prisma.aliasModelLink.create({
                  data: { aliasId: alias.id, modelId: model.id },
                });
                await prisma.model.update({
                  where: { id: model.id },
                  data: { enabled: true },
                });
                classified++;
              }
            }
          } else if (inference.new_alias) {
            // 创建新别名（enabled=false，需 admin 审核）
            const existingAlias = await prisma.modelAlias.findUnique({
              where: { alias: inference.new_alias },
            });

            let aliasId: string;
            if (existingAlias) {
              aliasId = existingAlias.id;
            } else {
              const created = await prisma.modelAlias.create({
                data: {
                  alias: inference.new_alias,
                  brand: inference.brand ?? null,
                  modality: model.modality,
                  contextWindow: model.contextWindow ?? inference.context_window ?? null,
                  maxTokens: model.maxTokens ?? inference.max_tokens ?? null,
                  enabled: false,
                  ...(inference.capabilities ? { capabilities: inference.capabilities } : {}),
                },
              });
              aliasId = created.id;
              newAliases++;
              existingAliases.push({
                id: aliasId,
                alias: inference.new_alias,
                modality: model.modality,
              });
              aliasNames.push(inference.new_alias);
            }

            const exists = await prisma.aliasModelLink.findUnique({
              where: { aliasId_modelId: { aliasId, modelId: model.id } },
            });
            if (!exists) {
              await prisma.aliasModelLink.create({
                data: { aliasId, modelId: model.id },
              });
              classified++;
            }
          }

          // 更新 brand + capabilities + contextWindow/maxTokens（仅填充空值，不覆盖已有）
          if (inference.existing_alias) {
            const alias = existingAliases.find((a) => a.alias === inference.existing_alias);
            if (alias) {
              const current = await prisma.modelAlias.findUnique({
                where: { id: alias.id },
                select: { brand: true, capabilities: true, contextWindow: true, maxTokens: true },
              });
              if (current) {
                const updates: Record<string, unknown> = {};
                if (!current.brand && inference.brand) updates.brand = inference.brand;
                if (!current.capabilities && inference.capabilities) {
                  updates.capabilities = inference.capabilities;
                }
                if (current.contextWindow == null) {
                  const cw = model.contextWindow ?? inference.context_window ?? null;
                  if (cw != null) updates.contextWindow = cw;
                }
                if (current.maxTokens == null) {
                  const mt = model.maxTokens ?? inference.max_tokens ?? null;
                  if (mt != null) updates.maxTokens = mt;
                }
                if (Object.keys(updates).length > 0) {
                  await prisma.modelAlias.update({
                    where: { id: alias.id },
                    data: updates,
                  });
                }
              }
            }
          }
        } catch (err) {
          errors.push(
            `Failed to process model "${model.name}": ${err instanceof Error ? err.message : String(err)}`,
          );
          skipped++;
        }
      }

      console.log(`[alias-classifier] Classification batch ${batchNum} persisted`);
    } catch (err) {
      // 重试仍失败 → 跳过本批，继续下一批
      const msg = `Batch ${batchNum} failed after retries: ${err instanceof Error ? err.message : String(err)}`;
      console.error(`[alias-classifier] ${msg}`);
      errors.push(msg);
      skipped += batch.length;
    }
  }

  console.log(
    `[alias-classifier] Done: classified=${classified}, newAliases=${newAliases}, skipped=${skipped}, errors=${errors.length}`,
  );
  return { classified, newAliases, skipped, errors };
}

/**
 * 对 brand 为空的别名执行批量 brand 推断。
 * 分批 30 个 + 即时持久化 + 重试 2 次 + 失败跳过。
 */
export async function inferMissingBrands(): Promise<{
  updated: number;
  skipped: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let updated = 0;
  let skipped = 0;

  const aliasesWithoutBrand = await prisma.modelAlias.findMany({
    where: { brand: null },
    select: { id: true, alias: true },
  });

  if (aliasesWithoutBrand.length === 0) {
    return { updated: 0, skipped: 0, errors: [] };
  }

  // 获取已有品牌列表作为锚定
  const existingBrands = [
    ...new Set(
      (
        await prisma.modelAlias.findMany({
          where: { brand: { not: null } },
          select: { brand: true },
        })
      )
        .map((a) => a.brand!)
        .filter(Boolean),
    ),
  ];

  console.log(`[alias-classifier] Inferring brands for ${aliasesWithoutBrand.length} aliases...`);

  const BATCH_SIZE = 15;
  for (let i = 0; i < aliasesWithoutBrand.length; i += BATCH_SIZE) {
    const batch = aliasesWithoutBrand.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(aliasesWithoutBrand.length / BATCH_SIZE);

    console.log(
      `[alias-classifier] Brand batch ${batchNum}/${totalBatches} (${batch.length} aliases)...`,
    );

    try {
      const rawResponse = await retryWithBackoff(
        () =>
          callInternalAI(
            buildBrandPrompt(
              batch.map((a) => a.alias),
              existingBrands,
            ),
          ),
        `brand batch ${batchNum}`,
      );

      let brands: Record<string, string | null>;
      try {
        brands = JSON.parse(rawResponse);
      } catch {
        errors.push(`Batch ${batchNum}: failed to parse LLM response`);
        skipped += batch.length;
        continue;
      }

      // 即时持久化
      for (const alias of batch) {
        const brand = brands[alias.alias];
        if (brand) {
          await prisma.modelAlias.update({
            where: { id: alias.id },
            data: { brand },
          });
          updated++;
        } else {
          skipped++;
        }
      }

      console.log(`[alias-classifier] Brand batch ${batchNum} persisted`);
    } catch (err) {
      const msg = `Batch ${batchNum} failed after retries: ${err instanceof Error ? err.message : String(err)}`;
      console.error(`[alias-classifier] ${msg}`);
      errors.push(msg);
      skipped += batch.length;
    }
  }

  console.log(
    `[alias-classifier] Brand inference done: updated=${updated}, skipped=${skipped}, errors=${errors.length}`,
  );
  return { updated, skipped, errors };
}

function buildBrandPrompt(aliasNames: string[], existingBrands: string[]): string {
  const brandAnchor =
    existingBrands.length > 0
      ? `\n已有品牌列表（优先使用这些名称，不要创造新的变体）：\n${JSON.stringify(existingBrands)}\n`
      : "";

  return `以下是 AI 模型的别名列表，请判断每个模型属于哪个厂商。
返回 JSON 对象：key 是别名，value 是品牌名。
品牌名必须优先使用已有品牌列表中的名称，只有当模型确实不属于任何已有品牌时才建议新品牌名。
无法确定则返回 null。
${brandAnchor}
别名列表：
${aliasNames.map((n) => `- ${n}`).join("\n")}

只返回 JSON 对象，不要其他文字。`;
}

/**
 * 对 capabilities 为空的别名执行批量推断。
 * 仅填充空值，不覆盖已有 capabilities。
 */
export async function inferMissingCapabilities(): Promise<{
  updated: number;
  skipped: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let updated = 0;
  let skipped = 0;

  // Fetch all aliases and filter in JS to avoid Prisma Json null filtering issues
  const allAliases = await prisma.modelAlias.findMany({
    select: { id: true, alias: true, capabilities: true },
  });
  const aliasesWithoutCaps = allAliases.filter((a) => {
    if (a.capabilities === null) return true;
    if (typeof a.capabilities === "object" && Object.keys(a.capabilities as object).length === 0)
      return true;
    return false;
  });

  console.log(
    `[alias-classifier] Total aliases: ${allAliases.length}, without caps: ${aliasesWithoutCaps.length}`,
  );

  if (aliasesWithoutCaps.length === 0) {
    return { updated: 0, skipped: 0, errors: [] };
  }

  // 分批处理，每批 15 个
  const BATCH_SIZE = 15;
  for (let i = 0; i < aliasesWithoutCaps.length; i += BATCH_SIZE) {
    const batch = aliasesWithoutCaps.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(aliasesWithoutCaps.length / BATCH_SIZE);

    console.log(
      `[alias-classifier] Capabilities batch ${batchNum}/${totalBatches} (${batch.length} aliases)...`,
    );

    try {
      // LLM 调用 + 重试
      const rawResponse = await retryWithBackoff(
        () => callInternalAI(buildCapabilitiesPrompt(batch.map((a) => a.alias))),
        `capabilities batch ${batchNum}`,
      );

      let results: Record<string, Record<string, boolean>>;
      try {
        results = JSON.parse(rawResponse);
      } catch {
        errors.push(`Batch ${batchNum}: failed to parse LLM response`);
        skipped += batch.length;
        continue;
      }

      // 即时持久化：每批成功立即写入 DB
      for (const alias of batch) {
        const caps = results[alias.alias];
        if (caps && typeof caps === "object") {
          await prisma.modelAlias.update({
            where: { id: alias.id },
            data: { capabilities: caps },
          });
          updated++;
        } else {
          skipped++;
        }
      }

      console.log(
        `[alias-classifier] Capabilities batch ${batchNum} persisted: ${batch.length} aliases processed`,
      );
    } catch (err) {
      // 重试仍失败 → 跳过本批，继续下一批
      const msg = `Batch ${batchNum} failed after retries: ${err instanceof Error ? err.message : String(err)}`;
      console.error(`[alias-classifier] ${msg}`);
      errors.push(msg);
      skipped += batch.length;
    }
  }

  console.log(
    `[alias-classifier] Capabilities inference done: updated=${updated}, skipped=${skipped}, errors=${errors.length}${errors.length > 0 ? " — " + errors.join("; ") : ""}`,
  );
  return { updated, skipped, errors };
}

function buildCapabilitiesPrompt(aliasNames: string[]): string {
  return `以下是 AI 模型的别名列表，请推断每个模型的能力（capabilities）。

返回 JSON 对象：key 是别名，value 是 capabilities 对象。
每个 capability 为 true 或 false：
- function_calling: 是否支持函数调用/工具使用
- streaming: 是否支持流式输出
- vision: 是否支持图片/视觉输入
- system_prompt: 是否支持系统消息
- json_mode: 是否支持 JSON 结构化输出
- reasoning: 是否支持推理/思维链（如 o1、DeepSeek-R1、QwQ 等推理模型）
- search: 是否支持联网搜索（如 gpt-4o-search、kimi-search 等）

对于图片生成模型（如 dall-e、cogview、flux、stable-diffusion 等），在顶层（与 capabilities 平级）额外返回 supported_sizes 字段（字符串数组），列出支持的图片尺寸，如 ["1024x1024", "1024x1792", "1792x1024"]。注意：不要把 supported_sizes 放在 capabilities 内部。非图片模型不需要此字段。

别名列表：
${aliasNames.map((n) => `- ${n}`).join("\n")}

只返回 JSON 对象，不要其他文字。`;
}

/**
 * 一次性修正：迁移 image_input → vision，然后对所有别名重跑 capabilities 推断。
 */
export async function reinferAllCapabilities(): Promise<{
  migrated: number;
  updated: number;
  skipped: number;
  errors: string[];
}> {
  const allAliases = await prisma.modelAlias.findMany({
    select: { id: true, alias: true, capabilities: true },
  });

  // Step 1: 迁移 image_input → vision
  let migrated = 0;
  for (const alias of allAliases) {
    const caps = alias.capabilities as Record<string, unknown> | null;
    if (caps && "image_input" in caps) {
      const { image_input, ...rest } = caps;
      await prisma.modelAlias.update({
        where: { id: alias.id },
        data: {
          capabilities: { ...rest, vision: Boolean(caps.vision) || Boolean(image_input) },
        },
      });
      migrated++;
    }
  }
  console.log(`[alias-classifier] Migrated image_input → vision: ${migrated} aliases`);

  // Step 2: 对所有别名重跑推断（覆盖现有 capabilities）
  const refreshAliases = await prisma.modelAlias.findMany({
    select: { id: true, alias: true },
  });
  const errors: string[] = [];
  let updated = 0;
  let skipped = 0;
  const BATCH_SIZE = 15;

  for (let i = 0; i < refreshAliases.length; i += BATCH_SIZE) {
    const batch = refreshAliases.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;

    try {
      const rawResponse = await retryWithBackoff(
        () => callInternalAI(buildCapabilitiesPrompt(batch.map((a) => a.alias))),
        `reinfer batch ${batchNum}`,
      );
      let results: Record<string, Record<string, unknown>>;
      try {
        results = JSON.parse(rawResponse);
      } catch {
        errors.push(`Batch ${batchNum}: parse error`);
        skipped += batch.length;
        continue;
      }
      for (const alias of batch) {
        const caps = results[alias.alias];
        if (caps && typeof caps === "object") {
          await prisma.modelAlias.update({
            where: { id: alias.id },
            data: { capabilities: caps as Record<string, boolean> },
          });
          updated++;
        } else {
          skipped++;
        }
      }
    } catch (err) {
      errors.push(`Batch ${batchNum}: ${err instanceof Error ? err.message : String(err)}`);
      skipped += batch.length;
    }
  }

  return { migrated, updated, skipped, errors };
}
