/**
 * BL-ADMIN-ALIAS-UX-PHASE1 — pure helper tests.
 *
 * Covers F-AAU-04 (applyChannelReorder), F-AAU-05 (applyAliasPatch),
 * F-AAU-07 (applyDeleteAlias), F-AAU-06 (applyUnlinkModel) and the
 * D2.3 race predicate (isAliasEnabledStillTarget).
 */
import { describe, it, expect } from "vitest";
import {
  applyAliasPatch,
  applyChannelReorder,
  applyDeleteAlias,
  applyToggleEnabled,
  applyUnlinkModel,
  isAliasEnabledStillTarget,
} from "../_helpers";
import type { AliasItem, ApiResponse, ChannelData, LinkedModel } from "../_types";

const ch = (id: string, priority: number, status = "ACTIVE"): ChannelData => ({
  id,
  priority,
  status,
  costPrice: null,
  providerName: "p",
  latencyMs: null,
  lastHealthResult: null,
});

const lm = (modelId: string, channels: ChannelData[]): LinkedModel => ({
  modelId,
  modelName: `model-${modelId}`,
  modelEnabled: true,
  channels,
});

const alias = (
  id: string,
  enabled: boolean,
  linkedModels: LinkedModel[] = [],
  extras: Partial<AliasItem> = {},
): AliasItem => ({
  id,
  alias: `alias-${id}`,
  brand: null,
  modality: "TEXT",
  enabled,
  contextWindow: null,
  maxTokens: null,
  capabilities: null,
  description: null,
  sellPrice: null,
  openRouterModelId: null,
  linkedModels,
  linkedModelCount: linkedModels.length,
  activeChannelCount: linkedModels
    .flatMap((x) => x.channels)
    .filter((c) => c.status === "ACTIVE").length,
  ...extras,
});

const apiState = (data: AliasItem[]): ApiResponse => ({
  data,
  unlinkedModels: [],
  availableBrands: [],
  pagination: { page: 1, pageSize: 20, total: data.length, totalPages: 1 },
});

describe("applyAliasPatch (F-AAU-05)", () => {
  it("spread-merges patch into target alias only", () => {
    const state = apiState([alias("a1", false), alias("a2", true)]);
    const next = applyAliasPatch(state, "a1", { brand: "openai", description: "x" });
    expect(next?.data[0]).toMatchObject({ id: "a1", brand: "openai", description: "x" });
    expect(next?.data[0].enabled).toBe(false); // unchanged field preserved
    expect(next?.data[1]).toEqual(state.data[1]); // other aliases untouched
  });

  it("returns null state unchanged", () => {
    expect(applyAliasPatch(null, "a1", { brand: "x" })).toBeNull();
  });

  it("does not mutate the original state object", () => {
    const state = apiState([alias("a1", false)]);
    const before = JSON.stringify(state);
    applyAliasPatch(state, "a1", { enabled: true });
    expect(JSON.stringify(state)).toBe(before);
  });
});

describe("applyToggleEnabled (F-AAU-03)", () => {
  it("flips enabled on the target alias", () => {
    const state = apiState([alias("a1", false)]);
    const next = applyToggleEnabled(state, "a1", true);
    expect(next?.data[0].enabled).toBe(true);
  });
});

describe("applyChannelReorder (F-AAU-04)", () => {
  it("rewrites priority across multiple linkedModels for the target alias", () => {
    // 10 channels across 3 models inside one alias; mix priorities for realism
    const a = alias("a1", true, [
      lm("mA", [ch("c1", 1), ch("c2", 4), ch("c3", 7), ch("c4", 9)]),
      lm("mB", [ch("c5", 2), ch("c6", 5), ch("c7", 8)]),
      lm("mC", [ch("c8", 3), ch("c9", 6), ch("c10", 10)]),
    ]);
    const state = apiState([a, alias("other", true, [lm("mZ", [ch("z1", 99)])])]);

    // Target order: c1, c2, c3, c4, c5, c6, c7, c8, c9, c10
    const orderedIds = ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8", "c9", "c10"];
    const next = applyChannelReorder(state, "a1", orderedIds);

    const flat = next?.data[0].linkedModels
      .flatMap((m) => m.channels.map((c) => [c.id, c.priority] as const))
      // sort by id to make assertion stable
      .sort(([a1], [b1]) => a1.localeCompare(b1));

    // Expected priorities: c1=1, c10=10, c2=2, c3=3, ..., c9=9 (lexical sort of ids)
    expect(flat).toEqual([
      ["c1", 1],
      ["c10", 10],
      ["c2", 2],
      ["c3", 3],
      ["c4", 4],
      ["c5", 5],
      ["c6", 6],
      ["c7", 7],
      ["c8", 8],
      ["c9", 9],
    ]);

    // The non-target alias is untouched (its channel keeps priority=99)
    expect(next?.data[1].linkedModels[0].channels[0].priority).toBe(99);
  });

  it("returns null state unchanged", () => {
    expect(applyChannelReorder(null, "a1", ["c1"])).toBeNull();
  });
});

describe("applyDeleteAlias (F-AAU-07)", () => {
  it("removes the alias and decrements pagination.total + totalPages", () => {
    const state: ApiResponse = {
      data: [alias("a1", true), alias("a2", true), alias("a3", true)],
      unlinkedModels: [],
      availableBrands: [],
      pagination: { page: 1, pageSize: 20, total: 3, totalPages: 1 },
    };
    const next = applyDeleteAlias(state, "a2");
    expect(next?.data.map((a) => a.id)).toEqual(["a1", "a3"]);
    expect(next?.pagination.total).toBe(2);
    expect(next?.pagination.totalPages).toBe(1);
  });

  it("is a no-op when aliasId is not present", () => {
    const state = apiState([alias("a1", true)]);
    const next = applyDeleteAlias(state, "no-such-alias");
    expect(next).toBe(state);
  });
});

describe("applyUnlinkModel (F-AAU-06)", () => {
  it("filters the modelId out and recomputes counts", () => {
    const a = alias("a1", true, [
      lm("mA", [ch("c1", 1), ch("c2", 2)]),
      lm("mB", [ch("c3", 3, "DISABLED")]),
      lm("mC", [ch("c4", 4)]),
    ]);
    const state = apiState([a]);
    const next = applyUnlinkModel(state, "a1", "mB");

    expect(next?.data[0].linkedModels.map((m) => m.modelId)).toEqual(["mA", "mC"]);
    expect(next?.data[0].linkedModelCount).toBe(2);
    // 3 channels remain across mA + mC, all ACTIVE
    expect(next?.data[0].activeChannelCount).toBe(3);
  });
});

describe("isAliasEnabledStillTarget (F-AAU-03 / D2.3)", () => {
  it("returns true when state still has the value the handler wrote", () => {
    const state = apiState([alias("a1", true)]);
    expect(isAliasEnabledStillTarget(state, "a1", true)).toBe(true);
    expect(isAliasEnabledStillTarget(state, "a1", false)).toBe(false);
  });

  it("returns false when the alias has been removed (race with delete)", () => {
    const state = apiState([alias("a2", true)]);
    expect(isAliasEnabledStillTarget(state, "a1", true)).toBe(false);
  });

  it("returns false when state is null", () => {
    expect(isAliasEnabledStillTarget(null, "a1", true)).toBe(false);
  });
});
