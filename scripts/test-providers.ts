/**
 * 服务商集成测试脚本
 *
 * 用法：npx tsx scripts/test-providers.ts
 *
 * 向 7 家服务商各发一次文本请求 + 图片请求（支持图片的服务商），
 * 输出成功/失败/延迟/token 用量。
 *
 * 前置条件：
 * 1. 数据库已种子（npx tsx prisma/seed.ts）
 * 2. 各服务商 API Key 已在 providers 表 authConfig 中配置（替换 PLACEHOLDER）
 */

import { PrismaClient } from "@prisma/client";
import { resolveEngine } from "../src/lib/engine/index";
import type {
  ChatCompletionResponse,
  ImageGenerationResponse,
} from "../src/lib/engine/types";

const prisma = new PrismaClient();

// ============================================================
// 测试用例定义
// ============================================================

interface TestCase {
  modelName: string;
  type: "text" | "image";
  provider: string;
}

const textTests: TestCase[] = [
  { modelName: "openai/gpt-4o-mini", type: "text", provider: "OpenAI" },
  { modelName: "anthropic/claude-haiku-4.5", type: "text", provider: "Anthropic" },
  { modelName: "deepseek/v3", type: "text", provider: "DeepSeek" },
  { modelName: "zhipu/glm-4.7-flash", type: "text", provider: "智谱" },
  { modelName: "volcengine/doubao-pro", type: "text", provider: "火山引擎" },
  { modelName: "siliconflow/qwen3-8b", type: "text", provider: "硅基流动" },
  { modelName: "openrouter/gemini-flash", type: "text", provider: "OpenRouter" },
];

const imageTests: TestCase[] = [
  { modelName: "openai/dall-e-3", type: "image", provider: "OpenAI" },
  { modelName: "zhipu/cogview-3-flash", type: "image", provider: "智谱" },
  { modelName: "volcengine/seedream-4.5", type: "image", provider: "火山引擎" },
  { modelName: "siliconflow/qwen-image", type: "image", provider: "硅基流动" },
];

// ============================================================
// 测试执行器
// ============================================================

interface TestResult {
  provider: string;
  model: string;
  type: "text" | "image";
  success: boolean;
  latencyMs: number;
  tokens?: { prompt: number; completion: number; total: number };
  imageUrl?: string;
  error?: string;
  adapterType?: string;
}

async function runTextTest(tc: TestCase): Promise<TestResult> {
  const start = Date.now();
  try {
    const { route, adapter } = await resolveEngine(tc.modelName);
    const response: ChatCompletionResponse = await adapter.chatCompletions(
      {
        model: tc.modelName,
        messages: [
          { role: "user", content: "请回答1+1等于几，只回答数字" },
        ],
        max_tokens: 10,
        temperature: 0.1,
      },
      route,
    );

    const latencyMs = Date.now() - start;
    const content = response.choices[0]?.message?.content ?? "";

    return {
      provider: tc.provider,
      model: tc.modelName,
      type: "text",
      success: true,
      latencyMs,
      tokens: response.usage
        ? {
            prompt: response.usage.prompt_tokens,
            completion: response.usage.completion_tokens,
            total: response.usage.total_tokens,
          }
        : undefined,
      adapterType: route.provider.adapterType,
    };
  } catch (error) {
    return {
      provider: tc.provider,
      model: tc.modelName,
      type: "text",
      success: false,
      latencyMs: Date.now() - start,
      error: (error as Error).message,
    };
  }
}

async function runImageTest(tc: TestCase): Promise<TestResult> {
  const start = Date.now();
  try {
    const { route, adapter } = await resolveEngine(tc.modelName);
    const response: ImageGenerationResponse = await adapter.imageGenerations(
      {
        model: tc.modelName,
        prompt: "a red circle on white background",
        n: 1,
      },
      route,
    );

    const latencyMs = Date.now() - start;
    const imageUrl = response.data[0]?.url ?? response.data[0]?.b64_json?.slice(0, 50);

    return {
      provider: tc.provider,
      model: tc.modelName,
      type: "image",
      success: true,
      latencyMs,
      imageUrl: imageUrl ?? "no url",
      adapterType: route.provider.adapterType,
    };
  } catch (error) {
    return {
      provider: tc.provider,
      model: tc.modelName,
      type: "image",
      success: false,
      latencyMs: Date.now() - start,
      error: (error as Error).message,
    };
  }
}

// ============================================================
// Main
// ============================================================

async function main() {
  console.log("=".repeat(80));
  console.log("AIGC Gateway — 服务商集成测试");
  console.log("=".repeat(80));
  console.log();

  // 检查 API Key 是否已配置
  const providers = await prisma.provider.findMany({
    select: { name: true, authConfig: true },
    orderBy: { name: "asc" },
  });

  console.log("--- API Key 配置状态 ---");
  for (const p of providers) {
    const config = p.authConfig as { apiKey?: string };
    const hasKey = config?.apiKey && !config.apiKey.startsWith("PLACEHOLDER");
    console.log(`  ${p.name}: ${hasKey ? "✅ 已配置" : "⚠️  未配置（PLACEHOLDER）"}`);
  }
  console.log();

  // 文本测试
  console.log("--- 文本请求测试 ---");
  const textResults: TestResult[] = [];
  for (const tc of textTests) {
    process.stdout.write(`  ${tc.provider} (${tc.modelName})... `);
    const result = await runTextTest(tc);
    textResults.push(result);
    if (result.success) {
      const tokens = result.tokens
        ? `${result.tokens.prompt}/${result.tokens.completion}/${result.tokens.total} tokens`
        : "no usage";
      console.log(`✅ ${result.latencyMs}ms | ${tokens} | adapter: ${result.adapterType}`);
    } else {
      console.log(`❌ ${result.latencyMs}ms | ${result.error}`);
    }
  }
  console.log();

  // 图片测试
  console.log("--- 图片请求测试 ---");
  const imageResults: TestResult[] = [];
  for (const tc of imageTests) {
    process.stdout.write(`  ${tc.provider} (${tc.modelName})... `);
    const result = await runImageTest(tc);
    imageResults.push(result);
    if (result.success) {
      const url = result.imageUrl
        ? result.imageUrl.slice(0, 80) + (result.imageUrl.length > 80 ? "..." : "")
        : "no url";
      console.log(`✅ ${result.latencyMs}ms | ${url}`);
    } else {
      console.log(`❌ ${result.latencyMs}ms | ${result.error}`);
    }
  }
  console.log();

  // 汇总
  const all = [...textResults, ...imageResults];
  const passed = all.filter((r) => r.success).length;
  const failed = all.filter((r) => !r.success).length;

  console.log("=".repeat(80));
  console.log(`总计: ${all.length} 项 | ✅ ${passed} 通过 | ❌ ${failed} 失败`);
  console.log("=".repeat(80));
}

main()
  .catch((e) => {
    console.error("Fatal error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
