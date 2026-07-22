/**
 * BL-IMG-I2I-VISION F-IIV-07 — image_to_image 能力标记幂等 provisioning。
 *
 * 图生图走「严格门禁」：请求带源图（image 参数）时，模型必须声明
 * `capabilities.image_to_image=true` 才放行（generations/edits/MCP 三入口同门禁，
 * 见 image-generation-core.ts / mcp generate-image.ts）。本脚本对**上游契约
 * 实测通过**的模型幂等补标（顶层 merge，保留其余 capabilities 键）。
 *
 * ⚠️ TARGETS 只准列入探测通过的模型（探测记录见
 * docs/specs/BL-IMG-I2I-VISION-ops.md）。探测未通过/受阻的模型不得加入——
 * 门禁误放行会把源图透传给不支持的上游（已计费才被拒）。
 *
 * 存活性（D8，2026-07-22 核验）：
 * - 常规 model-sync / alias-classifier 对已有 capabilities 仅填空不覆盖
 *   （model-sync.ts:312 注释、alias-classifier.ts:354-366 / :549-550）→ 本标记存活。
 * - `reinferAllCapabilities`（一次性迁移函数，admin run-inference 触发）Step 2
 *   会 LLM 推断**全量覆盖** capabilities → 会抹掉本标记。**重跑该函数后必须
 *   重跑本脚本 --apply**（已在 ops 文档标注）。
 *
 * 用法：
 *   npx tsx scripts/provision-i2i-capabilities.ts            # dry-run（默认）
 *   npx tsx scripts/provision-i2i-capabilities.ts --apply    # 写库 + 清 models:list 缓存
 *   APPLY=1 npx tsx scripts/provision-i2i-capabilities.ts
 *
 * 回滚：将 alias 的 capabilities.image_to_image 置 false（或删键）即可关闭门禁
 * 放行；纯数据操作无 schema 变更。
 */

import { PrismaClient, type ModelModality } from "@prisma/client";
import { invalidateModelsListCache } from "../src/lib/cache/models-cache";
import { disconnectRedis } from "../src/lib/redis";

/**
 * 探测通过清单（唯一事实源：docs/specs/BL-IMG-I2I-VISION-ops.md）。
 * - seedream-4-5：2026-07-22 实测通过（images 端点 image 字段，URL/数组/base64 全通）
 * - gpt-5-image / gemini-3-pro-image：F-IIV-05 探测受阻（OpenRouter 余额耗尽），
 *   探测通过后再追加到此清单并重跑 --apply。
 */
const TARGETS: string[] = ["seedream-4-5"];

function readI2i(capabilities: unknown): boolean {
  return (
    typeof capabilities === "object" &&
    capabilities !== null &&
    (capabilities as { image_to_image?: unknown }).image_to_image === true
  );
}

export interface ProvisionI2iResult {
  totalImageAliases: number;
  /** 全部 enabled IMAGE alias 的现状盘点：alias → image_to_image 当前值 */
  inventory: Array<{ alias: string; i2i: boolean }>;
  alreadyProvisioned: string[];
  /** 待补清单（dry-run 下即计划写入项） */
  candidates: string[];
  provisioned: string[];
  missing: string[];
}

/**
 * 盘点 enabled IMAGE alias 的 image_to_image 标记；对 TARGETS 中未标 true 的
 * 幂等补标（顶层 merge 保留其余键）。dryRun=true 仅盘点不写库。
 */
export async function provisionI2iCapabilities(
  prisma: PrismaClient,
  opts: { dryRun?: boolean } = {},
): Promise<ProvisionI2iResult> {
  const dryRun = opts.dryRun ?? true;

  const aliases = await prisma.modelAlias.findMany({
    where: { enabled: true, modality: "IMAGE" as ModelModality },
    select: { id: true, alias: true, capabilities: true },
    orderBy: { alias: "asc" },
  });

  const inventory = aliases.map((a) => ({ alias: a.alias, i2i: readI2i(a.capabilities) }));
  const alreadyProvisioned: string[] = [];
  const candidates: string[] = [];
  const provisioned: string[] = [];
  const missing: string[] = [];

  for (const target of TARGETS) {
    const row = aliases.find((a) => a.alias === target);
    if (!row) {
      missing.push(target);
      continue;
    }
    if (readI2i(row.capabilities)) {
      alreadyProvisioned.push(target);
      continue;
    }
    candidates.push(target);
    if (dryRun) continue;

    const existing =
      typeof row.capabilities === "object" && row.capabilities !== null
        ? (row.capabilities as Record<string, unknown>)
        : {};
    await prisma.modelAlias.update({
      where: { id: row.id },
      data: { capabilities: { ...existing, image_to_image: true } },
    });
    provisioned.push(target);
  }

  return {
    totalImageAliases: aliases.length,
    inventory,
    alreadyProvisioned,
    candidates,
    provisioned,
    missing,
  };
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
      ? "[DRY RUN] 不写库；盘点 image_to_image 标记 + 打印待补清单。加 --apply 真正写入。"
      : "[APPLY] 幂等补全探测通过模型的 capabilities.image_to_image=true...",
  );
  console.log(`探测通过清单（TARGETS）: ${TARGETS.join(", ")}`);
  console.log();
  try {
    const r = await provisionI2iCapabilities(prisma, { dryRun });
    console.log(`enabled IMAGE aliases: ${r.totalImageAliases}`);
    console.log(
      `现状盘点: ${r.inventory.map((i) => `${i.alias}=${i.i2i ? "✓" : "✗"}`).join(", ") || "(无)"}`,
    );
    console.log(
      `已标 image_to_image=true (${r.alreadyProvisioned.length}): ${r.alreadyProvisioned.join(", ") || "(无)"}`,
    );
    if (r.missing.length > 0) {
      console.log(`⚠️ TARGETS 中不存在/未启用的 alias: ${r.missing.join(", ")}`);
    }
    if (dryRun) {
      console.log(`待补 (${r.candidates.length}): ${r.candidates.join(", ") || "(无)"}`);
      console.log("\n请 review 上方待补清单，确认无误后加 --apply 写入。");
    } else {
      console.log(`本次补标记 (${r.provisioned.length}): ${r.provisioned.join(", ") || "(无)"}`);
      invalidateModelsListCache();
      console.log("已清 models:list* 缓存。");
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
  process.argv[1].endsWith("provision-i2i-capabilities.ts");

if (isDirectRun) {
  cli().catch((err) => {
    console.error("[provision-i2i-capabilities] failed:", err);
    process.exitCode = 1;
  });
}
