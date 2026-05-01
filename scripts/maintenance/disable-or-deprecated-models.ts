/**
 * BL-HEALTH-PROBE-MIN-TOKENS F-HPMT-02 — disable OR-deprecated models.
 *
 * 软停 OpenRouter 已下线的 model 及其 channels：
 *   - models.enabled = false
 *   - channels.status = 'DISABLED'
 *
 * 不删除任何 channels / models / health_checks / call_logs 记录，
 * 保留审计；OR 复上线时 UPDATE 回 ACTIVE 即可恢复。
 *
 * 用法：
 *   DRY_RUN=1 npx tsx scripts/maintenance/disable-or-deprecated-models.ts   # 仅打印
 *   npx tsx scripts/maintenance/disable-or-deprecated-models.ts             # 实际写库
 *
 * 幂等：
 *   - 二次跑：model.enabled 已 false / channel.status 已 DISABLED，
 *     重复 UPDATE 不抛错（Prisma 接受同值 update）。
 *
 * 来源：BL-HEALTH-PROBE-MIN-TOKENS backlog decisions 第 4 条
 *       (curl https://openrouter.ai/api/v1/models 已无 ~openai/gpt-latest)
 *
 * v0.9.5 铁律：CLI 退出前 close prisma + redis。
 */
import { ChannelStatus } from "@prisma/client";
import { prisma } from "../../src/lib/prisma";
import { disconnectRedis } from "../../src/lib/redis";

/**
 * OpenRouter 已下线的 model name 列表。
 * 通过 models.name 字段精确匹配（findUnique），避免误伤。
 *
 * 当 OR 再下线其他 model 时，追加到这里复用同一脚本即可。
 */
const DEPRECATED_MODEL_NAMES: readonly string[] = [
  // OR 2026-05 已下线（curl https://openrouter.ai/api/v1/models 无该 id）。
  "~openai/gpt-latest",
];

interface RunResult {
  inspected: number;
  affectedModels: number;
  affectedChannels: number;
}

export async function runDisable(opts: { dryRun: boolean }): Promise<RunResult> {
  let affectedModels = 0;
  let affectedChannels = 0;

  for (const name of DEPRECATED_MODEL_NAMES) {
    const model = await prisma.model.findUnique({
      where: { name },
      include: { channels: true },
    });

    if (!model) {
      console.log(`[skip] model "${name}" not found, nothing to do`);
      continue;
    }

    console.log(
      `[target] model="${name}" id=${model.id} enabled=${model.enabled} channels=${model.channels.length}`,
    );
    for (const ch of model.channels) {
      console.log(`           - channel id=${ch.id} status=${ch.status}`);
    }

    if (opts.dryRun) {
      console.log(`[dry-run] no DB writes for model "${name}"`);
      continue;
    }

    await prisma.$transaction([
      prisma.model.update({
        where: { id: model.id },
        data: { enabled: false },
      }),
      prisma.channel.updateMany({
        where: { modelId: model.id },
        data: { status: ChannelStatus.DISABLED },
      }),
    ]);

    affectedModels += 1;
    affectedChannels += model.channels.length;
    console.log(
      `[done] disabled model "${name}" + ${model.channels.length} channel(s) (status=DISABLED)`,
    );
  }

  return {
    inspected: DEPRECATED_MODEL_NAMES.length,
    affectedModels,
    affectedChannels,
  };
}

async function cliMain(): Promise<void> {
  const dryRun = process.env.DRY_RUN === "1";
  console.log(
    `=== F-HPMT-02 disable OR-deprecated models (${dryRun ? "DRY-RUN" : "APPLY"}) ===`,
  );
  try {
    const { inspected, affectedModels, affectedChannels } = await runDisable({ dryRun });
    console.log(
      `\nSummary: inspected=${inspected} model name(s); ${dryRun ? "would update" : "updated"} ${affectedModels} model(s) + ${affectedChannels} channel(s).`,
    );
    if (dryRun) {
      console.log("[hint] re-run without DRY_RUN=1 to commit changes.");
    }
  } finally {
    await prisma.$disconnect();
    await disconnectRedis();
  }
}

const isDirectRun =
  typeof process.argv[1] === "string" &&
  process.argv[1].endsWith("disable-or-deprecated-models.ts");
if (isDirectRun) {
  cliMain().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
