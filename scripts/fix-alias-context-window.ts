/**
 * 一次性脚本：补齐别名 contextWindow/maxTokens
 *
 * 逻辑：对每个 contextWindow 为 null 的 ModelAlias，查其关联的 Model。
 * 如果关联 Model 有 contextWindow 值，则取最大值写入别名。maxTokens 同理。
 *
 * 用法：npx tsx scripts/fix-alias-context-window.ts [--dry-run]
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  if (dryRun) console.log("[dry-run] No changes will be written\n");

  const aliases = await prisma.modelAlias.findMany({
    select: {
      id: true,
      alias: true,
      contextWindow: true,
      maxTokens: true,
      models: {
        select: {
          model: {
            select: { contextWindow: true, maxTokens: true },
          },
        },
      },
    },
  });

  let fixedCw = 0;
  let fixedMt = 0;

  for (const alias of aliases) {
    const updates: Record<string, number> = {};

    // 补齐 contextWindow：取关联 Model 中最大值
    if (alias.contextWindow == null) {
      const cwValues = alias.models
        .map((l) => l.model.contextWindow)
        .filter((v): v is number => v != null);
      if (cwValues.length > 0) {
        const maxCw = Math.max(...cwValues);
        updates.contextWindow = maxCw;
        fixedCw++;
      }
    }

    // 补齐 maxTokens：取关联 Model 中最大值
    if (alias.maxTokens == null) {
      const mtValues = alias.models
        .map((l) => l.model.maxTokens)
        .filter((v): v is number => v != null);
      if (mtValues.length > 0) {
        const maxMt = Math.max(...mtValues);
        updates.maxTokens = maxMt;
        fixedMt++;
      }
    }

    if (Object.keys(updates).length > 0) {
      console.log(
        `${alias.alias}: ${Object.entries(updates).map(([k, v]) => `${k}=${v}`).join(", ")}`,
      );
      if (!dryRun) {
        await prisma.modelAlias.update({
          where: { id: alias.id },
          data: updates,
        });
      }
    }
  }

  console.log(
    `\nTotal: ${fixedCw} contextWindow + ${fixedMt} maxTokens ${dryRun ? "would be" : ""} fixed`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
