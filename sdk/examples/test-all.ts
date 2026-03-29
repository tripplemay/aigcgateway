/**
 * SDK 全场景测试脚本
 *
 * 用法：
 *   cd sdk && npx tsx examples/test-all.ts
 *
 * 环境变量：
 *   GATEWAY_API_KEY=pk_xxx
 *   GATEWAY_BASE_URL=http://localhost:3000  (默认)
 */

import {
  Gateway,
  GatewayError,
  AuthError,
  InsufficientBalanceError,
  RateLimitError,
  ProviderError,
  ModelNotFoundError,
  NoChannelError,
  ContentFilteredError,
  ConnectionError,
} from "../src/index";

const API_KEY = process.env.GATEWAY_API_KEY ?? "pk_test_key";
const BASE_URL = process.env.GATEWAY_BASE_URL ?? "http://localhost:3000";

const gw = new Gateway({ apiKey: API_KEY, baseUrl: BASE_URL, timeout: 60000 });

async function main() {
  console.log("=".repeat(70));
  console.log("AIGC Gateway SDK — 全场景测试");
  console.log(`Base URL: ${BASE_URL}`);
  console.log("=".repeat(70));
  console.log();

  // 1. 非流式文本生成
  await test("1. 非流式文本生成", async () => {
    const res = await gw.chat({
      model: "deepseek/v3",
      messages: [{ role: "user", content: "1+1=?" }],
      max_tokens: 10,
    });
    console.log(`  content: "${res.content}"`);
    console.log(`  traceId: ${res.traceId}`);
    console.log(`  finishReason: ${res.finishReason}`);
    console.log(`  usage: ${res.usage.promptTokens}/${res.usage.completionTokens}/${res.usage.totalTokens}`);
  });

  // 2. 流式文本生成
  await test("2. 流式文本生成", async () => {
    const stream = await gw.chat({
      model: "deepseek/v3",
      messages: [{ role: "user", content: "说三个水果名" }],
      max_tokens: 50,
      stream: true,
    });
    process.stdout.write("  content: ");
    for await (const chunk of stream) {
      process.stdout.write(chunk.content);
    }
    console.log();
    console.log(`  traceId: ${stream.traceId}`);
    console.log(`  usage: ${stream.usage?.totalTokens ?? "N/A"} tokens`);
  });

  // 3. stream.collect()
  await test("3. stream.collect()", async () => {
    const stream = await gw.chat({
      model: "deepseek/v3",
      messages: [{ role: "user", content: "Hi" }],
      max_tokens: 10,
      stream: true,
    });
    const res = await stream.collect();
    console.log(`  content: "${res.content}"`);
    console.log(`  traceId: ${res.traceId}`);
  });

  // 4. 图片生成
  await test("4. 图片生成", async () => {
    const img = await gw.image({
      model: "zhipu/cogview-3-flash",
      prompt: "a red circle on white background",
    });
    console.log(`  url: ${img.url?.slice(0, 80)}...`);
    console.log(`  traceId: ${img.traceId}`);
  });

  // 5. 模型列表
  await test("5. models()", async () => {
    const all = await gw.models();
    console.log(`  total: ${all.length} models`);

    const text = await gw.models({ modality: "text" });
    console.log(`  text: ${text.length} models`);

    const image = await gw.models({ modality: "image" });
    console.log(`  image: ${image.length} models`);

    if (all.length > 0) {
      const m = all[0];
      console.log(`  first: ${m.id} — ${m.displayName} — ${m.modality}`);
    }
  });

  // 6. 错误：无效 API Key
  await test("6. AuthError (无效 Key)", async () => {
    const badGw = new Gateway({ apiKey: "pk_invalid", baseUrl: BASE_URL });
    try {
      await badGw.chat({
        model: "deepseek/v3",
        messages: [{ role: "user", content: "test" }],
      });
      console.log("  ❌ 应该抛错");
    } catch (e) {
      if (e instanceof AuthError) {
        console.log(`  ✅ AuthError: ${e.message}`);
      } else {
        console.log(`  ⚠️  非预期错误: ${(e as Error).constructor.name}: ${(e as Error).message}`);
      }
    }
  });

  // 7. 错误：不存在的模型
  await test("7. ModelNotFoundError", async () => {
    try {
      await gw.chat({
        model: "nonexistent/model",
        messages: [{ role: "user", content: "test" }],
      });
      console.log("  ❌ 应该抛错");
    } catch (e) {
      if (e instanceof ModelNotFoundError) {
        console.log(`  ✅ ModelNotFoundError: ${e.message}`);
      } else if (e instanceof GatewayError) {
        console.log(`  ⚠️  GatewayError(${e.code}): ${e.message}`);
      } else {
        console.log(`  ⚠️  ${(e as Error).constructor.name}: ${(e as Error).message}`);
      }
    }
  });

  console.log();
  console.log("=".repeat(70));
  console.log("测试完成");
  console.log("=".repeat(70));
}

async function test(name: string, fn: () => Promise<void>) {
  console.log(`--- ${name} ---`);
  try {
    await fn();
  } catch (e) {
    console.log(`  ❌ 未捕获错误: ${(e as Error).constructor.name}: ${(e as Error).message}`);
  }
  console.log();
}

main().catch(console.error);
