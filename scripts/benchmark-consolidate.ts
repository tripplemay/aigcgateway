/**
 * Consolidate all benchmark rounds. For each of the 24 models, take the
 * latest successful run, extract the predicted C-score, and emit a
 * sorted summary + a single combined JSON.
 */
import { readFileSync, writeFileSync } from "fs";

interface RunRow {
  model: string;
  durationMs: number;
  ttftMs?: number;
  ok: boolean;
  content?: string;
  reasoningContent?: string;
  usage?: any;
  error?: string;
}

const ALL = [
  "claude-haiku-4.5", "deepseek-r1", "deepseek-v3", "deepseek-v4-flash",
  "deepseek-v4-pro", "doubao-pro", "ernie-4.5", "gemini-2.5-flash-lite",
  "gemini-3-flash", "gemma-4", "glm-4.7-flash", "glm-5",
  "gpt-4o", "gpt-4o-mini", "gpt-5", "grok-4.1-fast",
  "kimi-k2-thinking", "mimo-v2-flash", "mimo-v2-omni", "mimo-v2-pro",
  "minimax-m2", "minimax-m2.5", "qwen3.5-flash", "qwen3.5-plus",
];

function loadFile(path: string): RunRow[] {
  try {
    const data = JSON.parse(readFileSync(path, "utf8"));
    if (Array.isArray(data)) return data;
    if (Array.isArray(data.results)) return data.results;
    return [data];
  } catch {
    return [];
  }
}

// Round priority: later/successful rounds win.
const FILES = [
  "scripts/benchmark-results.json",
  "scripts/benchmark-results-stream.json",
  "scripts/benchmark-results-stream2.json",
  "scripts/benchmark-results-stream3.json",
];

const merged: Record<string, RunRow & { source: string }> = {};

for (const f of FILES) {
  const rows = loadFile(f);
  for (const r of rows) {
    if (!r.ok || !r.content) continue;
    if (r.content.length === 0 && (!r.reasoningContent || r.reasoningContent.length === 0)) continue;
    // Prefer rows with non-empty content (reject "OK but content=0" round-2 hits).
    const existing = merged[r.model];
    if (!existing) {
      merged[r.model] = { ...r, source: f };
    } else {
      const existingScore = (existing.content?.length ?? 0) + (existing.reasoningContent?.length ?? 0) > 0 ? 1 : 0;
      const newScore = (r.content?.length ?? 0) + (r.reasoningContent?.length ?? 0) > 0 ? 1 : 0;
      if (newScore > existingScore) {
        merged[r.model] = { ...r, source: f };
      }
    }
  }
}

// Special standalone files
try {
  const gpt5 = JSON.parse(readFileSync("scripts/benchmark-results-gpt5.json", "utf8"));
  if (gpt5.ok) merged["gpt-5"] = { model: "gpt-5", ...gpt5, source: "scripts/benchmark-results-gpt5.json" };
} catch {}
try {
  const m25 = JSON.parse(readFileSync("scripts/benchmark-results-minimax-m25.json", "utf8"));
  if (m25.ok) merged["minimax-m2.5"] = { model: "minimax-m2.5", ...m25, source: "scripts/benchmark-results-minimax-m25.json" };
} catch {}

// Extract predicted C score
function extractCScore(text: string): string {
  if (!text) return "?";
  // Common Chinese phrasings for the final answer
  const patterns: RegExp[] = [
    /C\s*的得分(?:是|为|=|：|:)?\s*([0-9]+(?:\.[0-9]+)?)/,
    /C\s*=\s*([0-9]+(?:\.[0-9]+)?)/,
    /C\s*的分数(?:是|为|=|：|:)?\s*([0-9]+(?:\.[0-9]+)?)/,
    /\bC[^A-Za-z0-9]{0,8}([0-9]+(?:\.[0-9]+)?)\s*分/,
  ];
  // Search the LAST 600 chars first (where conclusions usually live), then full text
  const tail = text.slice(-600);
  for (const re of patterns) {
    const m = tail.match(re);
    if (m) return m[1];
  }
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return m[1];
  }
  return "?";
}

const rows = ALL.map((name) => {
  const r = merged[name];
  if (!r) return { model: name, ok: false, durationMs: 0, score: "—", chars: 0 };
  const text = (r.content ?? "") + " " + (r.reasoningContent ?? "");
  return {
    model: name,
    ok: true,
    durationMs: r.durationMs,
    ttftMs: r.ttftMs,
    contentChars: r.content?.length ?? 0,
    reasoningChars: r.reasoningContent?.length ?? 0,
    completionTokens: r.usage?.completion_tokens,
    score: extractCScore(text),
    source: r.source,
    answerTail: r.content ? r.content.slice(-300).replace(/\s+/g, " ").trim() : "(reasoning-only)",
  };
});

rows.sort((a, b) => a.durationMs - b.durationMs);

console.log("model                    duration   ttft       tokens  C=    chars(content/reasoning)  source");
for (const r of rows) {
  if (!r.ok) {
    console.log(`${r.model.padEnd(24)} ${"FAIL".padStart(8)}`);
    continue;
  }
  const d = (r.durationMs / 1000).toFixed(1) + "s";
  const t = r.ttftMs ? (r.ttftMs / 1000).toFixed(1) + "s" : "?";
  const tok = String(r.completionTokens ?? "?");
  const chars = `${r.contentChars}/${r.reasoningChars}`;
  console.log(
    `${r.model.padEnd(24)} ${d.padStart(8)}  ${t.padStart(7)}  ${tok.padStart(6)}  ${String(r.score).padEnd(4)}  ${chars.padEnd(20)}  ${r.source.replace("scripts/benchmark-results", "...")}`,
  );
}

console.log("\n-- per-model answer tails (last 300 chars of content) --");
for (const r of rows) {
  if (!r.ok) continue;
  console.log(`\n### ${r.model} (C=${r.score}, ${(r.durationMs / 1000).toFixed(1)}s)`);
  console.log(r.answerTail || "(no content; reasoning-only)");
}

writeFileSync("scripts/benchmark-final.json", JSON.stringify({
  question: "六个人A B C D E F循环赛，A>B>C>D>E>F且各不相同，A与F平局，求 C 的得分？",
  models: rows,
}, null, 2));
console.log("\nFinal consolidated -> scripts/benchmark-final.json");
