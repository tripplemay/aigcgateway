/**
 * 一次性清理脚本：删除白名单以外的孤立 Model + 关联 Channel
 *
 * 用法：
 *   npx tsx scripts/cleanup-orphan-models.ts          # dry-run（只报告）
 *   npx tsx scripts/cleanup-orphan-models.ts --apply   # 实际删除
 */

import { PrismaClient } from "@prisma/client";
import { getAllWhitelistedModelNames } from "../src/lib/sync/model-whitelist";

const CROSS_PROVIDER_MAP: Record<string, string> = {
  "openai/gpt-4o": "openai/gpt-4o",
  "openai/gpt-4o-mini": "openai/gpt-4o-mini",
  "openai/gpt-4.1": "openai/gpt-4.1",
  "openai/gpt-4.1-mini": "openai/gpt-4.1-mini",
  "openai/gpt-4.1-nano": "openai/gpt-4.1-nano",
  "openai/o3": "openai/o3",
  "openai/o3-mini": "openai/o3-mini",
  "openai/o4-mini": "openai/o4-mini",
  "anthropic/claude-opus-4-6": "anthropic/claude-opus-4-6",
  "anthropic/claude-sonnet-4-6": "anthropic/claude-sonnet-4-6",
  "anthropic/claude-haiku-4-5": "anthropic/claude-haiku-4-5",
  "deepseek/deepseek-chat": "deepseek/v3",
  "deepseek/deepseek-reasoner": "deepseek/reasoner",
};

const prisma = new PrismaClient();
const dryRun = !process.argv.includes("--apply");

async function main() {
  console.log(dryRun ? "[DRY RUN] 只报告，不删除" : "[APPLY] 将删除白名单外的 Model 和 Channel");
  console.log();

  const whitelistedNames = getAllWhitelistedModelNames(CROSS_PROVIDER_MAP);
  console.log(`白名单 canonical model names (${whitelistedNames.size}):`);
  for (const name of [...whitelistedNames].sort()) {
    console.log(`  ✓ ${name}`);
  }
  console.log();

  const allModels = await prisma.model.findMany({
    select: { id: true, name: true, modality: true },
    orderBy: { name: "asc" },
  });

  const orphans = allModels.filter((m) => !whitelistedNames.has(m.name));
  const kept = allModels.filter((m) => whitelistedNames.has(m.name));

  console.log(`数据库 Model 总数: ${allModels.length}`);
  console.log(`白名单内（保留）: ${kept.length}`);
  console.log(`白名单外（待删除）: ${orphans.length}`);
  console.log();

  if (orphans.length === 0) {
    console.log("没有需要清理的 Model，退出。");
    return;
  }

  // 统计关联 Channel
  const orphanIds = orphans.map((m) => m.id);
  const orphanChannels = await prisma.channel.findMany({
    where: { modelId: { in: orphanIds } },
    select: { id: true, status: true, modelId: true },
  });

  const channelsByStatus: Record<string, number> = {};
  for (const ch of orphanChannels) {
    channelsByStatus[ch.status] = (channelsByStatus[ch.status] ?? 0) + 1;
  }

  console.log(`关联 Channel 总数: ${orphanChannels.length}`);
  for (const [status, count] of Object.entries(channelsByStatus)) {
    console.log(`  ${status}: ${count}`);
  }
  console.log();

  // 打印前 20 条待删除 Model
  const preview = orphans.slice(0, 20);
  console.log(`待删除 Model 前 ${preview.length} 条:`);
  for (const m of preview) {
    const chCount = orphanChannels.filter((ch) => ch.modelId === m.id).length;
    console.log(`  ✗ ${m.name} (${m.modality}, ${chCount} channels)`);
  }
  if (orphans.length > 20) {
    console.log(`  ... 还有 ${orphans.length - 20} 条`);
  }
  console.log();

  if (dryRun) {
    console.log("[DRY RUN] 加 --apply 参数执行实际删除。");
    return;
  }

  // 实际删除：先 Channel，再 Model
  const deletedChannels = await prisma.channel.deleteMany({
    where: { modelId: { in: orphanIds } },
  });
  console.log(`已删除 Channel: ${deletedChannels.count}`);

  const deletedModels = await prisma.model.deleteMany({
    where: { id: { in: orphanIds } },
  });
  console.log(`已删除 Model: ${deletedModels.count}`);

  console.log("\n清理完成。");
}

main()
  .catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
