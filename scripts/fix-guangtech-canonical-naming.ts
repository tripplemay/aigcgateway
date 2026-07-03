/**
 * BL-SYNC-ADAPTERTYPE-FALLBACK fix-round-1 — 修复通用 fallback provider 的
 * canonical 模型命名（一次性数据修复）。
 *
 * 背景：F-GT-01 首版让通用 openai-compat provider（如 guangtech）能同步，但
 * `reconcile()` 的 `resolveCanonicalName` 当时仍返回裸 modelId，导致 guangtech 的
 * 模型以裸 `gpt-5.5`/`gpt-5.4` 等入库，会与其它 provider 的同名模型撞名。修复后
 * `resolveCanonicalName` 对 fallback provider 加 `${provider.name}/` 前缀，但 guangtech
 * **已同步的存量行**仍是裸名，需本脚本一次性纠正。
 *
 * 做法：**就地重命名** `models.name`（`gpt-5.5` → `guangtech/gpt-5.5`）。channel（modelId FK）
 * 与 alias_model_links（modelId FK）均按 id 引用，不受 name 变更影响，故重命名后引用全部保留。
 * 重命名后下一次 sync 计算出的 canonical 与存量一致 → 幂等匹配、不再重复建行。
 *
 * 安全护栏：
 * - 仅处理 `providerUsesGenericFallbackAdapter` 为 true 的 provider（与派发/命名同一判定）。
 * - 仅重命名「尚未带本 provider 前缀」的裸名模型；已带前缀的跳过（幂等）。
 * - 目标名已存在时：若它是可安全删除的 orphan（无 channel / alias link / pending
 *   classification 引用，典型来自「修复部署后启动 sync 已用前缀名建了 orphan 模型，
 *   但活跃 channel 仍挂在裸名模型上」）→ 删除 orphan 后继续重命名裸名模型；若目标名
 *   仍被引用，或该裸名 model 被其它 provider 的 channel 共享 → 跳过并告警，不动。
 *
 * 用法：
 *   npx tsx scripts/fix-guangtech-canonical-naming.ts            # dry-run（默认）
 *   npx tsx scripts/fix-guangtech-canonical-naming.ts --apply    # 写库 + 清 models:list 缓存
 *   APPLY=1 npx tsx scripts/fix-guangtech-canonical-naming.ts
 */

import { PrismaClient } from "@prisma/client";
import { providerUsesGenericFallbackAdapter } from "../src/lib/sync/model-sync";
import { invalidateModelsListCache } from "../src/lib/cache/models-cache";
import { disconnectRedis } from "../src/lib/redis";

export interface RenamePlan {
  provider: string;
  modelId: string;
  from: string;
  to: string;
}
export interface SkipEntry {
  provider: string;
  from: string;
  to: string;
  reason: string;
}
export interface RepairResult {
  fallbackProviders: string[];
  planned: RenamePlan[];
  renamed: RenamePlan[];
  skipped: SkipEntry[];
}

/**
 * 就地纠正所有通用 fallback provider 的裸名 canonical 模型 → `${provider.name}/${name}`。
 * dryRun=true 仅返回计划，不写库。幂等：已带前缀的模型不重复处理。
 */
export async function repairFallbackCanonicalNames(
  prisma: PrismaClient,
  opts: { dryRun?: boolean } = {},
): Promise<RepairResult> {
  const dryRun = opts.dryRun ?? true;

  const providers = await prisma.provider.findMany({
    select: { id: true, name: true, adapterType: true },
    orderBy: { name: "asc" },
  });
  const fallbackProviders = providers.filter((p) => providerUsesGenericFallbackAdapter(p));

  const planned: RenamePlan[] = [];
  const renamed: RenamePlan[] = [];
  const skipped: SkipEntry[] = [];

  for (const provider of fallbackProviders) {
    const prefix = `${provider.name.toLowerCase()}/`;

    // 该 provider 名下 channel 关联的模型（去重）
    const channels = await prisma.channel.findMany({
      where: { providerId: provider.id },
      include: { model: true },
    });
    const modelsById = new Map(channels.map((c) => [c.model.id, c.model]));

    for (const model of modelsById.values()) {
      if (model.name.startsWith(prefix)) continue; // 已带前缀，幂等跳过
      const to = `${provider.name}/${model.name}`.toLowerCase();
      const plan: RenamePlan = { provider: provider.name, modelId: model.id, from: model.name, to };
      planned.push(plan);

      // 护栏 1：目标名已存在。
      // 常见于「修复代码已部署 → 启动 sync 已用前缀名建了 orphan 模型，但活跃 channel
      // 仍挂在裸名模型上」。若该 orphan 目标可安全删除（无 channel / alias link /
      // pending classification 引用）→ 删除后继续重命名裸名模型；否则跳过不动。
      const clash = await prisma.model.findUnique({ where: { name: to }, select: { id: true } });
      if (clash) {
        const [chCount, linkCount, pendCount] = await Promise.all([
          prisma.channel.count({ where: { modelId: clash.id } }),
          prisma.aliasModelLink.count({ where: { modelId: clash.id } }),
          prisma.pendingClassification.count({ where: { modelId: clash.id } }),
        ]);
        if (chCount > 0 || linkCount > 0 || pendCount > 0) {
          skipped.push({
            ...plan,
            reason: `目标名 "${to}" 已存在且被引用 (channel=${chCount}, aliasLink=${linkCount}, pending=${pendCount})`,
          });
          continue;
        }
        if (!dryRun) await prisma.model.delete({ where: { id: clash.id } });
        // 目标 orphan 已清（或 dry-run 记录）→ 继续走护栏 2 + 重命名
      }
      // 护栏 2：该 model 被其它 provider 的 channel 引用（共享模型）→ 不动
      const sharedCount = await prisma.channel.count({
        where: { modelId: model.id, providerId: { not: provider.id } },
      });
      if (sharedCount > 0) {
        skipped.push({ ...plan, reason: `模型被另外 ${sharedCount} 个 provider 的 channel 共享` });
        continue;
      }

      if (dryRun) continue;
      await prisma.model.update({ where: { id: model.id }, data: { name: to } });
      renamed.push(plan);
    }
  }

  return { fallbackProviders: fallbackProviders.map((p) => p.name), planned, renamed, skipped };
}

// ----------------------------------------------------------------
// Standalone CLI 入口
// ----------------------------------------------------------------
async function cli(): Promise<void> {
  const apply = process.argv.includes("--apply") || process.env.APPLY === "1";
  const dryRun = !apply;
  const prisma = new PrismaClient();
  console.log(
    dryRun
      ? "[DRY RUN] 不写库；打印 fallback provider 裸名模型的重命名计划。加 --apply 真正写入。"
      : "[APPLY] 就地重命名 fallback provider 的裸名 canonical 模型 → 带 provider 前缀...",
  );
  console.log();
  try {
    const r = await repairFallbackCanonicalNames(prisma, { dryRun });
    console.log(
      `fallback providers (${r.fallbackProviders.length}): ${r.fallbackProviders.join(", ") || "(无)"}`,
    );
    const list = dryRun ? r.planned : r.renamed;
    console.log(`${dryRun ? "待重命名" : "已重命名"} (${list.length}):`);
    for (const p of list) console.log(`  [${p.provider}] ${p.from}  →  ${p.to}`);
    if (r.skipped.length > 0) {
      console.log(`\n跳过 (${r.skipped.length}):`);
      for (const s of r.skipped)
        console.log(`  [${s.provider}] ${s.from} → ${s.to}  (${s.reason})`);
    }
    if (dryRun) {
      console.log("\n请 review 上方计划，确认无误后加 --apply 写入。");
    } else {
      invalidateModelsListCache();
      console.log("\n已清 models:list* 缓存。");
    }
  } finally {
    await prisma.$disconnect();
    await disconnectRedis();
  }
}

const isDirectRun =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv[1] !== undefined &&
  process.argv[1].endsWith("fix-guangtech-canonical-naming.ts");

if (isDirectRun) {
  cli().catch((err) => {
    console.error("[fix-guangtech-canonical-naming] failed:", err);
    process.exitCode = 1;
  });
}
