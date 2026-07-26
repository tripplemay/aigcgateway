/**
 * Fan-out one question to every enabled text model on prod gateway, in parallel.
 * Per-model timeout 60 min. Streams progress to stdout; writes full results to
 * scripts/benchmark-results.json.
 */
import { writeFileSync } from "fs";

const API_KEY = "pk_babacac250d73806db1e8bfb82a8cbeb408294a3c6abc8f2d462342cff8263bb";
const BASE_URL = "https://aigc.guangai.ai/v1/chat/completions";
const TIMEOUT_MS = 60 * 60 * 1000;

const MODELS = [
  "claude-haiku-4.5",
  "deepseek-r1",
  "deepseek-v3",
  "deepseek-v4-flash",
  "deepseek-v4-pro",
  "doubao-pro",
  "ernie-4.5",
  "gemini-2.5-flash-lite",
  "gemini-3-flash",
  "gemma-4",
  "glm-4.7-flash",
  "glm-5",
  "gpt-4o",
  "gpt-4o-mini",
  "gpt-5",
  "grok-4.1-fast",
  "kimi-k2-thinking",
  "mimo-v2-flash",
  "mimo-v2-omni",
  "mimo-v2-pro",
  "minimax-m2",
  "minimax-m2.5",
  "qwen3.5-flash",
  "qwen3.5-plus",
];

const QUESTION =
  "六个人A B C D E F参加一个循环赛，每两人之间恰好比赛一次，赢得1分，输得0分，平局各得0.5分。" +
  "比赛结束后：A的得分严格高于B，B严格高于C，C严格高于D，D严格高于E，E严格高于F，所有人得分各不相同，" +
  "且A和F的比赛结果是平局。请问C的得分是多少？给出完整推理过程。";

interface Result {
  model: string;
  durationMs: number;
  ok: boolean;
  content?: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  httpStatus?: number;
  error?: string;
}

function ts(): string {
  return new Date().toISOString().slice(11, 19);
}

async function callOne(model: string): Promise<Result> {
  const start = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(BASE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: QUESTION }],
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    const durationMs = Date.now() - start;
    const sec = (durationMs / 1000).toFixed(1);
    if (!res.ok) {
      const text = await res.text();
      console.log(`[${ts()}] ${model.padEnd(24)} FAIL  ${sec}s  HTTP ${res.status}  ${text.slice(0, 160).replace(/\n/g, " ")}`);
      return { model, durationMs, ok: false, httpStatus: res.status, error: text.slice(0, 1000) };
    }
    const data: any = await res.json();
    const content: string = data.choices?.[0]?.message?.content || "(empty)";
    const usage = data.usage;
    console.log(
      `[${ts()}] ${model.padEnd(24)} OK    ${sec}s  ` +
      `in=${usage?.prompt_tokens ?? "?"} out=${usage?.completion_tokens ?? "?"} chars=${content.length}`,
    );
    return { model, durationMs, ok: true, content, usage };
  } catch (err: any) {
    clearTimeout(timer);
    const durationMs = Date.now() - start;
    const sec = (durationMs / 1000).toFixed(1);
    const msg = err?.name === "AbortError" ? "TIMEOUT (60min)" : (err?.message || String(err));
    console.log(`[${ts()}] ${model.padEnd(24)} ERR   ${sec}s  ${msg}`);
    return { model, durationMs, ok: false, error: msg };
  }
}

async function main() {
  const start = Date.now();
  console.log(`Question: ${QUESTION}\n`);
  console.log(`Firing ${MODELS.length} parallel chat calls at ${new Date().toISOString()}`);
  console.log(`Per-model timeout: 60min\n`);

  const results = await Promise.all(MODELS.map(callOne));
  const totalSec = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n=== ALL DONE in ${totalSec}s ===`);

  results.sort((a, b) => a.durationMs - b.durationMs);
  console.log("\nSummary (sorted by duration):");
  console.log("model                    status  duration");
  for (const r of results) {
    const d = (r.durationMs / 1000).toFixed(1) + "s";
    console.log(`${r.model.padEnd(24)} ${r.ok ? "OK  " : "FAIL"}    ${d.padStart(8)}`);
  }

  const okCount = results.filter((r) => r.ok).length;
  console.log(`\n${okCount}/${results.length} succeeded.`);

  writeFileSync(
    "scripts/benchmark-results.json",
    JSON.stringify({ question: QUESTION, totalSec, startedAt: new Date(start).toISOString(), results }, null, 2),
  );
  console.log("Full answers saved to scripts/benchmark-results.json");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
