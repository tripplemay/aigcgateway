/**
 * F-DC-02 regression — listPublicTemplates DB-level pagination.
 *
 * 目标验证：
 *   1) 4 种 sort_by 不报错（latest / top_rated / popular / recommended）
 *   2) latest 模式返回按 updatedAt desc，用 DB `orderBy + skip + take`
 *   3) pageSize=2, page=2 返回第 3-4 条
 *   4) category 过滤透传到 `where.category`
 *
 * prisma.template.findMany / count 走 mock，断言 orderBy / skip / take 真
 * 下推到 DB 层（而非 JS slice）。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const findManyMock = vi.fn();
const countMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    template: {
      findMany: (args: unknown) => findManyMock(args),
      count: (args: unknown) => countMock(args),
    },
  },
}));

vi.mock("@/lib/template-categories", () => ({
  getTemplateCategories: vi.fn(async () => [
    { id: "writing", label: "Writing", icon: "edit" },
  ]),
  getCategoryIcon: vi.fn(() => "edit"),
}));

import { listPublicTemplates } from "../public-templates";

type RowBuilder = { id: string; updatedAt: Date; ratingSum?: number; ratingCount?: number };
function makeRow(r: RowBuilder) {
  return {
    id: r.id,
    name: `t-${r.id}`,
    description: null,
    category: "writing",
    ratingCount: r.ratingCount ?? 0,
    ratingSum: r.ratingSum ?? 0,
    updatedAt: r.updatedAt,
    steps: [],
    _count: { forks: 0 },
  };
}

beforeEach(() => {
  findManyMock.mockReset();
  countMock.mockReset();
});

describe("listPublicTemplates (F-DC-02 DB pagination)", () => {
  it("sort_by=latest uses DB-level orderBy + skip + take and does not over-fetch", async () => {
    findManyMock.mockResolvedValueOnce(
      [
        makeRow({ id: "a", updatedAt: new Date("2026-04-03") }),
        makeRow({ id: "b", updatedAt: new Date("2026-04-02") }),
      ],
    );
    countMock.mockResolvedValueOnce(7);

    const result = await listPublicTemplates({ sortBy: "latest", page: 2, pageSize: 2 });

    expect(findManyMock).toHaveBeenCalledTimes(1);
    const call = findManyMock.mock.calls[0][0];
    expect(call.orderBy).toEqual([{ updatedAt: "desc" }]);
    expect(call.skip).toBe(2); // (page-1) * pageSize
    expect(call.take).toBe(2);
    expect(result.templates.map((t) => t.id)).toEqual(["a", "b"]);
    expect(result.pagination).toEqual({ page: 2, pageSize: 2, total: 7, totalPages: 4 });
  });

  it("sort_by=top_rated uses DB orderBy (ratingSum desc, ratingCount desc) + skip/take", async () => {
    findManyMock.mockResolvedValueOnce([
      makeRow({ id: "x", updatedAt: new Date(), ratingSum: 50, ratingCount: 10 }),
    ]);
    countMock.mockResolvedValueOnce(1);

    await listPublicTemplates({ sortBy: "top_rated", page: 1, pageSize: 20 });

    const call = findManyMock.mock.calls[0][0];
    expect(call.orderBy).toEqual([{ ratingSum: "desc" }, { ratingCount: "desc" }]);
    expect(call.skip).toBe(0);
    expect(call.take).toBe(20);
  });

  it("sort_by=popular caps fetch at MEMORY_SORT_UPPER_BOUND (take=200) then in-memory sorts", async () => {
    findManyMock.mockResolvedValueOnce([]);
    countMock.mockResolvedValueOnce(0);

    await listPublicTemplates({ sortBy: "popular", page: 1, pageSize: 20 });

    const call = findManyMock.mock.calls[0][0];
    expect(call.take).toBe(200);
    // no skip at DB level for memory-sort modes; skip applied after sort
    expect(call.skip).toBeUndefined();
  });

  it("sort_by=recommended also caps at 200 and does not throw", async () => {
    findManyMock.mockResolvedValueOnce([]);
    countMock.mockResolvedValueOnce(0);

    const result = await listPublicTemplates({ sortBy: "recommended", page: 1, pageSize: 20 });

    const call = findManyMock.mock.calls[0][0];
    expect(call.take).toBe(200);
    expect(result.templates).toEqual([]);
  });

  it("passes category filter through to where.category", async () => {
    findManyMock.mockResolvedValueOnce([]);
    countMock.mockResolvedValueOnce(0);

    await listPublicTemplates({ sortBy: "latest", category: "writing" });

    const call = findManyMock.mock.calls[0][0];
    expect(call.where).toMatchObject({ isPublic: true, category: "writing" });
  });

  it("clamps pageSize to max 100", async () => {
    findManyMock.mockResolvedValueOnce([]);
    countMock.mockResolvedValueOnce(0);

    await listPublicTemplates({ sortBy: "latest", pageSize: 500 });

    const call = findManyMock.mock.calls[0][0];
    expect(call.take).toBe(100);
  });
});
