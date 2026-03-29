/**
 * 示例 10：流式中止 — stream.abort()
 *
 * npx tsx examples/10-stream-abort.ts
 */
import { Gateway, ConnectionError } from "../src/index";

const gw = new Gateway({
  apiKey: process.env.GATEWAY_API_KEY ?? "pk_test",
  baseUrl: process.env.GATEWAY_BASE_URL ?? "http://localhost:3000",
});

async function main() {
  console.log("--- 流式中止测试 ---");

  const stream = await gw.chat({
    model: "deepseek/v3",
    messages: [{ role: "user", content: "写一篇500字的文章关于人工智能的未来" }],
    max_tokens: 500,
    stream: true,
  });

  // 2 秒后中止
  const timer = setTimeout(() => {
    console.log("\n[2秒到，执行 abort()]");
    stream.abort();
  }, 2000);

  let charCount = 0;
  try {
    process.stdout.write("Content: ");
    for await (const chunk of stream) {
      process.stdout.write(chunk.content);
      charCount += chunk.content.length;
    }
    clearTimeout(timer);
    console.log("\n⚠️ 流正常结束（未被中止）");
  } catch (e) {
    clearTimeout(timer);
    if (e instanceof ConnectionError && e.cause === "abort") {
      console.log(`\n✅ 流已中止，收到 ${charCount} 个字符`);
      console.log("  error.cause:", e.cause);
    } else {
      console.log("\n⚠️ 非预期错误:", (e as Error).message);
    }
  }
}

main().catch(console.error);
