/**
 * BL-VISION-INPUT F-VI-04 — vision 能力标记盘点 + 幂等补漏。
 *
 * BL-VISION-INPUT 的图片输入走「严格门禁」：请求含图片时，模型必须声明
 * `capabilities.vision=true` 才放行（见 chat/completions route F-VI-02）。
 * vision 标记由 alias-classifier 在 model sync 时自动推断写在 ModelAlias 上，
 * 但历史 alias 可能有遗漏 → 本脚本盘点现状并对「已知 vision 模型」幂等补 true，
 * 避免门禁误拒本可使用的模型。
 *
 * 安全：dry-run 默认仅读现状 + 打印待补清单，**请先 review 待补清单再 --apply**。
 * 仅对名称匹配已知 vision 模式且 vision≠true 的 enabled TEXT alias 补标记；
 * 合并写入（保留其余 capabilities 字段），不动其他模型。
 *
 * 用法：
 *   npx tsx scripts/audit-vision-capabilities.ts            # dry-run（默认）
 *   npx tsx scripts/audit-vision-capabilities.ts --apply    # 写库 + 清 models:list 缓存
 *   APPLY=1 npx tsx scripts/audit-vision-capabilities.ts
 *
 * 已知 vision 模型清单来源：各服务商官方多模态模型文档（OpenAI gpt-4o/4.1/5、
 * Anthropic Claude 3+/4、Google Gemini、Qwen-VL、Zhipu GLM-4V、StepFun step-*v、
 * Moonshot Kimi-VL、xAI Grok vision、Mistral Pixtral、Llama 3.2 Vision、
 * ByteDance Doubao vision）。新增 vision 模型时在 VISION_NAME_PATTERNS 追加。
 */

import { PrismaClient, type ModelModality } from "@prisma/client";
import { invalidateModelsListCache } from "../src/lib/cache/models-cache";
import { disconnectRedis } from "../src/lib/redis";

/** 已知 vision 模型的 alias 名匹配模式（小写后匹配）。 */
const VISION_NAME_PATTERNS: RegExp[] = [
  /gpt-4o/,
  /gpt-4\.1/,
  /gpt-4-turbo/,
  /gpt-5/,
  /chatgpt-4o/,
  /claude-3/,
  /claude-(sonnet|opus|haiku)/,
  /claude-4/,
  /gemini/,
  /qwen.*vl/,
  /glm-4(\.\d+)?v/,
  /step-1v/,
  /step-1o/,
  /step-3/,
  /kimi.*vl/,
  /moonshot.*vision/,
  /grok.*vision/,
  /grok-4/,
  /pixtral/,
  /llama.*vision/,
  /llama-3\.2/,
  /internvl/,
  /llava/,
  /doubao.*vision/,
];

function isKnownVisionName(alias: string): boolean {
  const lower = alias.toLowerCase();
  return VISION_NAME_PATTERNS.some((re) => re.test(lower));
}

function readVision(capabilities: unknown): boolean {
  return (
    typeof capabilities === "object" &&
    capabilities !== null &&
    (capabilities as { vision?: unknown }).vision === true
  );
}

export interface AuditVisionResult {
  totalTextAliases: number;
  alreadyVision: string[];
  backfilled: string[];
  /** 名称匹配 vision 但本次未写（dry-run 下即待补清单） */
  candidates: string[];
}

/**
 * 盘点 enabled TEXT alias 的 vision 标记；对已知 vision 模型中 vision≠true 的补标记。
 * dryRun=true 时不写库，仅返回盘点结果。幂等：已 vision=true 的不重复写。
 */
export async function auditVisionCapabilities(
  prisma: PrismaClient,
  opts: { dryRun?: boolean } = {},
): Promise<AuditVisionResult> {
  const dryRun = opts.dryRun ?? true;

  const aliases = await prisma.modelAlias.findMany({
    where: { enabled: true, modality: "TEXT" as ModelModality },
    select: { id: true, alias: true, capabilities: true },
    orderBy: { alias: "asc" },
  });

  const alreadyVision: string[] = [];
  const candidates: string[] = [];
  const backfilled: string[] = [];

  for (const a of aliases) {
    const hasVision = readVision(a.capabilities);
    if (hasVision) {
      alreadyVision.push(a.alias);
      continue;
    }
    if (!isKnownVisionName(a.alias)) continue;

    candidates.push(a.alias);
    if (dryRun) continue;

    const existing =
      typeof a.capabilities === "object" && a.capabilities !== null
        ? (a.capabilities as Record<string, unknown>)
        : {};
    await prisma.modelAlias.update({
      where: { id: a.id },
      data: { capabilities: { ...existing, vision: true } },
    });
    backfilled.push(a.alias);
  }

  return { totalTextAliases: aliases.length, alreadyVision, candidates, backfilled };
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
      ? "[DRY RUN] 不写库；盘点 vision 标记 + 打印待补清单。加 --apply 真正写入。"
      : "[APPLY] 幂等补全已知 vision 模型的 capabilities.vision=true...",
  );
  console.log();
  try {
    const r = await auditVisionCapabilities(prisma, { dryRun });
    console.log(`enabled TEXT aliases: ${r.totalTextAliases}`);
    console.log(`已 vision=true (${r.alreadyVision.length}): ${r.alreadyVision.join(", ") || "(无)"}`);
    if (dryRun) {
      console.log(
        `待补 vision=true (${r.candidates.length}): ${r.candidates.join(", ") || "(无)"}`,
      );
      console.log("\n请 review 上方待补清单，确认无误后加 --apply 写入。");
    } else {
      console.log(`本次补标记 (${r.backfilled.length}): ${r.backfilled.join(", ") || "(无)"}`);
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
  process.argv[1].endsWith("audit-vision-capabilities.ts");

if (isDirectRun) {
  cli().catch((err) => {
    console.error("[audit-vision-capabilities] failed:", err);
    process.exitCode = 1;
  });
}
