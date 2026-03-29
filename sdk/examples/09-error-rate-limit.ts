/**
 * 示例 9：错误处理 — RateLimitError（限流）
 *
 * 快速连续发送请求触发限流
 *
 * npx tsx examples/09-error-rate-limit.ts
 */
import { Gateway, RateLimitError, GatewayError } from "../src/index";

const gw = new Gateway({
  apiKey: process.env.GATEWAY_API_KEY ?? "pk_test",
  baseUrl: process.env.GATEWAY_BASE_URL ?? "http://localhost:3000",
  retry: { maxRetries: 0 }, // 禁用重试，直接看到 429
});

async function main() {
  console.log("--- RateLimitError 测试 ---");
  console.log("快速发送 100 个请求以触发限流...\n");

  const promises = Array.from({ length: 100 }, (_, i) =>
    gw.chat({
      model: "deepseek/v3",
      messages: [{ role: "user", content: `test ${i}` }],
      max_tokens: 1,
    }).catch((e: unknown) => e),
  );

  const results = await Promise.all(promises);
  const rateLimitErrors = results.filter((r) => r instanceof RateLimitError);
  const successes = results.filter((r) => !(r instanceof Error));

  console.log(`成功: ${successes.length}`);
  console.log(`限流 (429): ${rateLimitErrors.length}`);

  if (rateLimitErrors.length > 0) {
    const first = rateLimitErrors[0] as RateLimitError;
    console.log("\n✅ RateLimitError 示例:");
    console.log("  status:", first.status);
    console.log("  code:", first.code);
    console.log("  retryAfter:", first.retryAfter, "秒");
    console.log("  message:", first.message);
  } else {
    console.log("\n⚠️ 未触发限流（RPM 可能设置较高）");
  }
}

main().catch(console.error);
