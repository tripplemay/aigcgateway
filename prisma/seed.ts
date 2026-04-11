import { PrismaClient, Prisma, Currency } from "@prisma/client";
import { hashSync } from "bcryptjs";

const prisma = new PrismaClient();

// ============================================================
// Provider 定义
//
// 数据策略 — 通过 Jina Reader 渲染 SPA 页面，AI 自动提取定价：
//   OpenAI:     /models API + AI 读文档自动补价格
//   Anthropic:  /models API + AI 读文档自动补价格
//   DeepSeek:   /models API + AI 读文档自动补价格
//   智谱:       /models API + AI 读文档自动补价格
//   火山引擎:   无 /models API，AI 读文档自动提取全部模型+价格
//   硅基流动:   /models API + AI 读文档自动补价格
//   OpenRouter: /models API 含完整价格，不需要 AI 补充
//
// pricingOverrides 保留但不预填 — 仅作为运营手动修正入口
// staticModels 保留但不预填 — 火山引擎改由 AI 从文档自动发现
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
      pricingOverrides: null,
      docUrls: ["https://platform.openai.com/docs/pricing"],
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
      pricingOverrides: null,
      docUrls: ["https://docs.anthropic.com/en/docs/about-claude/models"],
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
      pricingOverrides: null,
      docUrls: ["https://api-docs.deepseek.com/quick_start/pricing"],
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
      pricingOverrides: null,
      docUrls: ["https://open.bigmodel.cn/pricing"],
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
      staticModels: null,
      pricingOverrides: null,
      docUrls: ["https://www.volcengine.com/docs/82379/1399008"],
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
      // SiliconFlow AI doc-enricher 提取不稳定，手动补充主要模型定价（CNY/百万 token）
      // 字段名须与 PricingOverride 接口一致：inputPriceCNYPerM / outputPriceCNYPerM
      pricingOverrides: {
        "Qwen/Qwen2.5-72B-Instruct": { inputPriceCNYPerM: 4.13, outputPriceCNYPerM: 4.13 },
        "Qwen/Qwen2.5-32B-Instruct": { inputPriceCNYPerM: 1.26, outputPriceCNYPerM: 1.26 },
        "Qwen/Qwen2.5-7B-Instruct": { inputPriceCNYPerM: 0.35, outputPriceCNYPerM: 0.35 },
        "Qwen/QwQ-32B": { inputPriceCNYPerM: 1.26, outputPriceCNYPerM: 1.26 },
        "deepseek-ai/DeepSeek-R1": { inputPriceCNYPerM: 4.0, outputPriceCNYPerM: 16.0 },
        "deepseek-ai/DeepSeek-V3": { inputPriceCNYPerM: 2.0, outputPriceCNYPerM: 8.0 },
      },
      docUrls: ["https://siliconflow.cn/pricing"],
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
      docUrls: null,
    },
  },
  {
    name: "minimax",
    displayName: "MiniMax",
    baseUrl: "https://api.minimax.io/v1",
    authType: "bearer",
    adapterType: "openai-compat",
    config: {
      temperatureMin: 0,
      temperatureMax: 2,
      chatEndpoint: "/chat/completions",
      imageEndpoint: null,
      imageViaChat: false,
      supportsModelsApi: true,
      supportsSystemRole: true,
      currency: "CNY" as Currency,
      quirks: ["penalty_params_ignored"],
      staticModels: null,
      pricingOverrides: null,
      docUrls: ["https://platform.minimaxi.com/document/Price"],
    },
  },
  {
    name: "moonshot",
    displayName: "Moonshot/Kimi",
    baseUrl: "https://api.moonshot.cn/v1",
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
      currency: "CNY" as Currency,
      quirks: [],
      staticModels: null,
      pricingOverrides: null,
      docUrls: ["https://platform.moonshot.cn/docs/pricing"],
    },
  },
  {
    name: "qwen",
    displayName: "阿里云百炼/Qwen",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    authType: "bearer",
    adapterType: "openai-compat",
    config: {
      temperatureMin: 0,
      temperatureMax: 2,
      chatEndpoint: "/chat/completions",
      imageEndpoint: null,
      imageViaChat: false,
      supportsModelsApi: true,
      supportsSystemRole: true,
      currency: "CNY" as Currency,
      quirks: [],
      staticModels: null,
      pricingOverrides: null,
      docUrls: ["https://help.aliyun.com/zh/model-studio/billing"],
    },
  },
  {
    name: "stepfun",
    displayName: "阶跃星辰/StepFun",
    baseUrl: "https://api.stepfun.com/v1",
    authType: "bearer",
    adapterType: "openai-compat",
    config: {
      temperatureMin: 0,
      temperatureMax: 2,
      chatEndpoint: "/chat/completions",
      imageEndpoint: null,
      imageViaChat: false,
      supportsModelsApi: true,
      supportsSystemRole: true,
      currency: "CNY" as Currency,
      quirks: [],
      staticModels: null,
      pricingOverrides: null,
      docUrls: ["https://platform.stepfun.com/docs/pricing"],
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

  // 3. 创建 Provider + ProviderConfig
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

    const { currency, staticModels, pricingOverrides, docUrls, ...configRest } = providerDef.config;
    await prisma.providerConfig.upsert({
      where: { providerId: provider.id },
      update: {
        ...configRest,
        currency,
        staticModels: staticModels === null ? Prisma.JsonNull : staticModels,
        pricingOverrides: pricingOverrides === null ? Prisma.JsonNull : pricingOverrides,
        docUrls: docUrls === null ? Prisma.JsonNull : docUrls,
      },
      create: {
        providerId: provider.id,
        ...configRest,
        currency,
        staticModels: staticModels === null ? Prisma.JsonNull : staticModels,
        pricingOverrides: pricingOverrides === null ? Prisma.JsonNull : pricingOverrides,
        docUrls: docUrls === null ? Prisma.JsonNull : docUrls,
      },
    });
  }

  // 4. 平台公共模板（projectId=null）
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
