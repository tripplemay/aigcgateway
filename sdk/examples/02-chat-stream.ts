/**
 * 示例 2：流式文本生成
 *
 * npx tsx examples/02-chat-stream.ts
 */
import { Gateway } from "../src/index";

const gw = new Gateway({
  apiKey: process.env.GATEWAY_API_KEY ?? "pk_test",
  baseUrl: process.env.GATEWAY_BASE_URL ?? "http://localhost:3000",
});

async function main() {
  console.log("--- 流式文本生成 ---");

  const stream = await gw.chat({
    model: "deepseek/v3",
    messages: [{ role: "user", content: "写一首关于春天的短诗，4行" }],
    max_tokens: 200,
    stream: true,
  });

  process.stdout.write("Content: ");
  for await (const chunk of stream) {
    process.stdout.write(chunk.content);
    if (chunk.finishReason) {
      console.log(`\n[finish_reason: ${chunk.finishReason}]`);
    }
  }

  console.log("TraceId:", stream.traceId);
  console.log("Usage:", stream.usage
    ? `${stream.usage.promptTokens}/${stream.usage.completionTokens}/${stream.usage.totalTokens}`
    : "N/A",
  );
}

main().catch(console.error);
