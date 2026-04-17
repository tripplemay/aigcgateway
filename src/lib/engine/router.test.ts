/**
 * F-RR2-05 — routeByAlias candidate filtering & sort tests.
 *
 * These tests exercise the "transient FAIL stays in candidates, permanent
 * FAIL is removed" logic added to fix the production smoke finding where
 * a zhipu channel hit rate_limited and was fully DISABLED, short-circuiting
 * the cooldown path entirely.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock out dependencies before importing the SUT.
vi.mock("@/lib/prisma", () => ({
  prisma: {
    modelAlias: { findUnique: vi.fn() },
    channel: { findFirst: vi.fn() },
    model: { findUnique: vi.fn() },
  },
}));
vi.mock("./cooldown", () => ({
  getCooldownChannelIds: vi.fn().mockResolvedValue(new Set<string>()),
  isTransientFailureReason: (msg: string | null | undefined) => {
    if (!msg) return false;
    const hay = msg.toLowerCase();
    return (
      hay.includes("rate_limited") ||
      hay.includes("限流") ||
      hay.includes("429") ||
      hay.includes("timeout")
    );
  },
}));

import { routeByAlias } from "./router";
import { prisma } from "@/lib/prisma";

type LooseChannel = {
  id: string;
  priority: number;
  provider: { id: string; name: string; adapterType: string; config: object };
  healthChecks: Array<{ result: "PASS" | "FAIL"; errorMessage: string | null }>;
};

function aliasFixture(channels: LooseChannel[]): unknown {
  return {
    alias: "test-alias",
    enabled: true,
    models: [
      {
        model: {
          enabled: true,
          channels,
        },
      },
    ],
  };
}

function ch(
  id: string,
  providerId: string,
  priority: number,
  lastResult: "PASS" | "FAIL" | null,
  errorMessage: string | null = null,
): LooseChannel {
  return {
    id,
    priority,
    provider: {
      id: providerId,
      name: providerId,
      adapterType: "openai-compat",
      config: { chatEndpoint: "/chat/completions" },
    },
    healthChecks: lastResult ? [{ result: lastResult, errorMessage }] : [],
  };
}

const mockedFindUnique = prisma.modelAlias.findUnique as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockedFindUnique.mockReset();
});

describe("routeByAlias transient-FAIL handling (F-RR2-05)", () => {
  it("keeps a rate_limited FAIL candidate in the list (for cooldown-based failover)", async () => {
    mockedFindUnique.mockResolvedValueOnce(
      aliasFixture([
        ch("ch_zhipu", "prov_zhipu", 10, "FAIL", "rate_limited: 您的账户已达到速率限制"),
        ch("ch_openrouter", "prov_openrouter", 10, "PASS"),
      ]),
    );

    const { candidates } = await routeByAlias("test-alias");

    const ids = candidates.map((c) => c.channel.id);
    expect(ids).toContain("ch_zhipu");
    expect(ids).toContain("ch_openrouter");
    // Openrouter (PASS) must lead; zhipu (transient FAIL) sinks to bottom
    expect(ids[0]).toBe("ch_openrouter");
    expect(ids[ids.length - 1]).toBe("ch_zhipu");
  });

  it("filters out a permanent-FAIL candidate (auth_failed, 5xx persistent)", async () => {
    mockedFindUnique.mockResolvedValueOnce(
      aliasFixture([
        ch("ch_dead", "prov_dead", 10, "FAIL", "auth_failed: invalid api key"),
        ch("ch_healthy", "prov_healthy", 10, "PASS"),
      ]),
    );

    const { candidates } = await routeByAlias("test-alias");

    const ids = candidates.map((c) => c.channel.id);
    expect(ids).not.toContain("ch_dead");
    expect(ids).toEqual(["ch_healthy"]);
  });

  it("still orders PASS before NULL when no FAIL is present", async () => {
    mockedFindUnique.mockResolvedValueOnce(
      aliasFixture([
        ch("ch_unchecked", "prov_a", 10, null),
        ch("ch_passed", "prov_b", 10, "PASS"),
      ]),
    );

    const { candidates } = await routeByAlias("test-alias");
    const ids = candidates.map((c) => c.channel.id);
    expect(ids[0]).toBe("ch_passed");
    expect(ids[1]).toBe("ch_unchecked");
  });

  it("mixes transient FAIL + permanent FAIL correctly (permanent filtered, transient retained & demoted)", async () => {
    mockedFindUnique.mockResolvedValueOnce(
      aliasFixture([
        ch("ch_permanent", "prov_a", 10, "FAIL", "provider_error: 500 upstream dead"),
        ch("ch_transient", "prov_b", 10, "FAIL", "HTTP 429: too many requests"),
        ch("ch_healthy", "prov_c", 10, "PASS"),
      ]),
    );

    const { candidates } = await routeByAlias("test-alias");
    const ids = candidates.map((c) => c.channel.id);

    expect(ids).not.toContain("ch_permanent");
    expect(ids).toEqual(["ch_healthy", "ch_transient"]);
  });
});
