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

type ChannelStub = { id: string; status: string; model: { modality: string; name: string } };

function ch(
  status: string,
  modality: "TEXT" | "IMAGE" | "EMBEDDING" = "TEXT",
  name = "gpt-4o-mini",
): ChannelStub {
  return { id: `ch_${status}_${modality}`, status, model: { modality, name } };
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

  // BL-EMBEDDING-MVP fix-round-2: EMBEDDING channel 须走 full（adapter.embeddings
  // 真调用），与 TEXT 同等待遇。原 isImage/else 二分让 EMBEDDING 错误走 chat
  // probe → 上游 400 → 自动 DEGRADED。
  it("aliased ACTIVE EMBEDDING channel → full + ACTIVE_INTERVAL (fix-round-2)", () => {
    const plan = planChannelCheck(ch("ACTIVE", "EMBEDDING", "bge-m3"), true);
    expect(plan.checkMode).toBe("full");
    expect(plan.interval).toBe(600_000);
  });

  it("aliased DEGRADED EMBEDDING channel still on full path (revival probe)", () => {
    const plan = planChannelCheck(ch("DEGRADED", "EMBEDDING", "bge-m3"), true);
    expect(plan.checkMode).toBe("full");
  });

  it("un-aliased channel → reachability", () => {
    const plan = planChannelCheck(ch("ACTIVE"), false);
    expect(plan.checkMode).toBe("reachability");
    expect(plan.interval).toBe(600_000);
  });
});

describe("shouldCallProbeChannel (F-HPE-02)", () => {
  const aliased = new Set([
    "ch_ACTIVE_TEXT",
    "ch_DISABLED_TEXT",
    "ch_DEGRADED_TEXT",
    "ch_ACTIVE_IMAGE",
  ]);

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

  // BL-EMBEDDING-MVP fix-round-2: EMBEDDING channels eligible for CALL_PROBE
  it("probes aliased ACTIVE EMBEDDING channels (fix-round-2)", () => {
    const chan = ch("ACTIVE", "EMBEDDING", "bge-m3");
    expect(shouldCallProbeChannel(chan, new Set([chan.id]))).toBe(true);
  });

  it("probes aliased DEGRADED EMBEDDING channel (needs revival)", () => {
    const chan = ch("DEGRADED", "EMBEDDING", "bge-m3");
    expect(shouldCallProbeChannel(chan, new Set([chan.id]))).toBe(true);
  });

  it("does NOT probe aliased DISABLED EMBEDDING channel", () => {
    const chan = ch("DISABLED", "EMBEDDING", "bge-m3");
    expect(shouldCallProbeChannel(chan, new Set([chan.id]))).toBe(false);
  });

  it("never probes un-aliased channels", () => {
    expect(shouldCallProbeChannel(ch("ACTIVE"), new Set())).toBe(false);
  });
});

describe("expensive model whitelist (F-HPL-02)", () => {
  it("ACTIVE aliased text channel running an expensive model → checkMode='skip'", () => {
    const plan = planChannelCheck(ch("ACTIVE", "TEXT", "gpt-4o-mini-search-preview"), true);
    expect(plan.checkMode).toBe("skip");
  });

  it("DEGRADED aliased text channel running an expensive model → skip (no revival probe)", () => {
    const plan = planChannelCheck(ch("DEGRADED", "TEXT", "o1-preview"), true);
    expect(plan.checkMode).toBe("skip");
  });

  it("shouldCallProbeChannel returns false for expensive ACTIVE aliased channel", () => {
    const chan = ch("ACTIVE", "TEXT", "gpt-4o-mini-search-preview");
    expect(shouldCallProbeChannel(chan, new Set([chan.id]))).toBe(false);
  });

  it("non-expensive ACTIVE aliased text channel continues to be call-probed", () => {
    const chan = ch("ACTIVE", "TEXT", "gpt-4o-mini");
    expect(shouldCallProbeChannel(chan, new Set([chan.id]))).toBe(true);
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

// BL-EMBEDDING-MVP fix-round-3: re-entrancy guard regression test.
//
// Background: fix-round-2 (commit 2f05db8) deployment caused 5-fold burst
// of probes — same channel selected on each of 5 consecutive 60s ticks.
// Root cause hypothesis (H4 race): runScheduledChecks is fire-and-forget
// (setInterval doesn't await), so when one tick runs > 60s the next tick
// starts concurrently; both see stale lastCheckTime and probe.
//
// Fix: schedulerRunning boolean guard — skip new tick if previous still
// running. These contract tests pin the guard's presence so future refactor
// can't silently delete it.
describe("fix-round-3 re-entrancy guard (5-burst regression)", () => {
  it("scheduler.ts declares schedulerRunning module flag", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "../scheduler.ts"), "utf8");
    expect(source).toMatch(/let\s+schedulerRunning\s*=\s*false\s*;/);
  });

  it("startScheduler skips re-entrant ticks", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "../scheduler.ts"), "utf8");
    expect(source).toMatch(/if\s*\(\s*schedulerRunning\s*\)/);
    expect(source).toMatch(/re-entrancy guard/i);
  });

  it("startScheduler resets schedulerRunning in finally block", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "../scheduler.ts"), "utf8");
    expect(source).toMatch(/\.finally\(\(\)\s*=>\s*\{\s*schedulerRunning\s*=\s*false/);
  });
});
