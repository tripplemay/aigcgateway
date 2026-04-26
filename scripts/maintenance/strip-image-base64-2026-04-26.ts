/**
 * BL-IMAGE-LOG-DISPLAY-FIX F-ILDF-03 — 历史 30 天 call_logs base64 image 回填。
 *
 * 处理 OR-P2 fix_round 2 之前累积的"OR image base64 落库"记录。每条 row
 * 把 responseContent 和 responseSummary.original_urls 里 `data:image/...`
 * 转成 `[image:fmt, NKB]` metadata（同 F-ILDF-01 summarizeImageUrl）。
 *
 * 用法：
 *   npx tsx scripts/maintenance/strip-image-base64-2026-04-26.ts           # dry-run
 *   npx tsx scripts/maintenance/strip-image-base64-2026-04-26.ts --apply   # 实际写入
 *
 * 范围：createdAt > now - 30d（与 P2 call_logs TTL 对齐）。
 *
 * 幂等：metadata 字符串不以 `data:` 开头，summarizeImageUrl 直接透传 →
 * before==after → 该行不计入 update batch。
 *
 * v0.9.5 铁律：CLI 退出前 close prisma + redis。
 */
import { prisma } from "../../src/lib/prisma";
import { disconnectRedis } from "../../src/lib/redis";
import { summarizeImageUrl } from "../../src/lib/api/post-process";

const TTL_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

interface BackfillRow {
  id: string;
  responseContent: string | null;
  responseSummary: unknown;
}

interface BackfillPlan {
  id: string;
  beforeContentSize: number;
  afterContent: string | null;
  afterSummary: unknown;
  changed: boolean;
}

/**
 * 把单条 call_log 的 responseContent + responseSummary.original_urls 跑过
 * summarizeImageUrl，返回 plan（含 changed 标志，让 caller 决定是否 update）。
 */
export function planBackfillRow(row: BackfillRow): BackfillPlan {
  const beforeContent = row.responseContent;
  const afterContent = summarizeImageUrl(beforeContent);
  let summaryChanged = false;
  let afterSummary: unknown = row.responseSummary;
  if (row.responseSummary && typeof row.responseSummary === "object") {
    const summary = { ...(row.responseSummary as Record<string, unknown>) };
    const orig = summary.original_urls;
    if (Array.isArray(orig)) {
      const next = orig.map((u) =>
        typeof u === "string" ? (summarizeImageUrl(u) ?? u) : u,
      );
      const before = JSON.stringify(orig);
      const after = JSON.stringify(next);
      if (before !== after) {
        summary.original_urls = next;
        summaryChanged = true;
        afterSummary = summary;
      }
    }
  }
  const contentChanged = (beforeContent ?? null) !== (afterContent ?? null);
  return {
    id: row.id,
    beforeContentSize: beforeContent?.length ?? 0,
    afterContent,
    afterSummary,
    changed: contentChanged || summaryChanged,
  };
}

interface RunOptions {
  apply: boolean;
}

export async function runBackfill(opts: RunOptions): Promise<{
  inspected: number;
  changed: number;
  unchanged: number;
}> {
  const cutoff = new Date(Date.now() - TTL_DAYS * DAY_MS);
  // 用 raw SQL 限定：createdAt 内 + responseContent 字段值含 `data:image/`。
  // LIKE 'data:image/%' 必须前缀匹配；同时挑大于 10KB 的（小于该阈值的 row
  // 即便有 data: 前缀也不需要 strip 占位，但保留前缀过滤是为了排除掉无关
  // text 行）。
  const rows = await prisma.callLog.findMany({
    where: {
      createdAt: { gte: cutoff },
      OR: [
        { responseContent: { startsWith: "data:image/" } },
        // gateway 早期可能只在 summary 写 base64（罕见），这里多一层保护
        { responseContent: { contains: "data:image/" } },
      ],
    },
    select: {
      id: true,
      responseContent: true,
      responseSummary: true,
    },
  });

  let changed = 0;
  let unchanged = 0;
  for (const row of rows) {
    const plan = planBackfillRow(row);
    if (!plan.changed) {
      unchanged += 1;
      continue;
    }
    changed += 1;
    console.log(
      `[${opts.apply ? "apply " : "dry-run"}] ${row.id} ` +
        `(${plan.beforeContentSize}B → ${(plan.afterContent ?? "").length}B) ` +
        `${plan.afterContent ?? "(null)"}`,
    );
    if (opts.apply) {
      await prisma.callLog.update({
        where: { id: row.id },
        data: {
          responseContent: plan.afterContent,
          responseSummary: plan.afterSummary as object,
        },
      });
    }
  }
  return { inspected: rows.length, changed, unchanged };
}

async function cliMain(): Promise<void> {
  const apply = process.argv.slice(2).includes("--apply");
  console.log(
    `=== F-ILDF-03 strip image base64 (${apply ? "APPLY" : "DRY-RUN"}) — TTL=${TTL_DAYS}d ===`,
  );
  try {
    const { inspected, changed, unchanged } = await runBackfill({ apply });
    console.log(
      `\nSummary: ${inspected} inspected; ${changed} ${apply ? "updated" : "would update"}; ${unchanged} unchanged.`,
    );
    if (!apply) console.log("[hint] re-run with --apply to commit changes.");
  } finally {
    await prisma.$disconnect();
    await disconnectRedis();
  }
}

const isDirectRun =
  typeof process.argv[1] === "string" &&
  process.argv[1].endsWith("strip-image-base64-2026-04-26.ts");
if (isDirectRun) {
  cliMain().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
