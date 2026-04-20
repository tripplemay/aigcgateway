/**
 * BL-HEALTH-PROBE-LEAN F-HPL-02 — expensive model whitelist.
 *
 * Some upstream models cost 10-100× a normal chat completion even for a
 * single token (built-in web search, reasoning overhead, pro-preview
 * multimodal fan-out). OpenRouter 2026-04-16 billed
 * `openai/gpt-4o-mini-search-preview` 82 probe calls = $2.25 in one day —
 * a single channel outweighing our entire normal probe budget.
 *
 * The scheduler treats models whose canonical / real model name matches any
 * of these patterns as "never probe". Real user traffic still measures
 * health via F-HPL-03 call_logs aggregation; the router's cooldown handles
 * transient outages on demand.
 */

export const EXPENSIVE_MODEL_PATTERNS: RegExp[] = [
  /-search(-|$)/i, // e.g. gpt-4o-mini-search-preview, sonar-search, *-search
  /-reasoning(-|$)/i, // e.g. gpt-4o-reasoning-beta, deep-reasoning
  /(^|[/-])o1-/i, // o1-preview, o1-mini, openai/o1-pro
  /(^|[/-])o3-/i, // o3-mini, o3-pro
  /-pro-(preview|image|video)/i, // *-pro-preview, *-pro-image, *-pro-video
];

export function isExpensiveModel(modelName: string | null | undefined): boolean {
  if (!modelName) return false;
  return EXPENSIVE_MODEL_PATTERNS.some((re) => re.test(modelName));
}
