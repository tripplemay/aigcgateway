/**
 * 一次性修复脚本：清理 LLM 分类错误导致的跨代际别名挂载
 *
 * 问题：LLM 分类器曾将不同大版本号的模型归入同一别名
 * （如 claude-3.5-sonnet 下挂载了 3.7/4.5/4.6 模型）
 *
 * 策略：
 * 1. 遍历所有别名，检查其挂载模型的版本号是否与别名一致
 * 2. 版本号不匹配的模型从当前别名解除挂载
 * 3. 解除后的模型在下次 sync 时会被重新分类到正确别名
 *
 * 用法：
 *   npx tsx scripts/fix-alias-mislinked-models.ts          # dry-run（只报告）
 *   npx tsx scripts/fix-alias-mislinked-models.ts --apply   # 实际修复
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const dryRun = !process.argv.includes("--apply");

/**
 * Extract version identifier from a model name.
 * Returns the core version part, e.g.:
 *   "claude-3.5-sonnet-20241022" → "3.5"
 *   "claude-3.7-sonnet" → "3.7"
 *   "gpt-4o-2024-08-06" → "4o"
 *   "deepseek-v3" → "v3"
 */
function extractVersion(name: string): string | null {
  // Claude pattern: claude-X.Y-...
  const claudeMatch = name.match(/claude-(\d+(?:\.\d+)?)-/);
  if (claudeMatch) return claudeMatch[1];

  // GPT pattern: gpt-X...
  const gptMatch = name.match(/gpt-([\d.]+[a-z]*)/);
  if (gptMatch) return gptMatch[1];

  // DeepSeek pattern: deepseek-vX or deepseek-rX
  const dsMatch = name.match(/deepseek-([vr]\d+)/i);
  if (dsMatch) return dsMatch[1].toLowerCase();

  // Gemini pattern: gemini-X.Y
  const geminiMatch = name.match(/gemini-(\d+(?:\.\d+)?)/);
  if (geminiMatch) return geminiMatch[1];

  // Qwen pattern: qwen-X.Y or qwenX.Y
  const qwenMatch = name.match(/qwen-?(\d+(?:\.\d+)?)/i);
  if (qwenMatch) return qwenMatch[1];

  return null;
}

async function main() {
  console.log(dryRun ? "[DRY RUN] 只报告，不修改" : "[APPLY] 将清理错误挂载");

  const aliases = await prisma.modelAlias.findMany({
    include: {
      models: {
        include: {
          model: { select: { id: true, name: true } },
        },
      },
    },
  });

  let unlinkCount = 0;
  let skipCount = 0;

  for (const alias of aliases) {
    const aliasVersion = extractVersion(alias.alias);
    if (!aliasVersion) {
      skipCount++;
      continue;
    }

    for (const link of alias.models) {
      const modelVersion = extractVersion(link.model.name);
      if (!modelVersion) continue;

      if (modelVersion !== aliasVersion) {
        console.log(
          `  UNLINK "${link.model.name}" (v${modelVersion}) from alias "${alias.alias}" (v${aliasVersion})`,
        );

        if (!dryRun) {
          await prisma.aliasModelLink.delete({
            where: { aliasId_modelId: { aliasId: alias.id, modelId: link.model.id } },
          });
        }
        unlinkCount++;
      }
    }
  }

  console.log(`\n总计: ${aliases.length} aliases 检查, 解除挂载: ${unlinkCount}, 跳过: ${skipCount}`);
  await prisma.$disconnect();
}

main().catch(console.error);
