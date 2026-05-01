/**
 * BL-HEALTH-PROBE-LEAN F-HPL-04 — runTextCheck single-tier contract.
 * BL-HEALTH-PROBE-MIN-TOKENS F-HPMT-01 — max_tokens floor restored to 16
 * (Azure-backed gpt-5 rejects < 16 with invalid_request_error). These tests pin:
 *   (a) result array has exactly 1 CONNECTIVITY entry
 *   (b) empty choices → single CONNECTIVITY FAIL with "Empty response"
 *   (c) EngineError → single CONNECTIVITY FAIL whose errorMessage starts
 *       with the engine code (so isTransientFailureReason keeps working)
 *   (d) adapter is invoked with max_tokens:16, temperature:0, messages hi
 *       (covers runTextCheck path)
 *   (e) runCallProbe TEXT path also invokes adapter with max_tokens:16
 *       (covers the second hardcoded site in runCallProbe chat branch)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { runHealthCheck, runCallProbe } from "../checker";
import { EngineError, ErrorCodes } from "../../engine/types";
import type { RouteResult } from "../../engine/types";

const chatCompletionsMock = vi.fn();

vi.mock("../../engine/router", () => ({
  getAdapterForRoute: () => ({
    chatCompletions: chatCompletionsMock,
    imageGenerations: vi.fn(),
    chatCompletionsStream: vi.fn(),
  }),
}));

const route: RouteResult = {
  channel: { id: "ch-1" },
  provider: { name: "p" },
  config: {},
  model: { id: "m-1", name: "gpt-4o-mini", modality: "TEXT", supportedSizes: null },
  alias: { modality: "TEXT" },
} as unknown as RouteResult;

beforeEach(() => {
  chatCompletionsMock.mockReset();
});

describe("runTextCheck lean (F-HPL-01)", () => {
  it("returns a single CONNECTIVITY row when the adapter replies with choices", async () => {
    chatCompletionsMock.mockResolvedValueOnce({
      choices: [{ message: { role: "assistant", content: "." } }],
    });

    const results = await runHealthCheck(route);

    expect(results).toHaveLength(1);
    expect(results[0].level).toBe("CONNECTIVITY");
    expect(results[0].result).toBe("PASS");
    // No FORMAT / QUALITY rows should be emitted.
    expect(results.some((r) => r.level === "FORMAT")).toBe(false);
    expect(results.some((r) => r.level === "QUALITY")).toBe(false);
  });

  it("returns a single CONNECTIVITY FAIL when choices is empty", async () => {
    chatCompletionsMock.mockResolvedValueOnce({ choices: [] });

    const results = await runHealthCheck(route);
    expect(results).toHaveLength(1);
    expect(results[0].level).toBe("CONNECTIVITY");
    expect(results[0].result).toBe("FAIL");
    expect(results[0].errorMessage).toMatch(/Empty response/i);
  });

  it("returns a single CONNECTIVITY FAIL when adapter throws EngineError (e.g. RATE_LIMITED)", async () => {
    chatCompletionsMock.mockRejectedValueOnce(
      new EngineError("429 Too Many Requests", ErrorCodes.RATE_LIMITED, 429),
    );

    const results = await runHealthCheck(route);
    expect(results).toHaveLength(1);
    expect(results[0].level).toBe("CONNECTIVITY");
    expect(results[0].result).toBe("FAIL");
    // errorMessage format is `<ErrorCode>: <message>` so
    // isTransientFailureReason can keep matching.
    expect(results[0].errorMessage).toMatch(/^rate_limited:/i);
  });

  it("invokes adapter with max_tokens:16, temperature:0, single user 'hi' message (BL-HEALTH-PROBE-MIN-TOKENS F-HPMT-01)", async () => {
    chatCompletionsMock.mockResolvedValueOnce({
      choices: [{ message: { content: "ok" } }],
    });

    await runHealthCheck(route);
    const call = chatCompletionsMock.mock.calls[0];
    const request = call[0];
    expect(request.max_tokens).toBe(16);
    expect(request.temperature).toBe(0);
    expect(request.messages).toEqual([{ role: "user", content: "hi" }]);
  });
});

describe("runCallProbe chat branch (F-HPMT-01)", () => {
  it("invokes adapter.chatCompletions with max_tokens:16 for TEXT modality", async () => {
    chatCompletionsMock.mockResolvedValueOnce({
      choices: [{ message: { role: "assistant", content: "." } }],
    });

    const result = await runCallProbe(route);

    expect(result.level).toBe("CALL_PROBE");
    expect(result.result).toBe("PASS");

    const call = chatCompletionsMock.mock.calls[0];
    const request = call[0];
    expect(request.max_tokens).toBe(16);
    expect(request.temperature).toBe(0);
    expect(request.messages).toEqual([{ role: "user", content: "hi" }]);
  });
});
