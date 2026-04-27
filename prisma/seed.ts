import { PrismaClient, Prisma, Currency } from "@prisma/client";
import { hashSync } from "bcryptjs";

const prisma = new PrismaClient();

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(
      `${key} is required for seed — set it before running \`npx tsx prisma/seed.ts\``,
    );
  }
  return value;
}

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
      healthCheckEndpoint: "skip",
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
    baseUrl: "https://api.minimaxi.com/v1",
    authType: "bearer",
    adapterType: "openai-compat",
    config: {
      temperatureMin: 0,
      temperatureMax: 2,
      chatEndpoint: "/chat/completions",
      imageEndpoint: null,
      imageViaChat: false,
      supportsModelsApi: true,
      healthCheckEndpoint: "skip",
      supportsSystemRole: true,
      currency: "CNY" as Currency,
      quirks: ["penalty_params_ignored"],
      staticModels: [
        { id: "MiniMax-Text-01", displayName: "MiniMax-Text-01" },
        { id: "abab6.5s-chat", displayName: "abab6.5s-chat" },
        { id: "abab6.5-chat", displayName: "abab6.5-chat" },
        { id: "abab5.5-chat", displayName: "abab5.5-chat" },
      ],
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
  // 密码从 ADMIN_SEED_PASSWORD env 注入，缺失时 throw；upsert update 块留空保留幂等性（已存在 admin 不重置）
  const adminPasswordHash = hashSync(requireEnv("ADMIN_SEED_PASSWORD"), 12);

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

  await prisma.systemConfig.upsert({
    where: { key: "USD_TO_CNY_RATE" },
    update: {},
    create: {
      key: "USD_TO_CNY_RATE",
      value: "7.3",
      description: "USD 转 CNY 汇率，用于全站人民币显示",
    },
  });
  console.log("  SystemConfig: USD_TO_CNY_RATE = 7.3");

  // BL-RECON-UX-PHASE1 F-RC-01d — 对账阈值，幂等 upsert（已存在不覆盖管理员的修改）
  const recoThresholds: Array<[string, string, string]> = [
    [
      "RECONCILIATION_MATCH_DELTA_USD",
      "0.5",
      "对账 MATCH 判定：|delta|（USD）<此值视为匹配；下次重跑生效",
    ],
    ["RECONCILIATION_MATCH_PERCENT", "5", "对账 MATCH 判定：|百分比| <此值视为匹配；下次重跑生效"],
    [
      "RECONCILIATION_MINOR_DELTA_USD",
      "5",
      "对账 MINOR_DIFF 判定：|delta|（USD）<此值视为小差异；下次重跑生效",
    ],
    [
      "RECONCILIATION_MINOR_PERCENT",
      "20",
      "对账 MINOR_DIFF 判定：|百分比| <此值视为小差异；下次重跑生效",
    ],
  ];
  for (const [key, value, description] of recoThresholds) {
    await prisma.systemConfig.upsert({
      where: { key },
      update: {},
      create: { key, value, description },
    });
    console.log(`  SystemConfig: ${key} = ${value}`);
  }

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
          apiKey: "",
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

  // BL-EMBEDDING-MVP F-EM-04 — embedding 模型 + channel 幂等 upsert
  // 注：其他 modality 的 model/channel 由 startup sync 拉取；embedding 是新增
  // modality 上游目前不返回该列表，由此 seed 显式注入。
  // 价格来源：spec § F-EM-04 — bge-m3 ¥0.5/M ≈ $0.07/M、text-embedding-3-small $0.02/M
  // markup ratio 1.2x（与 DEFAULT_MARKUP_RATIO 一致）
  const embeddingSeeds: Array<{
    modelName: string;
    displayName: string;
    description: string;
    contextWindow: number;
    providerName: string;
    realModelId: string;
    costInputPer1M: number;
    sellInputPer1M: number;
  }> = [
    {
      modelName: "bge-m3",
      displayName: "BGE-M3",
      description:
        "Multilingual embedding model by BAAI (1024 dims). Optimized for Chinese/Japanese/Korean. Hosted on SiliconFlow.",
      contextWindow: 8192,
      providerName: "siliconflow",
      realModelId: "BAAI/bge-m3",
      costInputPer1M: 0.07, // ¥0.5/M ÷ 7.3 ≈ $0.0685, round to 0.07
      sellInputPer1M: 0.084, // 1.2x markup
    },
    {
      modelName: "text-embedding-3-small",
      displayName: "OpenAI text-embedding-3-small",
      description:
        "Compact, performant English-first embedding model (1536 dims). Hosted on OpenAI.",
      contextWindow: 8191,
      providerName: "openai",
      realModelId: "text-embedding-3-small",
      costInputPer1M: 0.02,
      sellInputPer1M: 0.024, // 1.2x markup
    },
  ];

  for (const def of embeddingSeeds) {
    const provider = await prisma.provider.findUnique({ where: { name: def.providerName } });
    if (!provider) {
      console.log(`  ⚠ Provider ${def.providerName} not found, skipping ${def.modelName} seed`);
      continue;
    }

    const model = await prisma.model.upsert({
      where: { name: def.modelName },
      update: {
        displayName: def.displayName,
        description: def.description,
        modality: "EMBEDDING",
        contextWindow: def.contextWindow,
        enabled: true,
      },
      create: {
        name: def.modelName,
        displayName: def.displayName,
        description: def.description,
        modality: "EMBEDDING",
        contextWindow: def.contextWindow,
        enabled: true,
      },
    });

    await prisma.channel.upsert({
      where: { providerId_modelId: { providerId: provider.id, modelId: model.id } },
      update: {
        realModelId: def.realModelId,
        costPrice: { unit: "token", inputPer1M: def.costInputPer1M, outputPer1M: 0 },
        sellPrice: { unit: "token", inputPer1M: def.sellInputPer1M, outputPer1M: 0 },
        status: "ACTIVE",
      },
      create: {
        providerId: provider.id,
        modelId: model.id,
        realModelId: def.realModelId,
        priority: 1,
        costPrice: { unit: "token", inputPer1M: def.costInputPer1M, outputPer1M: 0 },
        sellPrice: { unit: "token", inputPer1M: def.sellInputPer1M, outputPer1M: 0 },
        status: "ACTIVE",
      },
    });

    // ModelAlias + AliasModelLink — 让 /v1/models?modality=embedding 能查到
    const alias = await prisma.modelAlias.upsert({
      where: { alias: def.modelName },
      update: {
        enabled: true,
        modality: "EMBEDDING",
        contextWindow: def.contextWindow,
        sellPrice: { unit: "token", inputPer1M: def.sellInputPer1M, outputPer1M: 0 },
      },
      create: {
        alias: def.modelName,
        brand: def.providerName === "siliconflow" ? "BAAI" : "OpenAI",
        modality: "EMBEDDING",
        enabled: true,
        contextWindow: def.contextWindow,
        sellPrice: { unit: "token", inputPer1M: def.sellInputPer1M, outputPer1M: 0 },
        description: def.description,
      },
    });
    await prisma.aliasModelLink.upsert({
      where: { aliasId_modelId: { aliasId: alias.id, modelId: model.id } },
      update: {},
      create: { aliasId: alias.id, modelId: model.id },
    });

    console.log(`  Embedding model: ${def.modelName} → ${def.providerName}/${def.realModelId}`);
  }

  // 4. 平台公共模板（projectId=null）
  console.log(
    "\nSeed completed! (Model/Channel for non-embedding modalities will be created by model sync on startup)",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
