/**
 * F-ILDF-03 strip-image-base64 backfill 单测。
 *
 * 验证 planBackfillRow 对 5 条 mixed call_log（3 条 base64 / 1 条 https /
 * 1 条 metadata）→ 3 个 changed=true，2 个 changed=false（spec § 3.3 #1）。
 */
import { describe, it, expect } from "vitest";
import { planBackfillRow } from "../strip-image-base64-2026-04-26";

describe("F-ILDF-03 planBackfillRow", () => {
  it("data: base64 responseContent → plan.changed=true，afterContent 是 metadata", () => {
    const fakeBase64 = "x".repeat(200 * 1024);
    const plan = planBackfillRow({
      id: "cl_1",
      responseContent: `data:image/jpeg;base64,${fakeBase64}`,
      responseSummary: null,
    });
    expect(plan.changed).toBe(true);
    expect(plan.afterContent).toMatch(/^\[image:jpeg, \d+KB\]$/);
    expect(plan.beforeContentSize).toBeGreaterThan(200 * 1024);
  });

  it("https URL responseContent → plan.changed=false，pass-through", () => {
    const plan = planBackfillRow({
      id: "cl_2",
      responseContent: "https://example.com/foo.png",
      responseSummary: null,
    });
    expect(plan.changed).toBe(false);
    expect(plan.afterContent).toBe("https://example.com/foo.png");
  });

  it("metadata string responseContent → plan.changed=false (idempotent)", () => {
    const plan = planBackfillRow({
      id: "cl_3",
      responseContent: "[image:png, 1024KB]",
      responseSummary: null,
    });
    expect(plan.changed).toBe(false);
    expect(plan.afterContent).toBe("[image:png, 1024KB]");
  });

  it("responseSummary.original_urls 含 base64 → plan.changed=true（仅 summary 触发）", () => {
    const plan = planBackfillRow({
      id: "cl_4",
      responseContent: null,
      responseSummary: {
        images_count: 1,
        original_urls: ["data:image/png;base64," + "y".repeat(100 * 1024)],
      },
    });
    expect(plan.changed).toBe(true);
    const summary = plan.afterSummary as { original_urls: string[] };
    expect(summary.original_urls[0]).toMatch(/^\[image:png, \d+KB\]$/);
  });

  it("responseSummary.original_urls 全 https → 不 changed (mixed batch idempotency)", () => {
    const plan = planBackfillRow({
      id: "cl_5",
      responseContent: null,
      responseSummary: {
        images_count: 2,
        original_urls: [
          "https://example.com/a.png",
          "https://example.com/b.jpg",
        ],
      },
    });
    expect(plan.changed).toBe(false);
  });

  it("混合 batch 5 条：3 base64 (1 content + 1 summary + 1 both) / 1 https / 1 meta → 3 changed, 2 unchanged", () => {
    const rows = [
      {
        id: "a",
        responseContent: `data:image/jpeg;base64,${"x".repeat(50 * 1024)}`,
        responseSummary: null,
      },
      {
        id: "b",
        responseContent: null,
        responseSummary: {
          original_urls: [`data:image/png;base64,${"y".repeat(50 * 1024)}`],
        },
      },
      {
        id: "c",
        responseContent: `data:image/webp;base64,${"z".repeat(50 * 1024)}`,
        responseSummary: {
          original_urls: [`data:image/webp;base64,${"z".repeat(50 * 1024)}`],
        },
      },
      {
        id: "d",
        responseContent: "https://example.com/foo.png",
        responseSummary: null,
      },
      {
        id: "e",
        responseContent: "[image:png, 100KB]",
        responseSummary: { original_urls: ["[image:png, 100KB]"] },
      },
    ];
    const plans = rows.map(planBackfillRow);
    const changed = plans.filter((p) => p.changed).length;
    const unchanged = plans.filter((p) => !p.changed).length;
    expect(changed).toBe(3);
    expect(unchanged).toBe(2);
  });
});
