import { PrismaClient, Prisma, Currency } from "@prisma/client";
import { hashSync } from "bcryptjs";

const prisma = new PrismaClient();

// ============================================================
// Provider 定义（Model/Channel 由同步引擎自动创建）
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
      staticModels: null,
      pricingOverrides: {
        "gpt-4o": { inputPricePerM: 2.5, outputPricePerM: 10.0, contextWindow: 128000 },
        "gpt-4o-mini": { inputPricePerM: 0.15, outputPricePerM: 0.6, contextWindow: 128000 },
        "gpt-4.1": { inputPricePerM: 2.0, outputPricePerM: 8.0, contextWindow: 1048576 },
        "gpt-4.1-mini": { inputPricePerM: 0.4, outputPricePerM: 1.6, contextWindow: 1048576 },
        "gpt-4.1-nano": { inputPricePerM: 0.1, outputPricePerM: 0.4, contextWindow: 1048576 },
        o3: { inputPricePerM: 2.0, outputPricePerM: 8.0, contextWindow: 200000 },
        "o3-mini": { inputPricePerM: 1.1, outputPricePerM: 4.4, contextWindow: 200000 },
        "o4-mini": { inputPricePerM: 1.1, outputPricePerM: 4.4, contextWindow: 200000 },
        "dall-e-3": { modality: "image" },
      },
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
      supportsModelsApi: true,
      supportsSystemRole: true,
      currency: "USD" as Currency,
      quirks: ["no_response_format", "no_penalty_params", "n_must_be_1", "base_url_trailing_slash"],
      staticModels: null,
      pricingOverrides: {
        "claude-opus-4-6": { inputPricePerM: 5.0, outputPricePerM: 25.0 },
        "claude-sonnet-4-6": { inputPricePerM: 3.0, outputPricePerM: 15.0 },
        "claude-haiku-4-5": { inputPricePerM: 1.0, outputPricePerM: 5.0 },
      },
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
      quirks: ["has_reasoning_content", "has_cache_hit_tokens", "sse_keepalive_comments"],
      staticModels: null,
      pricingOverrides: {
        "deepseek-chat": {
          inputPricePerM: 0.28,
          outputPricePerM: 0.42,
          contextWindow: 131072,
          displayName: "DeepSeek V3.2",
        },
        "deepseek-reasoner": {
          inputPricePerM: 0.28,
          outputPricePerM: 0.42,
          contextWindow: 131072,
          displayName: "DeepSeek R1 (Thinking)",
        },
      },
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
      staticModels: null,
      pricingOverrides: {
        "glm-4-plus": { inputPriceCNYPerM: 50, outputPriceCNYPerM: 50, contextWindow: 128000 },
        "glm-4-air": { inputPriceCNYPerM: 1, outputPriceCNYPerM: 1, contextWindow: 128000 },
        "glm-4-airx": { inputPriceCNYPerM: 10, outputPriceCNYPerM: 10, contextWindow: 8192 },
        "glm-4-flash": { inputPriceCNYPerM: 0, outputPriceCNYPerM: 0, contextWindow: 128000 },
        "glm-4-flashx": { inputPriceCNYPerM: 0.1, outputPriceCNYPerM: 0.1, contextWindow: 128000 },
        "glm-4-long": { inputPriceCNYPerM: 1, outputPriceCNYPerM: 1, contextWindow: 1048576 },
        "cogview-3-plus": { modality: "image" },
      },
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
      staticModels: [
        {
          id: "doubao-1.5-pro-256k",
          displayName: "豆包 1.5 Pro 256K",
          modality: "TEXT",
          contextWindow: 262144,
          inputPriceCNYPerM: 0.8,
          outputPriceCNYPerM: 2,
        },
        {
          id: "doubao-1.5-pro-32k",
          displayName: "豆包 1.5 Pro 32K",
          modality: "TEXT",
          contextWindow: 32768,
          inputPriceCNYPerM: 0.4,
          outputPriceCNYPerM: 2,
        },
        {
          id: "doubao-lite-128k",
          displayName: "豆包 Lite 128K",
          modality: "TEXT",
          contextWindow: 131072,
          inputPriceCNYPerM: 0.3,
          outputPriceCNYPerM: 1,
        },
        {
          id: "doubao-pro-256k",
          displayName: "豆包 Pro 256K",
          modality: "TEXT",
          contextWindow: 262144,
          inputPriceCNYPerM: 0.5,
          outputPriceCNYPerM: 2,
        },
        { id: "seedream-3.0", displayName: "Seedream 3.0", modality: "IMAGE" },
        { id: "seedream-4.0", displayName: "Seedream 4.0", modality: "IMAGE" },
        { id: "seedream-4.5", displayName: "Seedream 4.5", modality: "IMAGE" },
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
      quirks: ["image_response_format_diff", "model_id_has_org_prefix", "has_reasoning_content"],
      staticModels: null,
      pricingOverrides: null,
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
      quirks: ["models_api_has_pricing", "sse_openrouter_comments", "image_via_chat_modalities"],
      staticModels: null,
      pricingOverrides: null,
    },
  },
];

// ============================================================
// Main seed
// ============================================================

async function main() {
  console.log("Seeding database...");

  // 1. 创建管理员账号（bcrypt 哈希，与登录接口一致）
  const adminPasswordHash = hashSync("admin123", 12);

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

  // 2. 系统配置
  await prisma.systemConfig.upsert({
    where: { key: "DEFAULT_MARKUP_RATIO" },
    update: {},
    create: {
      key: "DEFAULT_MARKUP_RATIO",
      value: "1.2",
      description: "默认加价比例，sellPrice = costPrice × ratio",
    },
  });
  console.log("  SystemConfig: DEFAULT_MARKUP_RATIO = 1.2");

  // 3. 创建 Provider + ProviderConfig（不再创建 Model/Channel，由同步引擎处理）
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
        authConfig: {
          apiKey: `PLACEHOLDER_${providerDef.name.toUpperCase()}_KEY`,
        },
        adapterType: providerDef.adapterType,
      },
    });
    console.log(`  Provider: ${provider.displayName}`);

    // ProviderConfig（含 staticModels + pricingOverrides）
    const { currency, staticModels, pricingOverrides, ...configRest } = providerDef.config;
    const staticModelsValue = staticModels === null ? Prisma.JsonNull : staticModels;
    const pricingOverridesValue = pricingOverrides ? pricingOverrides : Prisma.JsonNull;
    await prisma.providerConfig.upsert({
      where: { providerId: provider.id },
      update: {
        ...configRest,
        currency,
        staticModels: staticModelsValue,
        pricingOverrides: pricingOverridesValue,
      },
      create: {
        providerId: provider.id,
        ...configRest,
        currency,
        staticModels: staticModelsValue,
        pricingOverrides: pricingOverridesValue,
      },
    });
  }

  console.log("\nSeed completed! (Model/Channel will be created by model sync on startup)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
