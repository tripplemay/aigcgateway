"use client";

/**
 * Internal test-only route to deterministically trigger the (console)/error.tsx
 * boundary. Used by Evaluator to capture the error page (zh-CN / en) during
 * verification. No user-facing navigation points here. Keeps a minimal footprint
 * and has no business side-effects.
 */
export default function ErrorTestPage() {
  throw new Error("Test: trigger (console)/error.tsx boundary");
}
