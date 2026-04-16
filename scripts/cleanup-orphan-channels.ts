/**
 * 孤儿 channel 清理脚本
 *
 * 找出所有未挂到任何 enabled alias 的 model，将其 enabled 设为 false。
 * 不删除任何数据，仅 disable（保留历史参考）。
 *
 * 用法：
 *   npx tsx scripts/cleanup-orphan-channels.ts          # dry-run
 *   npx tsx scripts/cleanup-orphan-channels.ts --apply   # 实际执行
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const dryRun = !process.argv.includes("--apply");

async function main() {
  console.log(dryRun ? "[DRY RUN] 只报告，不修改" : "[APPLY] 将禁用孤儿模型\n");

  // Find all enabled models that are NOT linked to any enabled alias
  const orphanModels = await prisma.model.findMany({
    where: {
      enabled: true,
      aliasLinks: {
        none: {
          alias: { enabled: true },
        },
      },
    },
    select: { id: true, name: true, modality: true },
  });

  console.log(`找到 ${orphanModels.length} 个孤儿模型（enabled 但未挂到任何 enabled alias）\n`);

  if (orphanModels.length === 0) {
    console.log("无需清理。");
    return;
  }

  // Show first 20 for preview
  const preview = orphanModels.slice(0, 20);
  for (const m of preview) {
    console.log(`  ${m.modality.padEnd(6)} ${m.name}`);
  }
  if (orphanModels.length > 20) {
    console.log(`  ... 还有 ${orphanModels.length - 20} 个`);
  }

  if (dryRun) {
    console.log(`\n加 --apply 实际执行: npx tsx scripts/cleanup-orphan-channels.ts --apply`);
    return;
  }

  // Batch disable
  const result = await prisma.model.updateMany({
    where: {
      id: { in: orphanModels.map((m) => m.id) },
    },
    data: { enabled: false },
  });

  console.log(`\n已禁用 ${result.count} 个孤儿模型。`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
