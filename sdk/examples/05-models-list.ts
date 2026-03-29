/**
 * 示例 5：获取可用模型列表
 *
 * npx tsx examples/05-models-list.ts
 */
import { Gateway } from "../src/index";
import type { TokenPricing, CallPricing } from "../src/index";

const gw = new Gateway({
  apiKey: process.env.GATEWAY_API_KEY ?? "pk_test",
  baseUrl: process.env.GATEWAY_BASE_URL ?? "http://localhost:3000",
});

async function main() {
  console.log("--- 模型列表 ---\n");

  // 所有模型
  const all = await gw.models();
  console.log(`总计: ${all.length} 个模型\n`);

  // 文本模型
  const text = await gw.models({ modality: "text" });
  console.log(`文本模型 (${text.length}):`);
  for (const m of text) {
    const p = m.pricing as TokenPricing;
    console.log(`  ${m.id.padEnd(35)} ${m.displayName.padEnd(25)} $${p.inputPer1M}/$${p.outputPer1M} per 1M tokens`);
  }

  console.log();

  // 图片模型
  const image = await gw.models({ modality: "image" });
  console.log(`图片模型 (${image.length}):`);
  for (const m of image) {
    const p = m.pricing as CallPricing;
    console.log(`  ${m.id.padEnd(35)} ${m.displayName.padEnd(25)} $${p.perCall}/call`);
  }
}

main().catch(console.error);
