import { PrismaClient, Prisma, Currency } from "@prisma/client";
import { createHash } from "crypto";

const prisma = new PrismaClient();

// ============================================================
// 辅助函数
// ============================================================

function tokenPrice(inputPer1M: number, outputPer1M: number) {
  return { inputPer1M, outputPer1M, unit: "token" };
}

function callPrice(perCall: number) {
  return { perCall, unit: "call" };
}

// 售价 = 成本 × 1.5（50% 加成）
function markup(cost: ReturnType<typeof tokenPrice>, ratio = 1.5) {
  if ("perCall" in cost) {
    return { perCall: +(cost as { perCall: number }).perCall * ratio, unit: "call" };
  }
  const c = cost as { inputPer1M: number; outputPer1M: number; unit: string };
  return {
    inputPer1M: +(c.inputPer1M * ratio).toFixed(4),
    outputPer1M: +(c.outputPer1M * ratio).toFixed(4),
    unit: "token",
  };
}

function markupCall(cost: ReturnType<typeof callPrice>, ratio = 1.5) {
  return { perCall: +(cost.perCall * ratio).toFixed(4), unit: "call" };
}

// ============================================================
// Provider 定义
// ============================================================

const providers = [
  {
    name: "openai",
    displayName: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    authType: "bearer",
    adapterType: "openai-compat",
    config: {
      temperatureMin: 0,
      temperatureMax: 2,
      chatEndpoint: "/chat/completions",
      imageEndpoint: "/images/generations",
      imageViaChat: false,
      supportsModelsApi: true,
      supportsSystemRole: true,
      currency: "USD" as Currency,
      quirks: [],
    },
  },
  {
    name: "anthropic",
    displayName: "Anthropic Claude",
    baseUrl: "https://api.anthropic.com/v1/",
    authType: "bearer",
    adapterType: "openai-compat",
    config: {
      temperatureMin: 0,
      temperatureMax: 1,
      chatEndpoint: "/chat/completions",
      imageEndpoint: null,
      imageViaChat: false,
      supportsModelsApi: false,
      supportsSystemRole: true,
      currency: "USD" as Currency,
      quirks: [
        "no_response_format",
        "no_penalty_params",
        "n_must_be_1",
        "base_url_trailing_slash",
      ],
    },
  },
  {
    name: "deepseek",
    displayName: "DeepSeek",
    baseUrl: "https://api.deepseek.com",
    authType: "bearer",
    adapterType: "openai-compat",
    config: {
      temperatureMin: 0,
      temperatureMax: 2,
      chatEndpoint: "/chat/completions",
      imageEndpoint: null,
      supportsModelsApi: true,
      supportsSystemRole: true,
      currency: "USD" as Currency,
      quirks: [
        "has_reasoning_content",
        "has_cache_hit_tokens",
        "sse_keepalive_comments",
      ],
    },
  },
  {
    name: "zhipu",
    displayName: "智谱 AI",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    authType: "bearer",
    adapterType: "openai-compat",
    config: {
      temperatureMin: 0.01,
      temperatureMax: 0.99,
      chatEndpoint: "/chat/completions",
      imageEndpoint: "/images/generations",
      imageViaChat: false,
      supportsModelsApi: true,
      supportsSystemRole: true,
      currency: "USD" as Currency,
      quirks: ["temperature_open_interval"],
    },
  },
  {
    name: "volcengine",
    displayName: "火山引擎方舟",
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    authType: "bearer",
    adapterType: "volcengine",
    config: {
      temperatureMin: 0,
      temperatureMax: 2,
      chatEndpoint: "/chat/completions",
      imageEndpoint: "/images/generations",
      imageViaChat: true,
      supportsModelsApi: false,
      supportsSystemRole: true,
      currency: "CNY" as Currency,
      quirks: [
        "image_prefer_chat",
        "model_can_be_endpoint_id",
        "multi_size_retry",
        "no_charge_on_image_failure",
      ],
    },
  },
  {
    name: "siliconflow",
    displayName: "硅基流动",
    baseUrl: "https://api.siliconflow.cn/v1",
    authType: "bearer",
    adapterType: "siliconflow",
    config: {
      temperatureMin: 0,
      temperatureMax: 1,
      chatEndpoint: "/chat/completions",
      imageEndpoint: "/images/generations",
      imageViaChat: false,
      supportsModelsApi: true,
      supportsSystemRole: true,
      currency: "CNY" as Currency,
      quirks: [
        "image_response_format_diff",
        "model_id_has_org_prefix",
        "has_reasoning_content",
      ],
    },
  },
  {
    name: "openrouter",
    displayName: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    authType: "bearer",
    adapterType: "openai-compat",
    config: {
      temperatureMin: 0,
      temperatureMax: 2,
      chatEndpoint: "/chat/completions",
      imageEndpoint: null,
      imageViaChat: true,
      supportsModelsApi: true,
      supportsSystemRole: true,
      currency: "USD" as Currency,
      quirks: [
        "models_api_has_pricing",
        "sse_openrouter_comments",
        "image_via_chat_modalities",
      ],
    },
  },
];

// ============================================================
// Model + Channel 定义（按 Provider 分组）
// ============================================================

interface ModelDef {
  name: string;
  displayName: string;
  modality: "TEXT" | "IMAGE";
  maxTokens?: number;
  contextWindow?: number;
  capabilities?: Record<string, boolean>;
  description?: string;
  realModelId: string;
  costPrice: ReturnType<typeof tokenPrice> | ReturnType<typeof callPrice>;
}

const modelsByProvider: Record<string, ModelDef[]> = {
  openai: [
    { name: "openai/gpt-4o", displayName: "GPT-4o", modality: "TEXT", contextWindow: 128000, realModelId: "gpt-4o", costPrice: tokenPrice(2.5, 10.0), capabilities: { vision: true, tools: true, streaming: true } },
    { name: "openai/gpt-4o-mini", displayName: "GPT-4o Mini", modality: "TEXT", contextWindow: 128000, realModelId: "gpt-4o-mini", costPrice: tokenPrice(0.15, 0.60), capabilities: { vision: true, tools: true, streaming: true } },
    { name: "openai/gpt-4.1", displayName: "GPT-4.1", modality: "TEXT", contextWindow: 1000000, realModelId: "gpt-4.1", costPrice: tokenPrice(2.0, 8.0), capabilities: { vision: true, tools: true, streaming: true } },
    { name: "openai/gpt-4.1-mini", displayName: "GPT-4.1 Mini", modality: "TEXT", contextWindow: 1000000, realModelId: "gpt-4.1-mini", costPrice: tokenPrice(0.4, 1.6), capabilities: { tools: true, streaming: true } },
    { name: "openai/gpt-4.1-nano", displayName: "GPT-4.1 Nano", modality: "TEXT", contextWindow: 1000000, realModelId: "gpt-4.1-nano", costPrice: tokenPrice(0.1, 0.4), capabilities: { tools: true, streaming: true } },
    { name: "openai/o4-mini", displayName: "o4-mini", modality: "TEXT", contextWindow: 200000, realModelId: "o4-mini", costPrice: tokenPrice(1.1, 4.4), capabilities: { tools: true, streaming: true }, description: "推理模型" },
    { name: "openai/dall-e-3", displayName: "DALL-E 3", modality: "IMAGE", realModelId: "dall-e-3", costPrice: callPrice(0.04) },
    { name: "openai/gpt-image-1", displayName: "GPT Image 1", modality: "IMAGE", realModelId: "gpt-image-1", costPrice: callPrice(0.011) },
  ],
  anthropic: [
    { name: "anthropic/claude-opus-4.6", displayName: "Claude Opus 4.6", modality: "TEXT", contextWindow: 1000000, realModelId: "claude-opus-4-6", costPrice: tokenPrice(5.0, 25.0), capabilities: { tools: true, streaming: true } },
    { name: "anthropic/claude-sonnet-4.6", displayName: "Claude Sonnet 4.6", modality: "TEXT", contextWindow: 1000000, realModelId: "claude-sonnet-4-6", costPrice: tokenPrice(3.0, 15.0), capabilities: { tools: true, streaming: true } },
    { name: "anthropic/claude-haiku-4.5", displayName: "Claude Haiku 4.5", modality: "TEXT", contextWindow: 200000, realModelId: "claude-haiku-4-5", costPrice: tokenPrice(1.0, 5.0), capabilities: { tools: true, streaming: true } },
  ],
  deepseek: [
    { name: "deepseek/v3", displayName: "DeepSeek V3", modality: "TEXT", contextWindow: 128000, realModelId: "deepseek-chat", costPrice: tokenPrice(0.28, 0.42), capabilities: { tools: true, streaming: true } },
    { name: "deepseek/reasoner", displayName: "DeepSeek Reasoner", modality: "TEXT", contextWindow: 128000, realModelId: "deepseek-reasoner", costPrice: tokenPrice(0.28, 0.42), capabilities: { streaming: true }, description: "推理模型" },
  ],
  zhipu: [
    { name: "zhipu/glm-4.7", displayName: "GLM-4.7", modality: "TEXT", contextWindow: 200000, realModelId: "glm-4.7", costPrice: tokenPrice(0.60, 2.20), capabilities: { tools: true, streaming: true } },
    { name: "zhipu/glm-4.7-flashx", displayName: "GLM-4.7 FlashX", modality: "TEXT", contextWindow: 200000, realModelId: "glm-4.7-flashx", costPrice: tokenPrice(0.07, 0.40), capabilities: { streaming: true } },
    { name: "zhipu/glm-4.7-flash", displayName: "GLM-4.7 Flash", modality: "TEXT", contextWindow: 200000, realModelId: "glm-4.7-flash", costPrice: tokenPrice(0, 0), capabilities: { streaming: true }, description: "免费" },
    { name: "zhipu/glm-5", displayName: "GLM-5", modality: "TEXT", contextWindow: 200000, realModelId: "glm-5", costPrice: tokenPrice(1.0, 3.2), capabilities: { tools: true, streaming: true }, description: "旗舰" },
    { name: "zhipu/cogview-4", displayName: "CogView-4", modality: "IMAGE", realModelId: "cogview-4-250304", costPrice: callPrice(0.01) },
    { name: "zhipu/cogview-3-flash", displayName: "CogView-3 Flash", modality: "IMAGE", realModelId: "cogview-3-flash", costPrice: callPrice(0), description: "免费" },
  ],
  volcengine: [
    { name: "volcengine/doubao-pro", displayName: "豆包 Pro", modality: "TEXT", realModelId: "doubao-1-5-pro-32k-250115", costPrice: tokenPrice(0.11, 0.27), capabilities: { streaming: true }, description: "CNY 价格已按汇率转 USD" },
    { name: "volcengine/doubao-lite", displayName: "豆包 Lite", modality: "TEXT", realModelId: "doubao-lite", costPrice: tokenPrice(0.04, 0.08), capabilities: { streaming: true } },
    { name: "volcengine/seedream-4.5", displayName: "Seedream 4.5", modality: "IMAGE", realModelId: "doubao-seedream-4-5-251128", costPrice: callPrice(0.027), description: "CNY ¥0.20/张" },
    { name: "volcengine/seedream-4.0", displayName: "Seedream 4.0", modality: "IMAGE", realModelId: "doubao-seedream-4-0", costPrice: callPrice(0.027) },
  ],
  siliconflow: [
    { name: "siliconflow/deepseek-v3", displayName: "DeepSeek V3 (硅基)", modality: "TEXT", realModelId: "deepseek-ai/DeepSeek-V3", costPrice: tokenPrice(0.27, 1.10), capabilities: { streaming: true }, description: "CNY 价格已按汇率转 USD" },
    { name: "siliconflow/deepseek-v3.2", displayName: "DeepSeek V3.2 (硅基)", modality: "TEXT", realModelId: "deepseek-ai/DeepSeek-V3.2", costPrice: tokenPrice(0.27, 0.41), capabilities: { streaming: true } },
    { name: "siliconflow/qwen3-8b", displayName: "Qwen3-8B (硅基)", modality: "TEXT", realModelId: "Qwen/Qwen3-8B", costPrice: tokenPrice(0, 0), capabilities: { streaming: true }, description: "免费" },
    { name: "siliconflow/qwen2.5-7b", displayName: "Qwen2.5-7B (硅基)", modality: "TEXT", realModelId: "Qwen/Qwen2.5-7B-Instruct", costPrice: tokenPrice(0, 0), capabilities: { streaming: true }, description: "免费" },
    { name: "siliconflow/kimi-k2.5", displayName: "Kimi K2.5 (硅基)", modality: "TEXT", realModelId: "Pro/moonshotai/Kimi-K2.5", costPrice: tokenPrice(0.55, 2.88), capabilities: { streaming: true } },
    { name: "siliconflow/glm-5", displayName: "GLM-5 (硅基)", modality: "TEXT", realModelId: "Pro/zai-org/GLM-5", costPrice: tokenPrice(0.55, 3.01), capabilities: { streaming: true } },
    { name: "siliconflow/qwen-image", displayName: "Qwen Image (硅基)", modality: "IMAGE", realModelId: "Qwen/Qwen-Image", costPrice: callPrice(0.04) },
  ],
  openrouter: [
    { name: "openrouter/claude-sonnet-4", displayName: "Claude Sonnet 4 (OR)", modality: "TEXT", realModelId: "anthropic/claude-sonnet-4-6", costPrice: tokenPrice(3.0, 15.0), capabilities: { tools: true, streaming: true } },
    { name: "openrouter/gpt-4o", displayName: "GPT-4o (OR)", modality: "TEXT", realModelId: "openai/gpt-4o", costPrice: tokenPrice(2.5, 10.0), capabilities: { tools: true, streaming: true } },
    { name: "openrouter/gemini-flash", displayName: "Gemini Flash (OR)", modality: "TEXT", realModelId: "google/gemini-2.5-flash", costPrice: tokenPrice(0.15, 0.60), capabilities: { streaming: true } },
  ],
};

// ============================================================
// Main seed
// ============================================================

async function main() {
  console.log("Seeding database...");

  // 1. 创建管理员账号
  const adminPasswordHash = createHash("sha256")
    .update("admin123")
    .digest("hex");

  const admin = await prisma.user.upsert({
    where: { email: "admin@aigc-gateway.local" },
    update: {},
    create: {
      email: "admin@aigc-gateway.local",
      passwordHash: adminPasswordHash,
      name: "Admin",
      role: "ADMIN",
      emailVerified: true,
    },
  });
  console.log(`  Admin user: ${admin.email}`);

  // 2. 创建 Provider + ProviderConfig + Model + Channel
  for (const providerDef of providers) {
    const provider = await prisma.provider.upsert({
      where: { name: providerDef.name },
      update: {
        displayName: providerDef.displayName,
        baseUrl: providerDef.baseUrl,
        authType: providerDef.authType,
        adapterType: providerDef.adapterType,
      },
      create: {
        name: providerDef.name,
        displayName: providerDef.displayName,
        baseUrl: providerDef.baseUrl,
        authType: providerDef.authType,
        authConfig: { apiKey: `PLACEHOLDER_${providerDef.name.toUpperCase()}_KEY` },
        adapterType: providerDef.adapterType,
      },
    });
    console.log(`  Provider: ${provider.displayName}`);

    // ProviderConfig
    const { currency, ...configRest } = providerDef.config;
    await prisma.providerConfig.upsert({
      where: { providerId: provider.id },
      update: { ...configRest, currency },
      create: {
        providerId: provider.id,
        ...configRest,
        currency,
      },
    });

    // Models + Channels
    const models = modelsByProvider[providerDef.name] ?? [];
    for (const modelDef of models) {
      const model = await prisma.model.upsert({
        where: { name: modelDef.name },
        update: {
          displayName: modelDef.displayName,
          modality: modelDef.modality,
          maxTokens: modelDef.maxTokens ?? null,
          contextWindow: modelDef.contextWindow ?? null,
          capabilities: modelDef.capabilities ?? Prisma.JsonNull,
          description: modelDef.description ?? null,
        },
        create: {
          name: modelDef.name,
          displayName: modelDef.displayName,
          modality: modelDef.modality,
          maxTokens: modelDef.maxTokens ?? null,
          contextWindow: modelDef.contextWindow ?? null,
          capabilities: modelDef.capabilities ?? Prisma.JsonNull,
          description: modelDef.description ?? null,
        },
      });

      const cost = modelDef.costPrice;
      const sell =
        "perCall" in cost
          ? markupCall(cost as ReturnType<typeof callPrice>)
          : markup(cost as ReturnType<typeof tokenPrice>);

      await prisma.channel.upsert({
        where: {
          providerId_modelId_realModelId: {
            providerId: provider.id,
            modelId: model.id,
            realModelId: modelDef.realModelId,
          },
        },
        update: {
          costPrice: cost,
          sellPrice: sell,
        },
        create: {
          providerId: provider.id,
          modelId: model.id,
          realModelId: modelDef.realModelId,
          priority: 1,
          costPrice: cost,
          sellPrice: sell,
        },
      });
      console.log(`    Model: ${model.name} → Channel: ${modelDef.realModelId}`);
    }
  }

  console.log("\nSeed completed!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
