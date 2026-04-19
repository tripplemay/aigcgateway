/**
 * BL-INFRA-RESILIENCE F-IR-03 / H-5 — list-actions versions `take: 10`.
 *
 * Regression: previously `include.versions` had no take → a single action
 * with 100+ ActionVersion rows loaded the entire history just to surface
 * the activeVersion summary. This test pins the contract: the find call
 * must include `versions: { take: 10 }`.
 */
import { describe, it, expect, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

describe("list-actions versions take (F-IR-03 H-5)", () => {
  it("include.versions carries take: 10", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../list-actions.ts"),
      "utf8",
    );
    // Assert the literal shape so regressions trip the test immediately.
    expect(source).toMatch(/versions:\s*\{\s*orderBy:\s*\{\s*versionNumber:\s*"desc"\s*\},\s*take:\s*10\s*\}/);
  });

  it("avoid silent regression: file must import prisma", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../list-actions.ts"),
      "utf8",
    );
    expect(source).toContain("prisma");
    // Keep the suite quiet of noisy mocks — this file acts as a static
    // contract assertion for the MCP tool handler shape.
    expect(vi.fn).toBeDefined();
  });
});
