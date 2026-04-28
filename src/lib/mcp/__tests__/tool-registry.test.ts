/**
 * BL-MCP-PAGE-REVAMP F-MR-01 — registry / server.ts 一致性 lint test.
 *
 * 防止 future 加 tool 时漏更新两处之一（server.ts register* + registry.ts）。
 * 单测时间常量化，failure msg 直接指出缺失的 name，便于修复。
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { MCP_TOOL_REGISTRY, MCP_CATEGORY_ORDER } from "../tool-registry";

describe("MCP_TOOL_REGISTRY (F-MR-01)", () => {
  // 实际 server.ts 共 29 个 register 调用（spec § "完整 28 个" 算错了 — 多算 1
  // 个；以 server.ts 为准）。1 models + 3 ai_call + 4 observability + 8 action
  // + 8 template + 3 api_key + 2 project = 29
  it("contains exactly 29 tools (matches server.ts register count)", () => {
    expect(MCP_TOOL_REGISTRY.length).toBe(29);
  });

  it("includes embed_text in ai_call category (KOLMatrix dependency)", () => {
    const embedText = MCP_TOOL_REGISTRY.find((t) => t.name === "embed_text");
    expect(embedText).toBeDefined();
    expect(embedText?.category).toBe("ai_call");
  });

  it("category counts match spec § completeness table", () => {
    const counts: Record<string, number> = {};
    for (const t of MCP_TOOL_REGISTRY) {
      counts[t.category] = (counts[t.category] ?? 0) + 1;
    }
    expect(counts.models).toBe(1);
    expect(counts.ai_call).toBe(3);
    expect(counts.observability).toBe(4);
    expect(counts.action).toBe(8);
    expect(counts.template).toBe(8);
    expect(counts.api_key).toBe(3);
    expect(counts.project).toBe(2);
  });

  it("every tool name is unique", () => {
    const names = MCP_TOOL_REGISTRY.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("every tool has descriptionKey + icon non-empty", () => {
    for (const t of MCP_TOOL_REGISTRY) {
      expect(t.descriptionKey, `${t.name} descriptionKey`).toMatch(/^tool[A-Z]/);
      expect(t.icon.length, `${t.name} icon`).toBeGreaterThan(0);
    }
  });

  it("MCP_CATEGORY_ORDER lists all 7 distinct categories", () => {
    expect(MCP_CATEGORY_ORDER.length).toBe(7);
    expect(new Set(MCP_CATEGORY_ORDER).size).toBe(7);
  });
});

describe("registry / server.ts sync (F-MR-01 lint)", () => {
  // 读 server.ts 源码，断言每个 registry tool name 对应一个 register* 调用
  const serverPath = path.resolve(__dirname, "../server.ts");
  const serverSource = fs.readFileSync(serverPath, "utf8");

  // 提取 server.ts 内 register*(server, opts) 调用对应的 tool name
  // pattern: registerListModels / registerChat / registerEmbedText 等
  // 按命名约定：register + PascalCase(toolName) → register + Pascal(name).
  // 反推：把 name 转 Pascal，对比 register{Pascal}( 是否在源码中出现。
  function toPascal(snake: string): string {
    return snake
      .split("_")
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join("");
  }

  for (const tool of MCP_TOOL_REGISTRY) {
    it(`'${tool.name}' has matching register call in server.ts`, () => {
      const pascal = toPascal(tool.name);
      const pattern = new RegExp(`register${pascal}\\s*\\(`);
      expect(serverSource).toMatch(pattern);
    });
  }
});
