import { describe, it, expect } from "vitest";
import { normalizeTemplateVariables } from "./run-template";

describe("normalizeTemplateVariables (F-WP-02)", () => {
  it("treats a flat map as global variables", () => {
    const result = normalizeTemplateVariables({ topic: "ai", lang: "en" });
    expect(result.global).toEqual({ topic: "ai", lang: "en" });
    expect(result.stepVariables).toEqual({});
  });

  it("splits __global / __step_N entries", () => {
    const result = normalizeTemplateVariables({
      __global: { topic: "ai" },
      __step_0: { tone: "formal" },
      __step_1: { tone: "casual" },
    });
    expect(result.global).toEqual({ topic: "ai" });
    expect(result.stepVariables[0]).toEqual({ tone: "formal" });
    expect(result.stepVariables[1]).toEqual({ tone: "casual" });
  });

  it("ignores unrelated __step_N keys that are not numeric", () => {
    const result = normalizeTemplateVariables({
      __global: { topic: "ai" },
      __step_bad: { ignored: "yes" },
    });
    expect(result.global).toEqual({ topic: "ai" });
    expect(result.stepVariables).toEqual({});
  });

  it("returns empty structures for undefined input", () => {
    const result = normalizeTemplateVariables(undefined);
    expect(result.global).toEqual({});
    expect(result.stepVariables).toEqual({});
  });
});
