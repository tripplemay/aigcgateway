/**
 * WORKFLOW-POLISH F-WP-05 — shared prompt validation.
 *
 * Detects binary payloads masquerading as text. We count any non-printable,
 * non-whitespace characters (control chars outside \t/\r/\n, most C1 range)
 * and flag the prompt when they make up more than 30% of the string.
 */

const MIN_LENGTH_FOR_BINARY_CHECK = 8;
const BINARY_RATIO_THRESHOLD = 0.3;

export interface PromptValidation {
  ok: boolean;
  reason?: "empty" | "too_long" | "binary";
  message?: string;
}

export function validatePrompt(prompt: string, opts: { maxLength?: number } = {}): PromptValidation {
  const maxLength = opts.maxLength ?? 4000;
  const trimmed = prompt?.trim?.() ?? "";
  if (trimmed.length === 0) {
    return { ok: false, reason: "empty", message: "prompt must be a non-empty string" };
  }
  if (prompt.length > maxLength) {
    return {
      ok: false,
      reason: "too_long",
      message: `prompt exceeds the ${maxLength}-character limit`,
    };
  }
  if (prompt.length < MIN_LENGTH_FOR_BINARY_CHECK) {
    return { ok: true };
  }

  let suspicious = 0;
  for (let i = 0; i < prompt.length; i++) {
    const code = prompt.charCodeAt(i);
    // Printable ASCII range + common whitespace.
    if (code === 0x09 || code === 0x0a || code === 0x0d) continue;
    if (code >= 0x20 && code <= 0x7e) continue;
    // Any non-BMP / extended characters are fine (CJK etc.)
    if (code >= 0x80) continue;
    suspicious++;
  }
  if (suspicious / prompt.length > BINARY_RATIO_THRESHOLD) {
    return {
      ok: false,
      reason: "binary",
      message: "prompt appears to contain binary data and cannot be processed as text",
    };
  }
  return { ok: true };
}
