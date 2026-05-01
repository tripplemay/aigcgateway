/**
 * BL-ADMIN-ALIAS-UX-PHASE1 F-AAU-08 — GET /api/admin/model-aliases
 * server-side pagination + filtering contract.
 *
 * Pins:
 *   - default params (page=1, pageSize=20, sortKey='alias')
 *   - search → OR(alias, description) contains insensitive
 *   - brand exact match
 *   - modality exact match (cast to ModelModality)
 *   - enabled=true / enabled=false / absent
 *   - sortKey 'alias' / 'enabled' / 'updatedAt'
 *   - pageSize clamping: <1 → 1, >100 → 100
 *   - response shape: { data, unlinkedModels, availableBrands, pagination }
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const aliasFindManyMock = vi.fn();
const aliasCountMock = vi.fn();
const modelFindManyMock = vi.fn();
const requireAdminMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    modelAlias: {
      findMany: (a: unknown) => aliasFindManyMock(a),
      count: (a: unknown) => aliasCountMock(a),
    },
    model: {
      findMany: (a: unknown) => modelFindManyMock(a),
    },
  },
}));

vi.mock("@/lib/api/admin-guard", () => ({
  requireAdmin: () => requireAdminMock(),
}));

import { GET } from "../route";

beforeEach(() => {
  aliasFindManyMock.mockReset();
  aliasCountMock.mockReset();
  modelFindManyMock.mockReset();
  requireAdminMock.mockReset();

  requireAdminMock.mockReturnValue({ ok: true, payload: { userId: "u1", role: "ADMIN" } });
  aliasFindManyMock.mockResolvedValue([]);
  aliasCountMock.mockResolvedValue(0);
  modelFindManyMock.mockResolvedValue([]);
});

const callGet = (qs = "") => GET(new Request(`http://localhost/api/admin/model-aliases${qs}`));

/**
 * The route fires 4 prisma calls in parallel via Promise.all:
 *   [0] modelAlias.findMany (paginated aliases for the page)
 *   [1] modelAlias.count    (filtered total)
 *   [2] model.findMany      (unlinkedModels)
 *   [3] modelAlias.findMany (distinct brand list — no `take`/`skip`)
 *
 * Tests assert against the page-result findMany call (call index 0).
 */
const pageFindManyArg = () => aliasFindManyMock.mock.calls[0]?.[0];

describe("GET /api/admin/model-aliases pagination + filter (F-AAU-08)", () => {
  it("returns default params: page=1, pageSize=20, sortKey 'alias'", async () => {
    aliasCountMock.mockResolvedValue(7);
    const res = await callGet();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: unknown[];
      unlinkedModels: unknown[];
      availableBrands: unknown[];
      pagination: { page: number; pageSize: number; total: number; totalPages: number };
    };

    expect(body.pagination).toEqual({ page: 1, pageSize: 20, total: 7, totalPages: 1 });
    const arg = pageFindManyArg();
    expect(arg.skip).toBe(0);
    expect(arg.take).toBe(20);
    expect(arg.orderBy).toEqual([{ alias: "asc" }]);
    expect(arg.where).toEqual({});
  });

  it("respects page and pageSize from query string", async () => {
    aliasCountMock.mockResolvedValue(125);
    const res = await callGet("?page=3&pageSize=25");
    const body = (await res.json()) as { pagination: { page: number; pageSize: number; total: number; totalPages: number } };
    expect(body.pagination).toEqual({ page: 3, pageSize: 25, total: 125, totalPages: 5 });
    expect(pageFindManyArg().skip).toBe(50);
    expect(pageFindManyArg().take).toBe(25);
  });

  it("clamps pageSize >100 down to 100 and pageSize <1 up to 1; page <1 up to 1", async () => {
    aliasCountMock.mockResolvedValue(0);
    await callGet("?page=0&pageSize=999");
    expect(pageFindManyArg().take).toBe(100);
    expect(pageFindManyArg().skip).toBe(0);

    aliasFindManyMock.mockReset();
    aliasFindManyMock.mockResolvedValue([]);
    await callGet("?page=-5&pageSize=0");
    expect(pageFindManyArg().take).toBe(1);
    expect(pageFindManyArg().skip).toBe(0);
  });

  it("search builds OR(alias, description) contains insensitive", async () => {
    await callGet("?search=foo");
    expect(pageFindManyArg().where).toEqual({
      OR: [
        { alias: { contains: "foo", mode: "insensitive" } },
        { description: { contains: "foo", mode: "insensitive" } },
      ],
    });
  });

  it("brand filter is exact match", async () => {
    await callGet("?brand=openai");
    expect(pageFindManyArg().where).toEqual({ brand: "openai" });
  });

  it("modality filter is exact match cast to ModelModality", async () => {
    await callGet("?modality=IMAGE");
    expect(pageFindManyArg().where).toEqual({ modality: "IMAGE" });
  });

  it("enabled='true' yields { enabled: true }; 'false' yields { enabled: false }; absent yields no enabled clause", async () => {
    await callGet("?enabled=true");
    expect(pageFindManyArg().where).toEqual({ enabled: true });

    aliasFindManyMock.mockReset();
    aliasFindManyMock.mockResolvedValue([]);
    await callGet("?enabled=false");
    expect(pageFindManyArg().where).toEqual({ enabled: false });

    aliasFindManyMock.mockReset();
    aliasFindManyMock.mockResolvedValue([]);
    await callGet("");
    expect(pageFindManyArg().where).toEqual({});
  });

  it("sortKey 'enabled' → [enabled desc, alias asc]; 'updatedAt' → [updatedAt desc]; default 'alias' asc", async () => {
    await callGet("?sortKey=enabled");
    expect(pageFindManyArg().orderBy).toEqual([{ enabled: "desc" }, { alias: "asc" }]);

    aliasFindManyMock.mockReset();
    aliasFindManyMock.mockResolvedValue([]);
    await callGet("?sortKey=updatedAt");
    expect(pageFindManyArg().orderBy).toEqual([{ updatedAt: "desc" }]);

    aliasFindManyMock.mockReset();
    aliasFindManyMock.mockResolvedValue([]);
    await callGet("?sortKey=alias");
    expect(pageFindManyArg().orderBy).toEqual([{ alias: "asc" }]);
  });

  it("response includes data, unlinkedModels, availableBrands, pagination keys", async () => {
    aliasFindManyMock.mockImplementation(async (arg: { take?: number; distinct?: string[] }) => {
      // The 2nd findMany call (distinct brands) gets `distinct` set; return brand rows.
      if (arg.distinct?.includes("brand")) {
        return [{ brand: "openai" }, { brand: "anthropic" }];
      }
      return [];
    });
    const res = await callGet();
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toHaveProperty("data");
    expect(body).toHaveProperty("unlinkedModels");
    expect(body).toHaveProperty("availableBrands", ["openai", "anthropic"]);
    expect(body).toHaveProperty("pagination");
  });

  it("combined filters compose correctly into a single where clause", async () => {
    await callGet("?search=q&brand=openai&modality=TEXT&enabled=true");
    const where = pageFindManyArg().where;
    expect(where.OR).toEqual([
      { alias: { contains: "q", mode: "insensitive" } },
      { description: { contains: "q", mode: "insensitive" } },
    ]);
    expect(where.brand).toBe("openai");
    expect(where.modality).toBe("TEXT");
    expect(where.enabled).toBe(true);
  });
});
