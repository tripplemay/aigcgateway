/**
 * BL-SEC-CRED-HARDEN F-CH-03 — shared `requireEnv` helper for CLI scripts.
 *
 * Scripts under scripts/ + tests/e2e/ + tests/perf/ use this to read
 * secrets/passwords from env and exit(1) early with a clear message when
 * a required key is missing. Importing code paths must not fall back to
 * hardcoded defaults.
 */

import path from "node:path";

function scriptName(): string {
  const argv1 = process.argv[1];
  return argv1 ? path.basename(argv1) : "script";
}

/**
 * Returns process.env[key] when set to a non-empty value. Otherwise prints a
 * precise error to stderr and exits the process with code 1. This is the
 * standard entry point for CLI scripts that need a credential.
 */
export function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    console.error(`[${scriptName()}] Missing env: ${key}`);
    process.exit(1);
  }
  return value;
}

/**
 * Library-friendly variant for modules that should not exit the process
 * (e.g. Playwright specs, factories imported by test runners). Throws an Error
 * so the caller's harness can surface the failure cleanly.
 */
export function requireEnvOrThrow(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing env: ${key}`);
  }
  return value;
}
