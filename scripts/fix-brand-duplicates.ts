/**
 * 一次性脚本：合并重复品牌变体
 *
 * 常见问题：
 * - "智谱 AI" vs "智谱AI"（多余空格）
 * - "Arcee AI" vs "Arcee"（冗余后缀）
 * - 大小写不一致
 *
 * 用法：npx tsx scripts/fix-brand-duplicates.ts [--dry-run]
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// 品牌合并映射：key = 脏数据，value = 标准名
const BRAND_MERGE_MAP: Record<string, string> = {
  "智谱 AI": "智谱AI",
  "Zhipu AI": "智谱AI",
  "zhipu": "智谱AI",
  "Arcee AI": "Arcee",
  "arcee": "Arcee",
  "deepseek": "DeepSeek",
  "Deepseek": "DeepSeek",
  "openai": "OpenAI",
  "Openai": "OpenAI",
  "anthropic": "Anthropic",
  "google": "Google",
  "meta": "Meta",
  "mistral": "Mistral",
  "Mistral AI": "Mistral",
};

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  if (dryRun) console.log("[dry-run] No changes will be written\n");

  // 1. 查询所有有 brand 的别名
  const aliases = await prisma.modelAlias.findMany({
    where: { brand: { not: null } },
    select: { id: true, alias: true, brand: true },
  });

  // 2. 统计品牌分布
  const brandCounts: Record<string, number> = {};
  for (const a of aliases) {
    if (a.brand) {
      brandCounts[a.brand] = (brandCounts[a.brand] ?? 0) + 1;
    }
  }

  console.log("Current brand distribution:");
  for (const [brand, count] of Object.entries(brandCounts).sort((a, b) => b[1] - a[1])) {
    const needsFix = BRAND_MERGE_MAP[brand] ? ` → ${BRAND_MERGE_MAP[brand]}` : "";
    console.log(`  ${brand}: ${count}${needsFix}`);
  }
  console.log();

  // 3. 执行合并
  let fixed = 0;
  for (const alias of aliases) {
    if (!alias.brand) continue;
    const canonical = BRAND_MERGE_MAP[alias.brand];
    if (canonical && canonical !== alias.brand) {
      console.log(`  ${alias.alias}: "${alias.brand}" → "${canonical}"`);
      if (!dryRun) {
        await prisma.modelAlias.update({
          where: { id: alias.id },
          data: { brand: canonical },
        });
      }
      fixed++;
    }
  }

  console.log(`\nTotal: ${fixed} aliases ${dryRun ? "would be" : ""} fixed`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
