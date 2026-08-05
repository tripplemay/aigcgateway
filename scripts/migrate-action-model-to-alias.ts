/**
 * BL-SEC-HOTFIX-2608 F-SH-03 — 把 Action.model 里残留的「底层模型名」迁移到别名。
 *
 * 背景：resolveEngine 原有一条回退，别名解析不到时按底层 Model.name 路由。该回退
 * 已被移除（审查 C6：零计费 + 绕过停用开关 + 跳过 modality 门禁）。移除后，任何
 * 仍以底层模型名配置的 Action 会开始 404，必须先迁到对应别名。
 *
 * 本脚本只处理**能唯一确定目标**的情况：Action.model 不是启用别名，但它是某个
 * Model 的 name，且该 Model 恰好挂在一个启用别名下 → 改写为该别名。
 * 有歧义（挂多个启用别名）或无解（模型不存在/无启用别名）的一律只报告不改。
 *
 * 用法：
 *   npx tsx scripts/migrate-action-model-to-alias.ts            # dry-run，只盘点
 *   npx tsx scripts/migrate-action-model-to-alias.ts --apply    # 实际写库
 *
 * 生产执行（只读盘点同理，去掉 --apply）：
 *   ssh -f -N -L 15432:127.0.0.1:5432 deploysvr
 *   DATABASE_URL="postgresql://aigc:<pw>@127.0.0.1:15432/aigc_gateway" \
 *     npx tsx scripts/migrate-action-model-to-alias.ts --apply
 */

import { prisma } from "@/lib/prisma";

const APPLY = process.argv.includes("--apply");

interface Plan {
  actionId: string;
  actionName: string;
  from: string;
  to: string;
}

interface Unresolved {
  actionId: string;
  actionName: string;
  model: string;
  reason: string;
}

async function main() {
  console.log(`模式：${APPLY ? "APPLY（会写库）" : "DRY-RUN（只盘点，不写库）"}`);
  console.log("=".repeat(64));

  const [actions, aliases] = await Promise.all([
    prisma.action.findMany({ select: { id: true, name: true, model: true } }),
    prisma.modelAlias.findMany({
      select: {
        alias: true,
        enabled: true,
        models: { select: { model: { select: { name: true, enabled: true } } } },
      },
    }),
  ]);

  const enabledAliasNames = new Set(aliases.filter((a) => a.enabled).map((a) => a.alias));

  // modelName -> 挂载它的启用别名列表
  const aliasesByModelName = new Map<string, string[]>();
  for (const a of aliases) {
    if (!a.enabled) continue;
    for (const link of a.models) {
      const list = aliasesByModelName.get(link.model.name) ?? [];
      list.push(a.alias);
      aliasesByModelName.set(link.model.name, list);
    }
  }

  const plans: Plan[] = [];
  const unresolved: Unresolved[] = [];

  for (const act of actions) {
    if (enabledAliasNames.has(act.model)) continue; // 已经是启用别名，无需处理

    const targets = aliasesByModelName.get(act.model) ?? [];
    if (targets.length === 1) {
      plans.push({ actionId: act.id, actionName: act.name, from: act.model, to: targets[0] });
    } else {
      unresolved.push({
        actionId: act.id,
        actionName: act.name,
        model: act.model,
        reason:
          targets.length === 0
            ? "该模型名没有对应的启用别名（可能是早已失效的历史配置）"
            : `挂在多个启用别名下，无法自动选择：${targets.join(", ")}`,
      });
    }
  }

  console.log(`\nAction 总数 ${actions.length}，需要迁移 ${plans.length}，无法自动处理 ${unresolved.length}\n`);

  if (plans.length > 0) {
    console.log("可迁移：");
    for (const p of plans) {
      console.log(`  ${p.actionName}  "${p.from}" → "${p.to}"  (${p.actionId})`);
    }
  }

  if (unresolved.length > 0) {
    console.log("\n无法自动处理（移除 fallback 后这些 Action 会 404，需人工决定）：");
    for (const u of unresolved) {
      console.log(`  ${u.actionName}  model="${u.model}"  (${u.actionId})`);
      console.log(`      ↳ ${u.reason}`);
    }
  }

  if (!APPLY) {
    console.log("\nDRY-RUN 结束，未写库。确认无误后加 --apply 执行。");
    return;
  }

  if (plans.length === 0) {
    console.log("\n无可迁移项，未写库。");
    return;
  }

  let updated = 0;
  for (const p of plans) {
    await prisma.action.update({ where: { id: p.actionId }, data: { model: p.to } });
    updated++;
  }
  console.log(`\n✅ 已更新 ${updated} 条 Action。`);
  if (unresolved.length > 0) {
    console.log(`⚠️  仍有 ${unresolved.length} 条无法自动处理，见上方清单。`);
  }
}

main()
  .catch((err) => {
    console.error("迁移失败：", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
