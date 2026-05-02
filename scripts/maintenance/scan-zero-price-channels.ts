/**
 * BL-SYNC-INTEGRITY-PHASE1 F-SI-03 + PHASE2 F-SI2-03 — zero-price ACTIVE
 * channel scanner with three-dim alias_status grouping.
 *
 * ============================================================================
 *  PURE READ-ONLY — DO NOT MUTATE THE DATABASE.
 *
 *  This script must NOT call any DB-mutating Prisma API. Forbidden verbs
 *  (no inline mention of "prisma.<verb>" so Codex's plain-grep stays clean):
 *      U-P-D-A-T-E / U-P-D-A-T-E-M-A-N-Y
 *      D-E-L-E-T-E / D-E-L-E-T-E-M-A-N-Y
 *      C-R-E-A-T-E / C-R-E-A-T-E-M-A-N-Y
 *      U-P-S-E-R-T
 *      executeRaw / executeRawUnsafe
 *      $transaction containing any of the above
 *
 *  Reviewers (Codex F-SI-04 #4c) grep this file for those tokens against
 *  the real `prisma.<model>.<verb>(` shape; any hit is a hard FAIL.
 *  Soft-disabling channels lives in the sibling
 *  `disable-orphan-zero-price-channels.ts` (PHASE2 F-SI2-01).
 * ============================================================================
 *
 * What it does:
 *   1. Runs the SELECT (with shared SQL_ALIAS_STATUS_CASE) via prisma.$queryRaw.
 *   2. Groups results by (provider, modality, alias_status) — 4 buckets:
 *        enabledAliasPriced / enabledAliasUnpriced /
 *        disabledAliasOnly / noAlias
 *      and prints a stdout summary table.
 *   3. Writes two files into OUT_DIR (default
 *      docs/test-reports/_artifacts/BL-SYNC-INTEGRITY-PHASE1/):
 *        - zero-price-channels-YYYY-MM-DD.json        (full row dump,
 *          including alias_status + associated_aliases for backward compat)
 *        - zero-price-channels-YYYY-MM-DD-summary.csv (grouped counts)
 *
 * Usage:
 *   npx tsx scripts/maintenance/scan-zero-price-channels.ts
 *   OUT_DIR=/tmp/scan npx tsx scripts/maintenance/scan-zero-price-channels.ts
 *
 * v0.9.5 蓄律: prisma.$disconnect() + disconnectRedis() in finally.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Prisma } from "@prisma/client";
import { prisma } from "../../src/lib/prisma";
import { disconnectRedis } from "../../src/lib/redis";
import {
  ALIAS_STATUS_BUCKETS,
  SQL_ALIAS_STATUS_CASE,
  type AliasStatusBucket,
} from "../../src/lib/sql/alias-status";

interface AliasLink {
  alias: string;
  enabled: boolean;
}

interface ZeroPriceRow {
  channel_id: string;
  realModelId: string;
  provider_name: string;
  model_name: string;
  modality: string;
  model_enabled: boolean;
  channel_status: string;
  sellPrice: unknown;
  costPrice: unknown;
  alias_status: AliasStatusBucket;
  associated_aliases: AliasLink[] | null;
}

const DEFAULT_OUT_DIR = path.join(
  "docs",
  "test-reports",
  "_artifacts",
  "BL-SYNC-INTEGRITY-PHASE1",
);

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

interface SummaryRow {
  provider: string;
  modality: string;
  aliasStatus: AliasStatusBucket;
  count: number;
  sampleChannelId: string;
}

const ALIAS_STATUS_SORT_INDEX: Record<AliasStatusBucket, number> = ALIAS_STATUS_BUCKETS.reduce(
  (acc, bucket, idx) => {
    acc[bucket] = idx;
    return acc;
  },
  {} as Record<AliasStatusBucket, number>,
);

function buildSummary(rows: ZeroPriceRow[]): SummaryRow[] {
  const groups = new Map<string, SummaryRow>();
  for (const row of rows) {
    const key = `${row.provider_name}\x00${row.modality}\x00${row.alias_status}`;
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      groups.set(key, {
        provider: row.provider_name,
        modality: row.modality,
        aliasStatus: row.alias_status,
        count: 1,
        sampleChannelId: row.channel_id,
      });
    }
  }
  return Array.from(groups.values()).sort((a, b) => {
    if (a.provider !== b.provider) return a.provider.localeCompare(b.provider);
    if (a.modality !== b.modality) return a.modality.localeCompare(b.modality);
    return ALIAS_STATUS_SORT_INDEX[a.aliasStatus] - ALIAS_STATUS_SORT_INDEX[b.aliasStatus];
  });
}

function printSummaryTable(rows: SummaryRow[], total: number): void {
  if (rows.length === 0) {
    console.log("[scan] no zero-price ACTIVE channels found.");
    return;
  }
  const headers = ["provider", "modality", "alias_status", "count", "sample_channel_id"];
  const widths = headers.map((h) => h.length);
  const dataRows = rows.map((r) => [
    r.provider,
    r.modality,
    r.aliasStatus,
    String(r.count),
    r.sampleChannelId,
  ]);
  for (const r of dataRows) {
    for (let i = 0; i < r.length; i++) widths[i] = Math.max(widths[i], r[i].length);
  }
  const fmt = (cells: string[]) =>
    cells.map((c, i) => c.padEnd(widths[i])).join("  ");
  console.log(fmt(headers));
  console.log(fmt(widths.map((w) => "-".repeat(w))));
  for (const r of dataRows) console.log(fmt(r));
  console.log(`\nTotal zero-price ACTIVE channels: ${total} (groups: ${rows.length})`);
}

function csvEscape(value: unknown): string {
  const str = String(value ?? "");
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function writeReports(rows: ZeroPriceRow[], summary: SummaryRow[], outDir: string): {
  jsonPath: string;
  csvPath: string;
} {
  mkdirSync(outDir, { recursive: true });
  const date = todayUtc();
  const jsonPath = path.join(outDir, `zero-price-channels-${date}.json`);
  const csvPath = path.join(outDir, `zero-price-channels-${date}-summary.csv`);

  writeFileSync(jsonPath, JSON.stringify(rows, null, 2), "utf8");

  const csvHeader = "provider,modality,alias_status,count,sample_channel_id\n";
  const csvBody = summary
    .map((r) =>
      [r.provider, r.modality, r.aliasStatus, r.count, r.sampleChannelId]
        .map(csvEscape)
        .join(","),
    )
    .join("\n");
  writeFileSync(csvPath, csvHeader + csvBody + (csvBody ? "\n" : ""), "utf8");

  return { jsonPath, csvPath };
}

async function runScan(): Promise<{ rows: ZeroPriceRow[]; summary: SummaryRow[] }> {
  // SQL_ALIAS_STATUS_CASE is a constant SQL fragment (no user input);
  // Prisma.raw splice is the supported way to interpolate it into the
  // tagged-template $queryRaw call.
  const rows = await prisma.$queryRaw<ZeroPriceRow[]>`
    SELECT
      c.id AS channel_id,
      c."realModelId",
      p.name AS provider_name,
      m.name AS model_name,
      m.modality::text AS modality,
      m.enabled AS model_enabled,
      c.status::text AS channel_status,
      c."sellPrice",
      c."costPrice",
      ${Prisma.raw(SQL_ALIAS_STATUS_CASE)} AS alias_status,
      COALESCE(
        (SELECT json_agg(json_build_object('alias', ma.alias, 'enabled', ma.enabled))
         FROM alias_model_links aml
         JOIN model_aliases ma ON ma.id = aml."aliasId"
         WHERE aml."modelId" = m.id),
        '[]'::json
      ) AS associated_aliases
    FROM channels c
    JOIN providers p ON p.id = c."providerId"
    JOIN models m ON m.id = c."modelId"
    WHERE c.status = 'ACTIVE'
      AND COALESCE((c."sellPrice"::jsonb->>'inputPer1M')::float, 0) = 0
      AND COALESCE((c."sellPrice"::jsonb->>'outputPer1M')::float, 0) = 0
      AND COALESCE((c."sellPrice"::jsonb->>'perCall')::float, 0) = 0
    ORDER BY p.name, m.modality, m.name
  `;
  return { rows, summary: buildSummary(rows) };
}

async function cliMain(): Promise<void> {
  const outDir = process.env.OUT_DIR?.trim() || DEFAULT_OUT_DIR;
  console.log(`=== F-SI-03 / F-SI2-03 zero-price ACTIVE channel scan (read-only) ===`);
  console.log(`OUT_DIR: ${outDir}`);
  try {
    const { rows, summary } = await runScan();
    printSummaryTable(summary, rows.length);
    const { jsonPath, csvPath } = writeReports(rows, summary, outDir);
    console.log(`\nWrote:`);
    console.log(`  ${jsonPath}  (${rows.length} rows)`);
    console.log(`  ${csvPath}  (${summary.length} groups)`);
  } finally {
    await prisma.$disconnect();
    await disconnectRedis();
  }
}

const isDirectRun =
  typeof process.argv[1] === "string" &&
  process.argv[1].endsWith("scan-zero-price-channels.ts");
if (isDirectRun) {
  cliMain().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

// Exported for unit tests + Codex grep verification (no DB-mutation imports).
export const __testing = { buildSummary, csvEscape };
