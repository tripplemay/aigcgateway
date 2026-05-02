/**
 * BL-SYNC-INTEGRITY-PHASE2 F-SI2-01 — soft-disable orphan zero-price channels.
 *
 * ============================================================================
 *  TARGET (PHASE1 scan 2026-05-02 production: 259 channels)
 *
 *  Strict three-way condition (all must hold):
 *    1) channels.status = 'ACTIVE'
 *    2) channels.sellPrice 三类零价（inputPer1M / outputPer1M / perCall 全为 0
 *       或缺失 → COALESCE → 0）
 *    3) alias_status = 'disabled-alias-only' — model 关联了 alias，但全部
 *       关联 alias 的 enabled = false
 *
 *  Action: soft-disable (status = ACTIVE → DISABLED). Records are NEVER
 *  deleted; reversing is a one-line updateMany flipping status back to
 *  ACTIVE for the printed id list.
 *
 *  Idempotent: 二次跑时 status=DISABLED 已被 c.status='ACTIVE' 过滤，0 affected。
 *
 *  Defaults: DRY_RUN=1 推荐先跑预览。无 DRY_RUN 才真正写库。
 *
 *  v0.9.5 铁律: prisma.$disconnect() + disconnectRedis() in finally.
 * ============================================================================
 *
 * Usage:
 *   DRY_RUN=1 npx tsx scripts/maintenance/disable-orphan-zero-price-channels.ts
 *   npx tsx scripts/maintenance/disable-orphan-zero-price-channels.ts
 */
import { ChannelStatus } from "@prisma/client";
import { prisma } from "../../src/lib/prisma";
import { disconnectRedis } from "../../src/lib/redis";

interface CandidateRow {
  id: string;
  provider: string;
  model: string;
  modality: string;
  channel_status: string;
}

/**
 * Pure helper — defensive id extraction from raw SQL rows.
 *
 * The SQL itself enforces the three-way condition (status=ACTIVE +
 * zero sellPrice + EXISTS+NOT EXISTS for disabled-alias-only). This
 * helper exists primarily for unit testing the contract that:
 *   - rows whose channel_status != 'ACTIVE' are skipped (defence
 *     against future SQL drift)
 *   - duplicate ids collapse
 *   - input order is preserved
 */
export function buildDisableTargetIds(rows: readonly CandidateRow[]): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const row of rows) {
    if (row.channel_status !== "ACTIVE") continue;
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    ids.push(row.id);
  }
  return ids;
}

interface GroupRow {
  provider: string;
  modality: string;
  channelId: string;
  model: string;
}

function groupByProviderModality(rows: readonly CandidateRow[]): Map<string, GroupRow[]> {
  const groups = new Map<string, GroupRow[]>();
  for (const row of rows) {
    const key = `${row.provider}\x00${row.modality}`;
    const list = groups.get(key) ?? [];
    list.push({
      provider: row.provider,
      modality: row.modality,
      channelId: row.id,
      model: row.model,
    });
    groups.set(key, list);
  }
  return groups;
}

function printGroups(rows: readonly CandidateRow[]): void {
  if (rows.length === 0) {
    console.log("[scan] no orphan zero-price ACTIVE channels found.");
    return;
  }
  const groups = groupByProviderModality(rows);
  const sortedKeys = Array.from(groups.keys()).sort();
  console.log(`Found ${rows.length} disabled-alias-only zero-price ACTIVE channel(s):\n`);
  for (const key of sortedKeys) {
    const list = groups.get(key)!;
    const [provider, modality] = key.split("\x00");
    console.log(`  [${provider} / ${modality}]  count=${list.length}`);
    for (const item of list) {
      console.log(`    - id=${item.channelId}  model=${item.model}`);
    }
  }
  console.log("");
}

async function selectCandidates(): Promise<CandidateRow[]> {
  // Strict 3-way condition. EXISTS confirms the model has at least one
  // alias link (rules out no-alias channels), NOT EXISTS confirms no
  // linked alias is enabled (i.e. disabled-alias-only).
  return prisma.$queryRaw<CandidateRow[]>`
    SELECT
      c.id,
      p.name AS provider,
      m.name AS model,
      m.modality::text AS modality,
      c.status::text AS channel_status
    FROM channels c
    JOIN providers p ON p.id = c."providerId"
    JOIN models m ON m.id = c."modelId"
    WHERE c.status = 'ACTIVE'
      AND COALESCE((c."sellPrice"::jsonb->>'inputPer1M')::float, 0) = 0
      AND COALESCE((c."sellPrice"::jsonb->>'outputPer1M')::float, 0) = 0
      AND COALESCE((c."sellPrice"::jsonb->>'perCall')::float, 0) = 0
      AND EXISTS (SELECT 1 FROM alias_model_links aml WHERE aml."modelId" = m.id)
      AND NOT EXISTS (
        SELECT 1 FROM alias_model_links aml
        JOIN model_aliases ma ON ma.id = aml."aliasId"
        WHERE aml."modelId" = m.id AND ma.enabled = true
      )
    ORDER BY p.name, m.modality, m.name, c.id
  `;
}

interface RunResult {
  inspected: number;
  affected: number;
  ids: string[];
}

export async function runDisable(opts: { dryRun: boolean }): Promise<RunResult> {
  const rows = await selectCandidates();
  printGroups(rows);

  const ids = buildDisableTargetIds(rows);

  if (opts.dryRun) {
    console.log(`[dry-run] would disable ${ids.length} channel(s); no DB writes.`);
    if (ids.length > 0) {
      console.log("[dry-run] ids (backup-for-rollback):");
      for (const id of ids) console.log(`  ${id}`);
    }
    console.log("[hint] re-run without DRY_RUN=1 to commit changes.");
    return { inspected: rows.length, affected: 0, ids };
  }

  if (ids.length === 0) {
    console.log("[done] 0 channels matched, nothing to update.");
    return { inspected: 0, affected: 0, ids };
  }

  console.log(`[apply] REAL APPLY (set DRY_RUN=1 to dry-run instead)`);
  const result = await prisma.channel.updateMany({
    where: { id: { in: ids } },
    data: { status: ChannelStatus.DISABLED },
  });
  console.log(`Disabled ${result.count} channels (status=DISABLED).`);
  console.log("Disabled ids (backup-for-rollback):");
  for (const id of ids) console.log(`  ${id}`);

  return { inspected: rows.length, affected: result.count, ids };
}

async function cliMain(): Promise<void> {
  const dryRun = process.env.DRY_RUN === "1";
  console.log(
    `=== F-SI2-01 disable orphan zero-price channels (${dryRun ? "DRY-RUN" : "APPLY"}) ===`,
  );
  try {
    await runDisable({ dryRun });
  } finally {
    await prisma.$disconnect();
    await disconnectRedis();
  }
}

const isDirectRun =
  typeof process.argv[1] === "string" &&
  process.argv[1].endsWith("disable-orphan-zero-price-channels.ts");
if (isDirectRun) {
  cliMain().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

// Exported for unit tests + Codex grep verification.
export const __testing = { buildDisableTargetIds, groupByProviderModality };
