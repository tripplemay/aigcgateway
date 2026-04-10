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

function buildClassificationPrompt(existingAliases: string[], modelNames: string[]): string {
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

## 规则
1. 如果模型明显属于某个已有别名（同一模型的不同版本/服务商命名），归入该别名
2. 如果没有匹配的已有别名，建议一个新别名（简短、用户友好、去掉服务商前缀和日期版本号）
3. 同时推断品牌（OpenAI、Anthropic、Google、Meta、Mistral、DeepSeek、智谱 AI 等）
4. 无法确定品牌则返回 null
5. 推断模型的 capabilities（function_calling / streaming / vision / system_prompt / json_mode / image_input），返回为 true/false

## 返回 JSON
返回一个对象，key 是模型 ID，value 是分类结果：

归入已有别名：
{ "existing_alias": "gpt-4o", "brand": "OpenAI", "capabilities": { "function_calling": true, "streaming": true, "vision": true, "system_prompt": true, "json_mode": true, "image_input": true } }

建议新别名：
{ "new_alias": "mistral-large", "brand": "Mistral", "capabilities": { "function_calling": true, "streaming": true, "vision": false, "system_prompt": true, "json_mode": true, "image_input": false } }

只返回 JSON 对象，不要其他文字。`;
}

// ============================================================
// 分类结果类型
// ============================================================

interface ClassificationResult {
  existing_alias?: string;
  new_alias?: string;
  brand?: string | null;
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
  errors: string[];
}> {
  const errors: string[] = [];
  let classified = 0;
  let newAliases = 0;

  try {
    // 1. 收集未挂载的 Model（有 ACTIVE Channel 的）
    const unlinkedModels = await prisma.model.findMany({
      where: {
        aliasLinks: { none: {} },
        channels: { some: { status: "ACTIVE" } },
      },
      select: { id: true, name: true },
    });

    if (unlinkedModels.length === 0) {
      console.log("[alias-classifier] No unlinked models found, skipping");
      return { classified: 0, newAliases: 0, errors: [] };
    }

    console.log(`[alias-classifier] Found ${unlinkedModels.length} unlinked models`);

    // 2. 获取已有别名列表作为锚定
    const existingAliases = await prisma.modelAlias.findMany({
      select: { id: true, alias: true },
    });
    const aliasNames = existingAliases.map((a) => a.alias);

    // 3. 分批处理（每批最多 50 个）
    const BATCH_SIZE = 50;
    for (let i = 0; i < unlinkedModels.length; i += BATCH_SIZE) {
      const batch = unlinkedModels.slice(i, i + BATCH_SIZE);
      const modelNames = batch.map((m) => m.name);

      try {
        console.log(
          `[alias-classifier] Processing batch ${Math.floor(i / BATCH_SIZE) + 1} (${batch.length} models)...`,
        );

        const prompt = buildClassificationPrompt(aliasNames, modelNames);
        const rawResponse = await callInternalAI(prompt);

        let results: Record<string, ClassificationResult>;
        try {
          results = JSON.parse(rawResponse);
        } catch {
          errors.push(`Failed to parse LLM response for batch ${Math.floor(i / BATCH_SIZE) + 1}`);
          continue;
        }

        // 4. 处理分类结果
        for (const model of batch) {
          const inference = results[model.name];
          if (!inference) continue;

          try {
            if (inference.existing_alias) {
              // 归入已有别名
              const alias = existingAliases.find((a) => a.alias === inference.existing_alias);
              if (alias) {
                // Check not already linked
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
                // 别名已存在（可能被前一个 batch 创建），直接挂载
                aliasId = existingAlias.id;
              } else {
                const created = await prisma.modelAlias.create({
                  data: {
                    alias: inference.new_alias,
                    brand: inference.brand ?? null,
                    enabled: false,
                    ...(inference.capabilities ? { capabilities: inference.capabilities } : {}),
                  },
                });
                aliasId = created.id;
                newAliases++;
                // 加入锚定列表供后续 batch 使用
                existingAliases.push({ id: aliasId, alias: inference.new_alias });
                aliasNames.push(inference.new_alias);
              }

              const exists = await prisma.aliasModelLink.findUnique({
                where: { aliasId_modelId: { aliasId, modelId: model.id } },
              });
              if (!exists) {
                await prisma.aliasModelLink.create({
                  data: { aliasId, modelId: model.id },
                });
                // 新别名 enabled=false，Model.enabled 也不自动启用
                classified++;
              }
            }

            // 更新 brand + capabilities（仅填充空值，不覆盖已有）
            if (inference.existing_alias) {
              const alias = existingAliases.find((a) => a.alias === inference.existing_alias);
              if (alias) {
                const current = await prisma.modelAlias.findUnique({
                  where: { id: alias.id },
                  select: { brand: true, capabilities: true },
                });
                if (current) {
                  const updates: Record<string, unknown> = {};
                  if (!current.brand && inference.brand) updates.brand = inference.brand;
                  if (!current.capabilities && inference.capabilities) {
                    updates.capabilities = inference.capabilities;
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
          }
        }
      } catch (err) {
        errors.push(
          `Batch ${Math.floor(i / BATCH_SIZE) + 1} LLM call failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  } catch (err) {
    errors.push(`Classification init failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  console.log(
    `[alias-classifier] Done: classified=${classified}, newAliases=${newAliases}, errors=${errors.length}`,
  );
  return { classified, newAliases, errors };
}

/**
 * 对 brand 为空的别名执行批量 brand 推断。
 */
export async function inferMissingBrands(): Promise<{
  updated: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let updated = 0;

  try {
    const aliasesWithoutBrand = await prisma.modelAlias.findMany({
      where: { brand: null },
      select: { id: true, alias: true },
    });

    if (aliasesWithoutBrand.length === 0) {
      return { updated: 0, errors: [] };
    }

    console.log(`[alias-classifier] Inferring brands for ${aliasesWithoutBrand.length} aliases...`);

    const prompt = `以下是 AI 模型的别名列表，请判断每个模型属于哪个厂商。
返回 JSON 对象：key 是别名，value 是品牌名。
品牌名使用官方名称（OpenAI、Anthropic、Google、Meta、Mistral、DeepSeek、智谱 AI 等）。
无法确定则返回 null。

别名列表：
${aliasesWithoutBrand.map((a) => `- ${a.alias}`).join("\n")}

只返回 JSON 对象，不要其他文字。`;

    const rawResponse = await callInternalAI(prompt);

    let brands: Record<string, string | null>;
    try {
      brands = JSON.parse(rawResponse);
    } catch {
      errors.push("Failed to parse brand inference response");
      return { updated: 0, errors };
    }

    for (const alias of aliasesWithoutBrand) {
      const brand = brands[alias.alias];
      if (brand) {
        await prisma.modelAlias.update({
          where: { id: alias.id },
          data: { brand },
        });
        updated++;
      }
    }
  } catch (err) {
    errors.push(`Brand inference failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  console.log(`[alias-classifier] Brand inference done: updated=${updated}`);
  return { updated, errors };
}

/**
 * 对 capabilities 为空的别名执行批量推断。
 * 仅填充空值，不覆盖已有 capabilities。
 */
export async function inferMissingCapabilities(): Promise<{
  updated: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let updated = 0;

  try {
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
      return { updated: 0, errors: [] };
    }

    console.log(
      `[alias-classifier] Inferring capabilities for: ${aliasesWithoutCaps.map((a) => a.alias).join(", ")}`,
    );

    const prompt = `以下是 AI 模型的别名列表，请推断每个模型的能力（capabilities）。

返回 JSON 对象：key 是别名，value 是 capabilities 对象。
每个 capability 为 true 或 false：
- function_calling: 是否支持函数调用/工具使用
- streaming: 是否支持流式输出
- vision: 是否支持图片/视觉输入
- system_prompt: 是否支持系统消息
- json_mode: 是否支持 JSON 结构化输出
- image_input: 是否支持图片输入（与 vision 类似但更广义）

别名列表：
${aliasesWithoutCaps.map((a) => `- ${a.alias}`).join("\n")}

只返回 JSON 对象，不要其他文字。`;

    const rawResponse = await callInternalAI(prompt);

    let results: Record<string, Record<string, boolean>>;
    try {
      results = JSON.parse(rawResponse);
    } catch {
      errors.push("Failed to parse capabilities inference response");
      return { updated: 0, errors };
    }

    for (const alias of aliasesWithoutCaps) {
      const caps = results[alias.alias];
      if (caps && typeof caps === "object") {
        await prisma.modelAlias.update({
          where: { id: alias.id },
          data: { capabilities: caps },
        });
        updated++;
      }
    }
  } catch (err) {
    const msg = `Capabilities inference failed: ${err instanceof Error ? err.message : String(err)}`;
    console.error(`[alias-classifier] ${msg}`);
    errors.push(msg);
  }

  console.log(
    `[alias-classifier] Capabilities inference done: updated=${updated}, errors=${errors.length}${errors.length > 0 ? " — " + errors.join("; ") : ""}`,
  );
  return { updated, errors };
}
