/**
 * 一次性修复脚本：为所有有 inputPer1M 但缺少 unit 的 ModelAlias.sellPrice 补上 unit: 'token'
 *
 * 背景：onApply stale closure bug 导致部分 alias 的 sellPrice 缺少 unit 字段，
 *       Models 页因此无法正确显示定价。
 *
 * 用法：
 *   npx tsx scripts/fix-alias-sell-price-unit.ts          # dry-run（只报告）
 *   npx tsx scripts/fix-alias-sell-price-unit.ts --apply   # 实际修复
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const dryRun = !process.argv.includes("--apply");

async function main() {
  console.log(dryRun ? "[DRY RUN] 只报告，不修改" : "[APPLY] 将修复缺少 unit 的 alias sellPrice");

  const aliases = await prisma.modelAlias.findMany({
    where: { sellPrice: { not: null } },
    select: { id: true, alias: true, sellPrice: true },
  });

  let fixCount = 0;
  let skipCount = 0;

  for (const a of aliases) {
    const sp = a.sellPrice as Record<string, unknown> | null;
    if (!sp) {
      skipCount++;
      continue;
    }

    const hasPrice =
      typeof sp.inputPer1M === "number" ||
      typeof sp.outputPer1M === "number" ||
      typeof sp.perCall === "number";

    if (!hasPrice) {
      skipCount++;
      continue;
    }

    if (sp.unit) {
      skipCount++;
      continue;
    }

    // Determine unit based on pricing fields
    const unit = typeof sp.perCall === "number" && !sp.inputPer1M && !sp.outputPer1M ? "call" : "token";
    const fixed = { ...sp, unit };

    console.log(`  FIX ${a.alias} — sellPrice: ${JSON.stringify(sp)} → ${JSON.stringify(fixed)}`);

    if (!dryRun) {
      await prisma.modelAlias.update({
        where: { id: a.id },
        data: { sellPrice: fixed },
      });
    }
    fixCount++;
  }

  console.log(`\n总计: ${aliases.length} aliases with sellPrice, 修复: ${fixCount}, 跳过: ${skipCount}`);
  await prisma.$disconnect();
}

main().catch(console.error);
