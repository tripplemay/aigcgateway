/**
 * 一次性修复脚本：扫描并修复 ACTIVE Channel 中 sellPrice 为空或全零的记录
 *
 * 用法：
 *   npx tsx scripts/fix-empty-sell-price.ts          # dry-run（只报告）
 *   npx tsx scripts/fix-empty-sell-price.ts --apply   # 实际修复
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const MARKUP_RATIO = 1.2;
const dryRun = !process.argv.includes("--apply");

async function main() {
  console.log(dryRun ? "[DRY RUN] 只报告，不修改" : "[APPLY] 将修复空 sellPrice");

  const channels = await prisma.channel.findMany({
    where: { status: "ACTIVE" },
    include: { model: { select: { name: true, modality: true } } },
  });

  let fixCount = 0;
  let skipCount = 0;

  for (const ch of channels) {
    const sp = ch.sellPrice as Record<string, unknown> | null;
    const cp = ch.costPrice as Record<string, unknown> | null;

    // 检查 sellPrice 是否为空
    const isEmptySell =
      !sp ||
      Object.keys(sp).length === 0 ||
      ((sp.inputPer1M === 0 || sp.inputPer1M === undefined) &&
        (sp.outputPer1M === 0 || sp.outputPer1M === undefined) &&
        (sp.perCall === 0 || sp.perCall === undefined));

    if (!isEmptySell) {
      skipCount++;
      continue;
    }

    // 如果 sellPriceLocked，跳过
    if (ch.sellPriceLocked) {
      console.log(`  LOCKED ${ch.model.name} — 跳过`);
      skipCount++;
      continue;
    }

    // 用 costPrice 重算 sellPrice
    let newSellPrice: Record<string, unknown>;
    if (cp && cp.unit === "call") {
      const perCall = ((cp.perCall as number) ?? 0) * MARKUP_RATIO;
      newSellPrice = { perCall: +perCall.toFixed(4), unit: "call" };
    } else if (cp && ((cp.inputPer1M as number) > 0 || (cp.outputPer1M as number) > 0)) {
      newSellPrice = {
        inputPer1M: +(((cp.inputPer1M as number) ?? 0) * MARKUP_RATIO).toFixed(4),
        outputPer1M: +(((cp.outputPer1M as number) ?? 0) * MARKUP_RATIO).toFixed(4),
        unit: "token",
      };
    } else {
      // costPrice 也为空，无法修复
      console.log(`  SKIP ${ch.model.name} — costPrice 也为空`);
      skipCount++;
      continue;
    }

    console.log(
      `  FIX ${ch.model.name} — sellPrice: ${JSON.stringify(sp)} → ${JSON.stringify(newSellPrice)}`,
    );

    if (!dryRun) {
      await prisma.channel.update({
        where: { id: ch.id },
        data: { sellPrice: newSellPrice },
      });
    }
    fixCount++;
  }

  console.log(`\n总计: ${channels.length} channels, 修复: ${fixCount}, 跳过: ${skipCount}`);
  await prisma.$disconnect();
}

main().catch(console.error);
