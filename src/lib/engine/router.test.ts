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

type ChannelStatus = "ACTIVE" | "DEGRADED" | "DISABLED";

type LooseChannel = {
  id: string;
  priority: number;
  status: ChannelStatus;
  provider: { id: string; name: string; adapterType: string; config: object };
  healthChecks: Array<{ result: "PASS" | "FAIL"; errorMessage: string | null }>;
};

function aliasFixture(channels: LooseChannel[]): unknown {
  // Mirror the prisma-level SQL filter `status IN ('ACTIVE','DEGRADED')` so
  // the test fixture only hands the SUT what a real query would have
  // returned. DISABLED channels are stripped here, letting us exercise the
  // filter contract without mocking prisma's where clause execution.
  const visible = channels.filter((c) => c.status !== "DISABLED");
  return {
    alias: "test-alias",
    enabled: true,
    models: [
      {
        model: {
          enabled: true,
          channels: visible,
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
  status: ChannelStatus = "ACTIVE",
): LooseChannel {
  return {
    id,
    priority,
    status,
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
      aliasFixture([ch("ch_unchecked", "prov_a", 10, null), ch("ch_passed", "prov_b", 10, "PASS")]),
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

describe("routeByAlias DEGRADED handling (F-RR2-06)", () => {
  it("keeps a DEGRADED channel in the candidate list (demoted, not removed)", async () => {
    // Reproduces the production gap: scheduler puts zhipu in DEGRADED after
    // transient 429 — router must still route to it so withFailover gets a
    // chance to write the 300 s cooldown on real upstream failures.
    mockedFindUnique.mockResolvedValueOnce(
      aliasFixture([
        ch("ch_zhipu", "prov_zhipu", 10, "PASS", null, "DEGRADED"),
        ch("ch_openrouter", "prov_openrouter", 10, "PASS", null, "ACTIVE"),
      ]),
    );

    const { candidates } = await routeByAlias("test-alias");
    const ids = candidates.map((c) => c.channel.id);

    expect(ids).toContain("ch_zhipu");
    // ACTIVE peer must lead; DEGRADED sinks to the demoted band even when
    // both channels show a healthy last-check result.
    expect(ids[0]).toBe("ch_openrouter");
    expect(ids[ids.length - 1]).toBe("ch_zhipu");
  });

  it("still excludes DISABLED channels entirely (SQL where filter)", async () => {
    mockedFindUnique.mockResolvedValueOnce(
      aliasFixture([
        ch("ch_dead", "prov_dead", 10, "PASS", null, "DISABLED"),
        ch("ch_healthy", "prov_healthy", 10, "PASS", null, "ACTIVE"),
      ]),
    );

    const { candidates } = await routeByAlias("test-alias");
    const ids = candidates.map((c) => c.channel.id);

    expect(ids).toEqual(["ch_healthy"]);
    expect(ids).not.toContain("ch_dead");
  });

  it("orders ACTIVE-PASS > ACTIVE-NULL > DEGRADED within the same priority", async () => {
    mockedFindUnique.mockResolvedValueOnce(
      aliasFixture([
        ch("ch_degraded", "prov_a", 10, "FAIL", "rate_limited: 限流", "DEGRADED"),
        ch("ch_unchecked", "prov_b", 10, null, null, "ACTIVE"),
        ch("ch_pass", "prov_c", 10, "PASS", null, "ACTIVE"),
      ]),
    );

    const { candidates } = await routeByAlias("test-alias");
    const ids = candidates.map((c) => c.channel.id);

    // DEGRADED must be last. PASS leads over NULL within the non-demoted band.
    expect(ids[0]).toBe("ch_pass");
    expect(ids[1]).toBe("ch_unchecked");
    expect(ids[2]).toBe("ch_degraded");
  });

  it("respects priority ASC across status bands (priority wins over demotion)", async () => {
    // Priority dominates — a DEGRADED channel at priority 1 still beats an
    // ACTIVE channel at priority 2 because the demoted-band sort only
    // applies within the same priority.
    mockedFindUnique.mockResolvedValueOnce(
      aliasFixture([
        ch("ch_hi_degraded", "prov_a", 1, "PASS", null, "DEGRADED"),
        ch("ch_lo_active", "prov_b", 2, "PASS", null, "ACTIVE"),
      ]),
    );

    const { candidates } = await routeByAlias("test-alias");
    const ids = candidates.map((c) => c.channel.id);

    expect(ids).toEqual(["ch_hi_degraded", "ch_lo_active"]);
  });
});
