/**
 * 回填脚本：为缺少 supportedSizes 的 IMAGE 模型填充数据
 *
 * 用法：
 *   npx tsx scripts/backfill-supported-sizes.ts          # dry-run（只报告）
 *   npx tsx scripts/backfill-supported-sizes.ts --apply   # 实际修改
 *
 * 幂等：已有 supportedSizes 的模型不会被覆盖
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const dryRun = !process.argv.includes("--apply");

/**
 * 根据模型名推断 supportedSizes（基于各服务商 API 文档）
 * 返回 null 表示无法推断，需手动配置
 */
function inferSupportedSizes(modelName: string): string[] | null {
  const name = modelName.toLowerCase();

  // OpenAI GPT Image / DALL-E 3
  if (name.includes("gpt-image") || name.includes("dall-e-3")) {
    return ["1024x1024", "1024x1792", "1792x1024"];
  }
  if (name.includes("dall-e-2")) {
    return ["256x256", "512x512", "1024x1024"];
  }

  // Google Gemini image generation
  if (name.includes("gemini") && name.includes("image")) {
    return ["1024x1024"];
  }

  // Alibaba Qwen / Tongyi Wanxiang
  if (name.includes("qwen") && name.includes("image")) {
    return ["1024x1024", "720x1280", "1280x720"];
  }

  // Volcengine Seedream
  if (name.includes("seedream")) {
    return ["512x512", "1024x1024", "2048x2048"];
  }

  // Zhipu CogView
  if (name.includes("cogview")) {
    return ["1024x1024"];
  }

  // Flux models (via SiliconFlow / others)
  if (name.includes("flux")) {
    return ["512x512", "768x768", "768x1024", "1024x768", "1024x1024"];
  }

  // Stable Diffusion
  if (name.includes("stable-diffusion") || name.includes("sd-")) {
    return ["512x512", "768x768", "1024x1024"];
  }

  return null;
}

async function main() {
  console.log(dryRun ? "[DRY RUN] 只报告，不修改" : "[APPLY] 将回填 supportedSizes");

  const imageModels = await prisma.model.findMany({
    where: { modality: "IMAGE" },
    select: { id: true, name: true, supportedSizes: true },
  });

  console.log(`\n找到 ${imageModels.length} 个 IMAGE 模型\n`);

  let backfillCount = 0;
  let skipCount = 0;
  let unknownCount = 0;

  for (const model of imageModels) {
    const existing = model.supportedSizes as string[] | null;
    if (existing && Array.isArray(existing) && existing.length > 0) {
      console.log(`  SKIP  ${model.name} — 已有 supportedSizes: [${existing.join(", ")}]`);
      skipCount++;
      continue;
    }

    const sizes = inferSupportedSizes(model.name);
    if (!sizes) {
      console.log(`  WARN  ${model.name} — 无法推断 supportedSizes，需手动配置`);
      unknownCount++;
      continue;
    }

    console.log(`  FILL  ${model.name} → [${sizes.join(", ")}]`);

    if (!dryRun) {
      await prisma.model.update({
        where: { id: model.id },
        data: { supportedSizes: sizes },
      });
    }
    backfillCount++;
  }

  console.log(`\n--- 汇总 ---`);
  console.log(`回填: ${backfillCount}, 跳过(已有): ${skipCount}, 未知(需手动): ${unknownCount}`);
  if (dryRun && backfillCount > 0) {
    console.log(`\n加 --apply 参数实际执行: npx tsx scripts/backfill-supported-sizes.ts --apply`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
