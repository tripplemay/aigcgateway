/**
 * 示例 1：非流式文本生成
 *
 * npx tsx examples/01-chat-basic.ts
 */
import { Gateway } from "../src/index";

const gw = new Gateway({
  apiKey: process.env.GATEWAY_API_KEY ?? "pk_test",
  baseUrl: process.env.GATEWAY_BASE_URL ?? "http://localhost:3000",
});

async function main() {
  const res = await gw.chat({
    model: "deepseek/v3",
    messages: [
      { role: "system", content: "你是一个课程设计专家。" },
      { role: "user", content: "设计一个12周的机器人课程框架，只列出每周标题" },
    ],
    temperature: 0.7,
    max_tokens: 512,
  });

  console.log("--- 非流式文本生成 ---");
  console.log("Content:", res.content);
  console.log("TraceId:", res.traceId);
  console.log("FinishReason:", res.finishReason);
  console.log("Usage:", {
    prompt: res.usage.promptTokens,
    completion: res.usage.completionTokens,
    total: res.usage.totalTokens,
  });
}

main().catch(console.error);
