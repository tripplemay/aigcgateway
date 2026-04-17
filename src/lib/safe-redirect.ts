/**
 * F-LL-02: whitelist for post-login redirect paths.
 *
 * Guards against open-redirect abuse where a crafted link like
 * `/login?redirect=https://evil.com` sends the user off our domain
 * after they enter credentials. We accept only same-origin relative
 * paths that cannot be mis-parsed as protocol-relative URLs.
 *
 * Allowed shape: starts with a single "/", followed by printable
 * characters, length ≤ 256. Rejects:
 *   - "//evil.com"              protocol-relative
 *   - "https://evil.com"        absolute
 *   - "javascript:alert(1)"     javascript pseudo-scheme
 *   - "\\evil.com"              backslash path (IE-style)
 *   - "/path\u0000"             embedded control chars
 *   - non-string / empty / ">256 chars"
 */
const MAX_LEN = 256;
const CONTROL_CHAR_RE = /[\x00-\x1f\x7f]/;

export function isSafeRedirect(raw: unknown): raw is string {
  if (typeof raw !== "string") return false;
  if (raw.length === 0 || raw.length > MAX_LEN) return false;
  if (raw[0] !== "/") return false;
  if (raw.startsWith("//")) return false;
  if (raw.includes("\\")) return false;
  if (CONTROL_CHAR_RE.test(raw)) return false;
  return true;
}

export function sanitizeRedirect(raw: unknown, fallback = "/dashboard"): string {
  return isSafeRedirect(raw) ? raw : fallback;
}
