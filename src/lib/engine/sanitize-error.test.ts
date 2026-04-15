import { describe, it, expect } from "vitest";
import { sanitizeErrorMessage } from "./types";

describe("sanitizeErrorMessage (F-ACF-08)", () => {
  it("scrubs API keys and Bearer tokens", () => {
    const skOut = sanitizeErrorMessage("invalid key sk-abcdef1234");
    expect(skOut).toContain("[key removed]");
    expect(skOut).not.toContain("sk-abcdef1234");
    const bearerOut = sanitizeErrorMessage("Bearer ABCDEF1234567890 failed");
    expect(bearerOut).toContain("Bearer [redacted]");
    expect(bearerOut).not.toContain("ABCDEF1234567890");
  });

  it("strips 'via chat' routing leaks", () => {
    const msg = "Model returned empty response via chat returned no extractable image.";
    const out = sanitizeErrorMessage(msg);
    expect(out).not.toMatch(/via chat/i);
    expect(out).toMatch(/did not return a valid image/i);
  });

  it("removes upstream endpoint description and content preview", () => {
    const msg =
      'This endpoint enforces endpoint\'s maximum of 8000 tokens. Content preview: "the quick brown fox".';
    const out = sanitizeErrorMessage(msg);
    expect(out).not.toMatch(/this endpoint/i);
    expect(out).not.toMatch(/endpoint'?s maximum/i);
    expect(out).not.toMatch(/content preview/i);
    expect(out).not.toContain("the quick brown fox");
  });

  it("F-AF-01: redacts masked key prefixes leaked by upstream providers", () => {
    // Real leakage pattern observed in reports-20260414: `sk-B2n****zjvw`
    const masked = sanitizeErrorMessage("Invalid token sk-B2n****zjvw on request");
    expect(masked).toContain("[key removed]");
    expect(masked).not.toContain("sk-B2n");
    expect(masked).not.toContain("zjvw");

    // Synthetic regression fixture used by codex in F-AF-05 verification
    const synthetic = sanitizeErrorMessage(
      "provider rejected: sk-testABC123xyzDEF456 is not valid",
    );
    expect(synthetic).toContain("[key removed]");
    expect(synthetic).not.toContain("sk-testABC123xyzDEF456");

    // OpenAI / OpenRouter / Anthropic prefixes
    for (const key of ["sk-proj-AAAAAAAAAAAA", "sk-or-v1-BBBBBBBB", "sk-ant-api03-CCCCCCCC"]) {
      const out = sanitizeErrorMessage(`auth failed: ${key}`);
      expect(out).toContain("[key removed]");
      expect(out).not.toContain(key);
    }
  });

  it("keeps benign error text untouched", () => {
    const msg = "Invalid request: messages array is empty.";
    expect(sanitizeErrorMessage(msg)).toBe(msg);
  });
});
