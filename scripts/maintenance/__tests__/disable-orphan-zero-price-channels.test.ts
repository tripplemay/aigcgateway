/**
 * BL-SYNC-INTEGRITY-PHASE2 F-SI2-01 — pure helpers in
 * disable-orphan-zero-price-channels.ts.
 *
 * The DB-touching path (selectCandidates / runDisable) is exercised by
 * Codex F-SI2-04 with a real Postgres fixture. These unit tests pin the
 * pure logic — id extraction (buildDisableTargetIds) — that determines
 * what ends up in the updateMany call.
 */
import { describe, it, expect } from "vitest";
import { __testing } from "../disable-orphan-zero-price-channels";

const { buildDisableTargetIds } = __testing;

const row = (overrides: Partial<Parameters<typeof buildDisableTargetIds>[0][number]>) =>
  ({
    id: "ch_default",
    provider: "openrouter",
    model: "model-x",
    modality: "TEXT",
    channel_status: "ACTIVE",
    ...overrides,
  });

describe("buildDisableTargetIds", () => {
  it("happy path — disabled-alias-only ACTIVE rows are picked up", () => {
    const ids = buildDisableTargetIds([
      row({ id: "ch_a" }),
      row({ id: "ch_b" }),
      row({ id: "ch_c" }),
    ]);
    expect(ids).toEqual(["ch_a", "ch_b", "ch_c"]);
  });

  it("skips rows whose channel_status is not ACTIVE (defence against SQL drift)", () => {
    const ids = buildDisableTargetIds([
      row({ id: "ch_a", channel_status: "DISABLED" }),
      row({ id: "ch_b", channel_status: "ACTIVE" }),
      row({ id: "ch_c", channel_status: "DEGRADED" }),
    ]);
    expect(ids).toEqual(["ch_b"]);
  });

  it("collapses duplicate ids and preserves input order", () => {
    const ids = buildDisableTargetIds([
      row({ id: "ch_a" }),
      row({ id: "ch_b" }),
      row({ id: "ch_a" }),
      row({ id: "ch_c" }),
    ]);
    expect(ids).toEqual(["ch_a", "ch_b", "ch_c"]);
  });

  it("returns an empty array when input is empty", () => {
    expect(buildDisableTargetIds([])).toEqual([]);
  });
});
