/**
 * BL-MCP-PAGE-REVAMP F-MR-01 — GET /api/mcp/tools route test.
 */
import { describe, it, expect } from "vitest";
import { GET } from "../route";

describe("GET /api/mcp/tools (F-MR-01)", () => {
  it("returns 200 + data array of registry tools", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThanOrEqual(28);
  });

  it("each tool has required fields name/category/descriptionKey/icon", async () => {
    const res = await GET();
    const body = await res.json();
    for (const tool of body.data) {
      expect(typeof tool.name).toBe("string");
      expect(tool.name.length).toBeGreaterThan(0);
      expect([
        "models",
        "ai_call",
        "observability",
        "action",
        "template",
        "api_key",
        "project",
      ]).toContain(tool.category);
      expect(tool.descriptionKey).toMatch(/^tool[A-Z]/);
      expect(typeof tool.icon).toBe("string");
    }
  });

  it("includes embed_text in ai_call (KOLMatrix dependency)", async () => {
    const res = await GET();
    const body = await res.json();
    const embedText = body.data.find((t: { name: string }) => t.name === "embed_text");
    expect(embedText).toBeDefined();
    expect(embedText.category).toBe("ai_call");
  });
});
