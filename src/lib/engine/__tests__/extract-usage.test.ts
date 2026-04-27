/**
 * BL-RECON-FIX-PHASE2 F-RP-02 — extractUsage upstream cost capture.
 *
 * Validates that extractUsage reads OR-style usage.cost / usage.cost_details
 * fields (real OR shape captured 2026-04-27 docs/audits/openrouter-image-
 * usage-shape-2026-04-27.md) and surfaces them as Usage.upstreamCostUsd so
 * post-process.calculateTokenCost can short-circuit token-formula pricing
 * for image-via-chat responses (12x undercount on gemini-2.5-flash-image).
 */
import { describe, it, expect } from "vitest";
import { extractUsage } from "../openai-compat";

describe("extractUsage upstream cost capture (F-RP-02)", () => {
  it("captures usage.cost when present (OR primary field)", () => {
    // Real shape from 2026-04-27 OR direct probe (gen-1777274549-…)
    const raw = {
      prompt_tokens: 7,
      completion_tokens: 1304,
      total_tokens: 1311,
      cost: 0.0387371,
      completion_tokens_details: { image_tokens: 1290, reasoning_tokens: 0 },
    };
    const usage = extractUsage(raw);
    expect(usage.upstreamCostUsd).toBe(0.0387371);
    expect(usage.prompt_tokens).toBe(7);
    expect(usage.completion_tokens).toBe(1304);
    expect(usage.total_tokens).toBe(1311);
  });

  it("falls back to cost_details.upstream_inference_cost when usage.cost missing", () => {
    const raw = {
      prompt_tokens: 7,
      completion_tokens: 1304,
      total_tokens: 1311,
      cost_details: { upstream_inference_cost: 0.0387371 },
    };
    const usage = extractUsage(raw);
    expect(usage.upstreamCostUsd).toBe(0.0387371);
  });

  it("prefers usage.cost over cost_details when both present", () => {
    const raw = {
      prompt_tokens: 7,
      completion_tokens: 1304,
      total_tokens: 1311,
      cost: 0.04, // primary
      cost_details: { upstream_inference_cost: 0.99 }, // should be ignored
    };
    const usage = extractUsage(raw);
    expect(usage.upstreamCostUsd).toBe(0.04);
  });

  it("does not set upstreamCostUsd when cost field absent (text-only chat regression)", () => {
    const raw = {
      prompt_tokens: 1000,
      completion_tokens: 500,
      total_tokens: 1500,
    };
    const usage = extractUsage(raw);
    expect(usage.upstreamCostUsd).toBeUndefined();
  });

  it("does not set upstreamCostUsd when cost is 0", () => {
    const raw = {
      prompt_tokens: 100,
      completion_tokens: 50,
      total_tokens: 150,
      cost: 0,
    };
    const usage = extractUsage(raw);
    expect(usage.upstreamCostUsd).toBeUndefined();
  });

  it("does not set upstreamCostUsd when cost is negative or non-finite", () => {
    expect(extractUsage({ prompt_tokens: 1, completion_tokens: 1, cost: -0.5 }).upstreamCostUsd)
      .toBeUndefined();
    expect(extractUsage({ prompt_tokens: 1, completion_tokens: 1, cost: NaN }).upstreamCostUsd)
      .toBeUndefined();
    expect(extractUsage({ prompt_tokens: 1, completion_tokens: 1, cost: Infinity }).upstreamCostUsd)
      .toBeUndefined();
  });

  it("accepts string-form cost (defensive — provider may send as JSON string)", () => {
    const raw = {
      prompt_tokens: 7,
      completion_tokens: 1304,
      total_tokens: 1311,
      cost: "0.0387371",
    };
    const usage = extractUsage(raw);
    expect(usage.upstreamCostUsd).toBe(0.0387371);
  });

  it("preserves reasoning_tokens behavior alongside upstreamCostUsd", () => {
    const raw = {
      prompt_tokens: 100,
      completion_tokens: 200,
      total_tokens: 300,
      cost: 0.01,
      completion_tokens_details: { reasoning_tokens: 50 },
    };
    const usage = extractUsage(raw);
    expect(usage.reasoning_tokens).toBe(50);
    expect(usage.upstreamCostUsd).toBe(0.01);
  });
});
