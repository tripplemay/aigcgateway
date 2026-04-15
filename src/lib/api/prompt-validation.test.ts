import { describe, it, expect } from "vitest";
import { validatePrompt } from "./prompt-validation";

describe("validatePrompt (F-WP-05)", () => {
  it("rejects empty and whitespace-only strings", () => {
    expect(validatePrompt("").ok).toBe(false);
    expect(validatePrompt("   ").ok).toBe(false);
    expect(validatePrompt("   ").reason).toBe("empty");
  });

  it("accepts normal CJK and ASCII prompts", () => {
    expect(validatePrompt("a friendly robot").ok).toBe(true);
    expect(validatePrompt("一只红色的猫").ok).toBe(true);
  });

  it("flags high-density binary payloads", () => {
    // 12 chars, 10 of them control codes → 83% suspicious ratio.
    const binary = "hi\x01\x02\x03\x04\x05\x06\x07\x08\x0b\x0c";
    const result = validatePrompt(binary);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("binary");
  });

  it("enforces the max length", () => {
    const result = validatePrompt("a".repeat(5000));
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("too_long");
  });
});
