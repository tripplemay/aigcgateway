import { describe, it, expect } from "vitest";
import { isSafeRedirect, sanitizeRedirect } from "./safe-redirect";

describe("isSafeRedirect (F-LL-02)", () => {
  it("accepts relative paths starting with a single slash", () => {
    expect(isSafeRedirect("/dashboard")).toBe(true);
    expect(isSafeRedirect("/docs")).toBe(true);
    expect(isSafeRedirect("/models?tab=image")).toBe(true);
    expect(isSafeRedirect("/mcp-setup#step-1")).toBe(true);
  });

  it("rejects protocol-relative URLs", () => {
    expect(isSafeRedirect("//evil.com")).toBe(false);
    expect(isSafeRedirect("//evil.com/path")).toBe(false);
  });

  it("rejects absolute URLs and other schemes", () => {
    expect(isSafeRedirect("https://evil.com")).toBe(false);
    expect(isSafeRedirect("http://evil.com")).toBe(false);
    expect(isSafeRedirect("javascript:alert(1)")).toBe(false);
    expect(isSafeRedirect("data:text/html,<script>")).toBe(false);
  });

  it("rejects backslash and control characters", () => {
    expect(isSafeRedirect("\\admin")).toBe(false);
    expect(isSafeRedirect("/admin\\..\\evil")).toBe(false);
    expect(isSafeRedirect("/dashboard\x00")).toBe(false);
    expect(isSafeRedirect("/dashboard\n")).toBe(false);
  });

  it("rejects non-string, empty, and over-long inputs", () => {
    expect(isSafeRedirect(null)).toBe(false);
    expect(isSafeRedirect(undefined)).toBe(false);
    expect(isSafeRedirect(123 as unknown)).toBe(false);
    expect(isSafeRedirect("")).toBe(false);
    expect(isSafeRedirect("/" + "a".repeat(300))).toBe(false);
  });

  it("rejects paths not starting with slash", () => {
    expect(isSafeRedirect("dashboard")).toBe(false);
    expect(isSafeRedirect("./dashboard")).toBe(false);
    expect(isSafeRedirect("?foo=bar")).toBe(false);
  });
});

describe("sanitizeRedirect (F-LL-02)", () => {
  it("returns the raw value when safe", () => {
    expect(sanitizeRedirect("/docs")).toBe("/docs");
  });

  it("falls back to /dashboard by default when unsafe", () => {
    expect(sanitizeRedirect("https://evil.com")).toBe("/dashboard");
    expect(sanitizeRedirect(null)).toBe("/dashboard");
  });

  it("honours a caller-supplied fallback", () => {
    expect(sanitizeRedirect("//evil.com", "/home")).toBe("/home");
  });
});
