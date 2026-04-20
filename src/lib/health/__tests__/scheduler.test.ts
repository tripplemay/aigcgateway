/**
 * BL-HEALTH-PROBE-EMERGENCY F-HPE-03 — scheduler decision regression.
 *
 * The scheduler's two hot-path decisions are isolated in
 * `planChannelCheck` and `shouldCallProbeChannel` so we can pin them
 * without booting prisma / health checker.
 *
 *   - planChannelCheck     = which strategy a due channel runs
 *   - shouldCallProbeChannel = whether a channel is eligible for CALL_PROBE
 *
 * Emergency context: chatanywhere 2026-04-16 logged 535 calls / $11.71
 * when the Gateway only recorded 7 — the DISABLED channel probes leaked.
 * These tests lock in that the leak is closed for both paths, while the
 * fix-round-1 DISABLED→DEGRADED auto-recovery (in scheduler.ts
 * handleFailure) remains untouched.
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { planChannelCheck, shouldCallProbeChannel } from "../scheduler";

type ChannelStub = { id: string; status: string; model: { modality: string } };

function ch(status: string, modality: "TEXT" | "IMAGE" = "TEXT"): ChannelStub {
  return { id: `ch_${status}_${modality}`, status, model: { modality } };
}

describe("planChannelCheck (F-HPE-01)", () => {
  it("aliased ACTIVE text channel → full + ACTIVE_INTERVAL", () => {
    const plan = planChannelCheck(ch("ACTIVE"), true);
    expect(plan.checkMode).toBe("full");
    // 10 min default
    expect(plan.interval).toBe(600_000);
  });

  it("aliased DISABLED text channel → reachability + DISABLED_INTERVAL (NOT full)", () => {
    const plan = planChannelCheck(ch("DISABLED"), true);
    expect(plan.checkMode).toBe("reachability");
    // 30 min default — less-frequent, zero-cost probe for revival path
    expect(plan.interval).toBe(1_800_000);
  });

  it("aliased DEGRADED text channel stays on full path (not mistaken for DISABLED)", () => {
    const plan = planChannelCheck(ch("DEGRADED"), true);
    expect(plan.checkMode).toBe("full");
    expect(plan.interval).toBe(600_000);
  });

  it("aliased IMAGE channel → reachability regardless of status", () => {
    expect(planChannelCheck(ch("ACTIVE", "IMAGE"), true).checkMode).toBe("reachability");
    expect(planChannelCheck(ch("DISABLED", "IMAGE"), true).checkMode).toBe("reachability");
  });

  it("un-aliased channel → reachability", () => {
    const plan = planChannelCheck(ch("ACTIVE"), false);
    expect(plan.checkMode).toBe("reachability");
    expect(plan.interval).toBe(600_000);
  });
});

describe("shouldCallProbeChannel (F-HPE-02)", () => {
  const aliased = new Set(["ch_ACTIVE_TEXT", "ch_DISABLED_TEXT", "ch_DEGRADED_TEXT", "ch_ACTIVE_IMAGE"]);

  it("probes aliased ACTIVE text channel", () => {
    expect(shouldCallProbeChannel(ch("ACTIVE"), aliased)).toBe(true);
  });

  it("does NOT probe aliased DISABLED text channel", () => {
    expect(shouldCallProbeChannel(ch("DISABLED"), aliased)).toBe(false);
  });

  it("probes aliased DEGRADED text channel (may need revival)", () => {
    expect(shouldCallProbeChannel(ch("DEGRADED"), aliased)).toBe(true);
  });

  it("never probes IMAGE channels", () => {
    expect(shouldCallProbeChannel(ch("ACTIVE", "IMAGE"), aliased)).toBe(false);
  });

  it("never probes un-aliased channels", () => {
    expect(shouldCallProbeChannel(ch("ACTIVE"), new Set())).toBe(false);
  });
});

describe("fix round 1 DISABLED→DEGRADED auto-recovery preserved", () => {
  // Contract test: scheduler.ts's handleFailure still has the branch that
  // promotes DISABLED channels experiencing transient failures back to
  // DEGRADED. Emergency fix must not accidentally delete this safety net.
  it("scheduler.ts contains DISABLED→DEGRADED transient branch", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "../scheduler.ts"), "utf8");
    expect(source).toMatch(/route\.channel\.status === ["']DISABLED["']/);
    expect(source).toMatch(/updateChannelStatus\s*\(\s*route\s*,\s*["']DEGRADED["']\s*\)/);
  });
});
