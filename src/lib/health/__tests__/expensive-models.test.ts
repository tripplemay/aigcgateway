/**
 * BL-HEALTH-PROBE-LEAN F-HPL-02 — expensive model whitelist regression.
 *
 * Pins which canonical / provider-prefixed names the scheduler must never
 * probe. New upstream pricing surprises (e.g. o4-search, sonar-deep-
 * research) should extend EXPENSIVE_MODEL_PATTERNS alongside a new test
 * case here so the contract is visible in diff.
 */
import { describe, it, expect } from "vitest";
import { isExpensiveModel, EXPENSIVE_MODEL_PATTERNS } from "../expensive-models";

describe("isExpensiveModel (F-HPL-02)", () => {
  it.each([
    "gpt-4o-mini-search-preview",
    "openai/gpt-4o-mini-search-preview",
    "gpt-4o-mini-reasoning",
    "o1-preview",
    "o1-mini",
    "openai/o1-pro",
    "o3-mini",
    "o3-pro",
    "gemini-2.5-pro-preview",
    "openai/gpt-4o-pro-image",
    "anthropic/claude-pro-video",
    "sonar-reasoning",
  ])("matches %s as expensive", (name) => {
    expect(isExpensiveModel(name)).toBe(true);
  });

  it.each([
    "gpt-4o",
    "gpt-4o-mini",
    "gpt-5",
    "claude-haiku-4.5",
    "claude-sonnet-4.6",
    "deepseek-v3",
    "deepseek-r1",
    "kimi-k2-thinking", // contains "thinking" but not "reasoning"
    "gemini-2.5-flash",
    "qwen-turbo",
    "glm-4.7",
  ])("does NOT match %s as expensive", (name) => {
    expect(isExpensiveModel(name)).toBe(false);
  });

  it("handles null / empty / undefined safely", () => {
    expect(isExpensiveModel(null)).toBe(false);
    expect(isExpensiveModel(undefined)).toBe(false);
    expect(isExpensiveModel("")).toBe(false);
  });

  it("EXPENSIVE_MODEL_PATTERNS stays non-empty (sanity: never accidentally wiped)", () => {
    expect(EXPENSIVE_MODEL_PATTERNS.length).toBeGreaterThanOrEqual(5);
  });
});
