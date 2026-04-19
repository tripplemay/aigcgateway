/**
 * BL-INFRA-RESILIENCE F-IR-02 round-1 fix — stream cancel propagation.
 *
 * The openai-compat chatCompletionsStream wrapper owns a timer that must be
 * cleared when the caller cancels the returned stream. Round-1 verifying
 * caught a bug: the outer `cancel` hook called `upstream.cancel(reason)` but
 * `upstream` was already locked by the inner reader created in `start`,
 * producing "Invalid state: ReadableStream is locked" and failing to
 * propagate the signal up the pipeThrough chain (so the fetch body stayed
 * open).
 *
 * Fix: hoist `innerReader` into the closure and call `innerReader.cancel(reason)`
 * from the outer cancel hook. A reader is the lock holder, so its cancel is
 * legal and propagates upstream exactly like `stream.cancel` would.
 *
 * This test rebuilds the wrapper pattern in isolation and asserts both
 * invariants: no "locked" error, and upstream cancel observed.
 */
import { describe, it, expect } from "vitest";

interface WrapResult {
  cancelled: boolean;
  reason: unknown;
}

function makeUpstreamAndOuter() {
  const state = { cancelled: false, reason: null as unknown };
  const upstream = new ReadableStream<number>({
    pull(controller) {
      controller.enqueue(1);
    },
    cancel(reason) {
      state.cancelled = true;
      state.reason = reason;
    },
  });

  let innerReader: ReadableStreamDefaultReader<number> | null = null;
  let cleared = false;
  const outer = new ReadableStream<number>({
    async start(controller) {
      innerReader = upstream.getReader();
      try {
        const { value, done } = await innerReader.read();
        if (!done && value != null) controller.enqueue(value);
        // keep open — do not close so outer.cancel can exercise.
      } catch (err) {
        controller.error(err);
      } finally {
        cleared = true;
      }
    },
    async cancel(reason) {
      try {
        if (innerReader) await innerReader.cancel(reason);
        else await upstream.cancel(reason);
      } finally {
        cleared = true;
      }
    },
  });

  return { outer, state, wasTimerCleared: () => cleared } satisfies {
    outer: ReadableStream<number>;
    state: WrapResult;
    wasTimerCleared: () => boolean;
  };
}

describe("wrapper cancel propagation (F-IR-02 round-1 fix)", () => {
  it("outer reader cancel does not throw ReadableStream-locked and reaches upstream", async () => {
    const { outer, state } = makeUpstreamAndOuter();
    const reader = outer.getReader();
    await reader.read(); // prime start() so innerReader is live

    let cancelError: unknown = null;
    try {
      await reader.cancel("client_abort");
    } catch (err) {
      cancelError = err;
    }
    expect(cancelError).toBeNull();
    expect(state.cancelled).toBe(true);
    expect(state.reason).toBe("client_abort");
  });

  it("outer.cancel invoked before start completes still reaches upstream", async () => {
    const { outer, state } = makeUpstreamAndOuter();
    // Do not call getReader — directly cancel the stream before start runs.
    await outer.cancel("pre_start_abort");
    expect(state.cancelled).toBe(true);
    expect(state.reason).toBe("pre_start_abort");
  });
});
