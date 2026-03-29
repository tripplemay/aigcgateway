/**
 * 示例 4：图片生成
 *
 * npx tsx examples/04-image-generation.ts
 */
import { Gateway } from "../src/index";

const gw = new Gateway({
  apiKey: process.env.GATEWAY_API_KEY ?? "pk_test",
  baseUrl: process.env.GATEWAY_BASE_URL ?? "http://localhost:3000",
});

async function main() {
  console.log("--- 图片生成 ---");

  const img = await gw.image({
    model: "zhipu/cogview-3-flash",
    prompt: "一个友好的卡通机器人老师在教小朋友画水彩画，儿童绘本风格",
    size: "1024x1024",
  });

  console.log("URL:", img.url);
  console.log("TraceId:", img.traceId);
  if (img.revisedPrompt) {
    console.log("Revised Prompt:", img.revisedPrompt);
  }
}

main().catch(console.error);
