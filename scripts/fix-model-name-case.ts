/**
 * 数据清理脚本：合并大小写重复 Model
 *
 * 对于同名但大小写不同的 Model（如 "GPT-4o" vs "gpt-4o"），
 * 将 Channel 和 AliasModelLink 迁移到小写 Model，然后删除大写 Model。
 *
 * 用法: npx tsx scripts/fix-model-name-case.ts [--dry-run]
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const dryRun = process.argv.includes("--dry-run");

async function main() {
  console.log(`[fix-model-name-case] ${dryRun ? "DRY RUN" : "LIVE RUN"}\n`);

  // Find all models, group by lowercase name
  const allModels = await prisma.model.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const grouped = new Map<string, typeof allModels>();
  for (const m of allModels) {
    const key = m.name.toLowerCase();
    const arr = grouped.get(key) ?? [];
    arr.push(m);
    grouped.set(key, arr);
  }

  let mergedCount = 0;
  let deletedCount = 0;

  for (const [lowerName, models] of grouped) {
    if (models.length <= 1) continue;

    // Pick the canonical model: prefer the one whose name is already lowercase
    const canonical = models.find((m) => m.name === lowerName) ?? models[0];
    const duplicates = models.filter((m) => m.id !== canonical.id);

    console.log(`\n[MERGE] "${lowerName}" — keep ${canonical.id} ("${canonical.name}"), merge ${duplicates.length} duplicates:`);
    for (const dup of duplicates) {
      console.log(`  - ${dup.id} ("${dup.name}")`);

      // Count references
      const channelCount = await prisma.channel.count({ where: { modelId: dup.id } });
      const linkCount = await prisma.aliasModelLink.count({ where: { modelId: dup.id } });

      console.log(`    Channels: ${channelCount}, AliasModelLinks: ${linkCount}`);

      if (!dryRun) {
        // Migrate channels
        if (channelCount > 0) {
          await prisma.channel.updateMany({
            where: { modelId: dup.id },
            data: { modelId: canonical.id },
          });
          console.log(`    -> Migrated ${channelCount} channels`);
        }

        // Migrate alias model links (handle unique constraint conflicts)
        if (linkCount > 0) {
          const links = await prisma.aliasModelLink.findMany({
            where: { modelId: dup.id },
          });
          for (const link of links) {
            // Check if canonical already has a link for this alias
            const existingLink = await prisma.aliasModelLink.findUnique({
              where: { aliasId_modelId: { aliasId: link.aliasId, modelId: canonical.id } },
            });
            if (existingLink) {
              // Delete the duplicate link
              await prisma.aliasModelLink.delete({ where: { id: link.id } });
              console.log(`    -> Deleted duplicate AliasModelLink ${link.id} (alias already linked)`);
            } else {
              await prisma.aliasModelLink.update({
                where: { id: link.id },
                data: { modelId: canonical.id },
              });
              console.log(`    -> Migrated AliasModelLink ${link.id}`);
            }
          }
        }

        // Delete the duplicate model
        await prisma.model.delete({ where: { id: dup.id } });
        console.log(`    -> Deleted Model ${dup.id}`);
        deletedCount++;
      }

      mergedCount++;
    }

    // Ensure canonical model name is lowercase
    if (canonical.name !== lowerName && !dryRun) {
      await prisma.model.update({
        where: { id: canonical.id },
        data: { name: lowerName },
      });
      console.log(`  -> Renamed "${canonical.name}" to "${lowerName}"`);
    }
  }

  // Also lowercase all remaining model names that aren't already lowercase
  if (!dryRun) {
    const nonLower = allModels.filter((m) => m.name !== m.name.toLowerCase() && !grouped.get(m.name.toLowerCase())?.some((g) => g.id !== m.id));
    for (const m of nonLower) {
      if (m.name !== m.name.toLowerCase()) {
        try {
          await prisma.model.update({
            where: { id: m.id },
            data: { name: m.name.toLowerCase() },
          });
          console.log(`[RENAME] "${m.name}" -> "${m.name.toLowerCase()}"`);
        } catch {
          console.log(`[SKIP] "${m.name}" — conflict on rename`);
        }
      }
    }
  }

  console.log(`\n[DONE] Merged: ${mergedCount}, Deleted: ${deletedCount}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
