/**
 * 示例 3：stream.collect() — 流式收集为完整响应
 *
 * npx tsx examples/03-stream-collect.ts
 */
import { Gateway } from "../src/index";

const gw = new Gateway({
  apiKey: process.env.GATEWAY_API_KEY ?? "pk_test",
  baseUrl: process.env.GATEWAY_BASE_URL ?? "http://localhost:3000",
});

async function main() {
  console.log("--- stream.collect() ---");

  const stream = await gw.chat({
    model: "deepseek/v3",
    messages: [{ role: "user", content: "用一句话解释量子计算" }],
    max_tokens: 100,
    stream: true,
  });

  // 不逐 chunk 处理，直接收集为完整 ChatResponse
  const res = await stream.collect();

  console.log("Content:", res.content);
  console.log("TraceId:", res.traceId);
  console.log("FinishReason:", res.finishReason);
  console.log("Usage:", res.usage);
}

main().catch(console.error);
