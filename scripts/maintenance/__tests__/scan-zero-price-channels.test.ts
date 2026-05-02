/**
 * BL-SYNC-INTEGRITY-PHASE1 F-SI-03 + PHASE2 F-SI2-03 — pure helpers in
 * scan-zero-price-channels.ts.
 *
 * The DB-touching path is exercised manually (Generator smoke + Codex
 * F-SI2-04 dev-DB run); these unit tests pin the pure logic — group key
 * construction across the four `alias_status` buckets and CSV cell
 * escaping — that determines what lands in the report.
 */
import { describe, it, expect } from "vitest";
import { __testing } from "../scan-zero-price-channels";
import type { AliasStatusBucket } from "../../../src/lib/sql/alias-status";

const { buildSummary, csvEscape } = __testing;

type ZeroPriceRow = Parameters<typeof buildSummary>[0][number];

const row = (overrides: Partial<ZeroPriceRow>): ZeroPriceRow =>
  ({
    channel_id: "ch_default",
    realModelId: "x",
    provider_name: "p",
    model_name: "x",
    modality: "TEXT",
    model_enabled: true,
    channel_status: "ACTIVE",
    sellPrice: null,
    costPrice: null,
    alias_status: "disabledAliasOnly" satisfies AliasStatusBucket,
    associated_aliases: [],
    ...overrides,
  }) as ZeroPriceRow;

describe("buildSummary (PHASE2 three-dim alias_status)", () => {
  it("groups by (provider, modality, aliasStatus) across all 4 buckets", () => {
    const rows: ZeroPriceRow[] = [
      // openrouter / TEXT — three buckets present
      row({ channel_id: "or-1", provider_name: "openrouter", alias_status: "enabledAliasPriced" }),
      row({ channel_id: "or-2", provider_name: "openrouter", alias_status: "enabledAliasPriced" }),
      row({ channel_id: "or-3", provider_name: "openrouter", alias_status: "disabledAliasOnly" }),
      row({ channel_id: "or-4", provider_name: "openrouter", alias_status: "noAlias" }),
      // siliconflow / TEXT — single bucket
      row({ channel_id: "sf-1", provider_name: "siliconflow", alias_status: "enabledAliasUnpriced" }),
    ];
    const summary = buildSummary(rows);

    expect(summary).toEqual([
      {
        provider: "openrouter",
        modality: "TEXT",
        aliasStatus: "enabledAliasPriced",
        count: 2,
        sampleChannelId: "or-1",
      },
      {
        provider: "openrouter",
        modality: "TEXT",
        aliasStatus: "disabledAliasOnly",
        count: 1,
        sampleChannelId: "or-3",
      },
      {
        provider: "openrouter",
        modality: "TEXT",
        aliasStatus: "noAlias",
        count: 1,
        sampleChannelId: "or-4",
      },
      {
        provider: "siliconflow",
        modality: "TEXT",
        aliasStatus: "enabledAliasUnpriced",
        count: 1,
        sampleChannelId: "sf-1",
      },
    ]);
  });

  it("sorts buckets by canonical priority (enabledAliasPriced first, noAlias last) within (provider, modality)", () => {
    // Input order intentionally mixed so sort is exercised.
    const rows: ZeroPriceRow[] = [
      row({ channel_id: "a", provider_name: "qwen", alias_status: "noAlias" }),
      row({ channel_id: "b", provider_name: "qwen", alias_status: "enabledAliasPriced" }),
      row({ channel_id: "c", provider_name: "qwen", alias_status: "disabledAliasOnly" }),
      row({ channel_id: "d", provider_name: "qwen", alias_status: "enabledAliasUnpriced" }),
    ];
    const summary = buildSummary(rows);
    expect(summary.map((r) => r.aliasStatus)).toEqual([
      "enabledAliasPriced",
      "enabledAliasUnpriced",
      "disabledAliasOnly",
      "noAlias",
    ]);
  });

  it("sample_channel_id is the first row in the group (input order)", () => {
    const rows: ZeroPriceRow[] = [
      row({ channel_id: "first" }),
      row({ channel_id: "second" }),
    ];
    const summary = buildSummary(rows);
    expect(summary).toHaveLength(1);
    expect(summary[0].sampleChannelId).toBe("first");
  });

  it("returns an empty array when input is empty", () => {
    expect(buildSummary([])).toEqual([]);
  });
});

describe("csvEscape", () => {
  it("returns plain text unchanged when no special characters", () => {
    expect(csvEscape("openrouter")).toBe("openrouter");
    expect(csvEscape(42)).toBe("42");
    expect(csvEscape(true)).toBe("true");
  });

  it("wraps + escapes when comma / quote / newline present", () => {
    expect(csvEscape("a,b")).toBe('"a,b"');
    expect(csvEscape('he said "hi"')).toBe('"he said ""hi"""');
    expect(csvEscape("line1\nline2")).toBe('"line1\nline2"');
  });

  it("turns null/undefined into empty string", () => {
    expect(csvEscape(null)).toBe("");
    expect(csvEscape(undefined)).toBe("");
  });
});
