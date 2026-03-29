/**
 * 7家服务商全量验证
 *
 * 遍历所有 ACTIVE 通道，文本发一次调用，图片发一次生成
 * 需要各服务商 API Key 已配置
 *
 * 用法：npx tsx scripts/verify-providers.ts
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { resolveEngine } from "../src/lib/engine/index";

const prisma = new PrismaClient();

interface Result {
  model: string;
  provider: string;
  modality: string;
  status: "PASS" | "FAIL";
  latencyMs: number;
  error?: string;
}

async function main() {
  console.log("=".repeat(70));
  console.log("AIGC Gateway — Provider Full Verification");
  console.log("=".repeat(70));

  const channels = await prisma.channel.findMany({
    where: { status: "ACTIVE" },
    include: {
      provider: { select: { name: true, displayName: true } },
      model: { select: { name: true, modality: true } },
    },
    orderBy: [{ provider: { name: "asc" } }, { model: { name: "asc" } }],
  });

  console.log(`Found ${channels.length} active channels\n`);

  const results: Result[] = [];

  for (const ch of channels) {
    const model = ch.model.name;
    const provider = ch.provider.displayName;
    const modality = ch.model.modality;
    process.stdout.write(`  ${provider.padEnd(18)} ${model.padEnd(30)} ${modality.padEnd(6)} `);

    const start = Date.now();
    try {
      const { route, adapter } = await resolveEngine(model);

      if (modality === "TEXT") {
        const res = await adapter.chatCompletions(
          {
            model,
            messages: [{ role: "user", content: "Say OK" }],
            max_tokens: 5,
            temperature: 0.01,
          },
          route,
        );
        const msg = res.choices?.[0]?.message as Record<string, unknown> | undefined;
        const hasContent = !!(msg?.content || msg?.reasoning_content);
        if (!hasContent) throw new Error("Empty response (no content or reasoning_content)");
      } else if (modality === "IMAGE") {
        const res = await adapter.imageGenerations({ model, prompt: "red circle", n: 1 }, route);
        if (!res.data?.[0]?.url && !res.data?.[0]?.b64_json) throw new Error("No image");
      }

      const latency = Date.now() - start;
      console.log(`✅ ${latency}ms`);
      results.push({ model, provider, modality, status: "PASS", latencyMs: latency });
    } catch (e) {
      const latency = Date.now() - start;
      const msg = (e as Error).message.slice(0, 80);
      console.log(`❌ ${latency}ms — ${msg}`);
      results.push({ model, provider, modality, status: "FAIL", latencyMs: latency, error: msg });
    }
  }

  const passed = results.filter((r) => r.status === "PASS").length;
  const failed = results.filter((r) => r.status === "FAIL").length;

  console.log("\n" + "=".repeat(70));
  console.log(`Total: ${results.length} | ✅ ${passed} PASS | ❌ ${failed} FAIL`);
  console.log("=".repeat(70));

  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
