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
      pricingOverrides: null,
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
  const templateSeeds = [
    {
      name: "通用翻译助手",
      description: "将任意文本翻译为目标语言，支持自定义语气风格",
      category: "translation",
      messages: [
        {
          role: "system",
          content:
            "你是一个专业翻译，请将用户的文本翻译为{{target_language}}。语气风格：{{tone}}。只输出翻译结果，不要解释。",
        },
        { role: "user", content: "{{text}}" },
      ],
      variables: [
        { name: "target_language", description: "目标语言，如 English、日本語", required: true },
        {
          name: "tone",
          description: "语气风格，如 正式、口语化、学术",
          required: false,
          defaultValue: "正式",
        },
        { name: "text", description: "待翻译的文本", required: true },
      ],
    },
    {
      name: "代码审查专家",
      description: "对代码片段进行审查，给出改进建议",
      category: "development",
      messages: [
        {
          role: "system",
          content:
            "你是一位资深{{language}}开发者。请对以下代码进行审查，从代码质量、安全性、性能三个维度给出改进建议。用中文回答。",
        },
        { role: "user", content: "```{{language}}\n{{code}}\n```" },
      ],
      variables: [
        { name: "language", description: "编程语言，如 TypeScript、Python、Go", required: true },
        { name: "code", description: "待审查的代码片段", required: true },
      ],
    },
    {
      name: "内容摘要生成",
      description: "将长文本压缩为指定长度的摘要",
      category: "writing",
      messages: [
        {
          role: "system",
          content:
            "请将以下内容压缩为不超过{{max_words}}字的摘要。保留核心观点，使用{{style}}风格。",
        },
        { role: "user", content: "{{content}}" },
      ],
      variables: [
        { name: "max_words", description: "摘要最大字数", required: false, defaultValue: "200" },
        {
          name: "style",
          description: "摘要风格，如 新闻简报、技术摘要、通俗易懂",
          required: false,
          defaultValue: "通俗易懂",
        },
        { name: "content", description: "待摘要的长文本", required: true },
      ],
    },
  ];

  for (const tpl of templateSeeds) {
    const existing = await prisma.template.findFirst({
      where: { projectId: null, name: tpl.name },
    });
    if (!existing) {
      const template = await prisma.template.create({
        data: {
          projectId: null,
          name: tpl.name,
          description: tpl.description,
          category: tpl.category,
          createdBy: admin.id,
        },
      });
      const version = await prisma.templateVersion.create({
        data: {
          templateId: template.id,
          versionNumber: 1,
          messages: tpl.messages,
          variables: tpl.variables,
          changelog: "初始版本",
        },
      });
      await prisma.template.update({
        where: { id: template.id },
        data: { activeVersionId: version.id },
      });
      console.log(`  Template: ${tpl.name} (v1)`);
    } else {
      console.log(`  Template: ${tpl.name} (already exists)`);
    }
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
