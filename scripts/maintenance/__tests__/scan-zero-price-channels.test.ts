/**
 * BL-SYNC-INTEGRITY-PHASE1 F-SI-03 — pure helpers in scan-zero-price-channels.ts.
 *
 * The DB-touching path is exercised manually (Generator smoke + Codex F-SI-04
 * dev-DB run); these unit tests pin the pure logic — group key construction,
 * any-enabled-alias detection, and CSV cell escaping — that determines what
 * lands in the report.
 */
import { describe, it, expect } from "vitest";
import { __testing } from "../scan-zero-price-channels";

const { buildSummary, hasEnabledAlias, csvEscape } = __testing;

const row = (overrides: Partial<Parameters<typeof hasEnabledAlias>[0]>): Parameters<typeof hasEnabledAlias>[0] =>
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
    associated_aliases: [],
    ...overrides,
  }) as Parameters<typeof hasEnabledAlias>[0];

describe("hasEnabledAlias", () => {
  it("returns true when at least one linked alias is enabled", () => {
    expect(
      hasEnabledAlias(
        row({ associated_aliases: [{ alias: "a1", enabled: false }, { alias: "a2", enabled: true }] }),
      ),
    ).toBe(true);
  });

  it("returns false when all linked aliases are disabled", () => {
    expect(
      hasEnabledAlias(row({ associated_aliases: [{ alias: "a1", enabled: false }] })),
    ).toBe(false);
  });

  it("returns false when there are no linked aliases", () => {
    expect(hasEnabledAlias(row({ associated_aliases: [] }))).toBe(false);
    expect(hasEnabledAlias(row({ associated_aliases: null }))).toBe(false);
  });
});

describe("buildSummary", () => {
  it("groups by (provider, modality, hasEnabledAlias) and counts rows", () => {
    const rows = [
      row({ channel_id: "c1", provider_name: "openrouter", modality: "TEXT", associated_aliases: [{ alias: "a", enabled: true }] }),
      row({ channel_id: "c2", provider_name: "openrouter", modality: "TEXT", associated_aliases: [{ alias: "b", enabled: true }] }),
      row({ channel_id: "c3", provider_name: "openrouter", modality: "TEXT", associated_aliases: [] }),
      row({ channel_id: "c4", provider_name: "openrouter", modality: "IMAGE", associated_aliases: [] }),
      row({ channel_id: "c5", provider_name: "siliconflow", modality: "TEXT", associated_aliases: [{ alias: "c", enabled: false }] }),
    ];
    const summary = buildSummary(rows);

    expect(summary).toEqual([
      { provider: "openrouter", modality: "IMAGE", hasEnabledAlias: false, count: 1, sampleChannelId: "c4" },
      { provider: "openrouter", modality: "TEXT", hasEnabledAlias: false, count: 1, sampleChannelId: "c3" },
      { provider: "openrouter", modality: "TEXT", hasEnabledAlias: true, count: 2, sampleChannelId: "c1" },
      { provider: "siliconflow", modality: "TEXT", hasEnabledAlias: false, count: 1, sampleChannelId: "c5" },
    ]);
  });

  it("sample_channel_id is the first row in the group (input order)", () => {
    const rows = [
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
