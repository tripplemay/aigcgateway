/**
 * 清理脚本：删除 disabled 且无 Channel 的孤立 Model
 *
 * 用法：
 *   npx tsx scripts/cleanup-orphan-models.ts          # dry-run（只报告）
 *   npx tsx scripts/cleanup-orphan-models.ts --apply   # 实际删除
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const dryRun = !process.argv.includes("--apply");

async function main() {
  console.log(dryRun ? "[DRY RUN] 只报告，不删除" : "[APPLY] 将删除孤立 Model");
  console.log();

  const allModels = await prisma.model.findMany({
    select: { id: true, name: true, modality: true, enabled: true, _count: { select: { channels: true } } },
    orderBy: { name: "asc" },
  });

  const orphans = allModels.filter((m) => !m.enabled && m._count.channels === 0);

  console.log(`数据库 Model 总数: ${allModels.length}`);
  console.log(`enabled=true: ${allModels.filter((m) => m.enabled).length}`);
  console.log(`孤立（disabled + 0 channels）: ${orphans.length}`);
  console.log();

  if (orphans.length === 0) {
    console.log("没有需要清理的 Model，退出。");
    return;
  }

  const preview = orphans.slice(0, 20);
  console.log(`待删除 Model 前 ${preview.length} 条:`);
  for (const m of preview) {
    console.log(`  ✗ ${m.name} (${m.modality})`);
  }
  if (orphans.length > 20) {
    console.log(`  ... 还有 ${orphans.length - 20} 条`);
  }
  console.log();

  if (dryRun) {
    console.log("[DRY RUN] 加 --apply 参数执行实际删除。");
    return;
  }

  const deleted = await prisma.model.deleteMany({
    where: { id: { in: orphans.map((m) => m.id) } },
  });
  console.log(`已删除 Model: ${deleted.count}`);
  console.log("\n清理完成。");
}

main()
  .catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
