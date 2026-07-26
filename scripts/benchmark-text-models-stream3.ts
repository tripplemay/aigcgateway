/**
 * Round 3 streaming retry. Targets:
 *  - 4 truncated content=0 models (glm-4.7-flash, minimax-m2, glm-5, mimo-v2-pro)
 *    → drop max_tokens so reasoning has room to finish AND emit final content.
 *  - ernie-4.5 → max_tokens=10000 (within model's 12000 limit).
 *  - gpt-5 → drop max_tokens; if it still 504s, the issue is Nginx 120s.
 */
import { writeFileSync } from "fs";

const API_KEY = "pk_babacac250d73806db1e8bfb82a8cbeb408294a3c6abc8f2d462342cff8263bb";
const URL = "https://aigc.guangai.ai/v1/chat/completions";
const TIMEOUT_MS = 60 * 60 * 1000;
const STAGGER_MS = 400;

const MODELS: Array<{ name: string; maxTokens?: number }> = [
  { name: "glm-4.7-flash" },
  { name: "minimax-m2" },
  { name: "glm-5" },
  { name: "mimo-v2-pro" },
  { name: "ernie-4.5", maxTokens: 10000 },
  { name: "gpt-5" },
];

const QUESTION =
  "六个人A B C D E F参加一个循环赛，每两人之间恰好比赛一次，赢得1分，输得0分，平局各得0.5分。" +
  "比赛结束后：A的得分严格高于B，B严格高于C，C严格高于D，D严格高于E，E严格高于F，所有人得分各不相同，" +
  "且A和F的比赛结果是平局。请问C的得分是多少？给出完整推理过程。";

interface Result {
  model: string;
  durationMs: number;
  ttftMs?: number;
  ok: boolean;
  content?: string;
  reasoningContent?: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  httpStatus?: number;
  error?: string;
}

const ts = (): string => new Date().toISOString().slice(11, 19);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function callStreaming(model: string, maxTokens?: number): Promise<Result> {
  const start = Date.now();
  let firstByteAt: number | undefined;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const body: any = { model, messages: [{ role: "user", content: QUESTION }], stream: true };
    if (maxTokens) body.max_tokens = maxTokens;

    const res = await fetch(URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
        Accept: "text/event-stream",
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });

    if (!res.ok) {
      clearTimeout(timer);
      const text = await res.text();
      const ms = Date.now() - start;
      console.log(`[${ts()}] ${model.padEnd(24)} FAIL  ${(ms / 1000).toFixed(1)}s  HTTP ${res.status}  ${text.slice(0, 160).replace(/\n/g, " ")}`);
      return { model, durationMs: ms, ok: false, httpStatus: res.status, error: text.slice(0, 1000) };
    }

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let content = "";
    let reasoning = "";
    let usage: any = undefined;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (firstByteAt === undefined) firstByteAt = Date.now();
      buf += decoder.decode(value, { stream: true });

      let nl: number;
      while ((nl = buf.indexOf("\n")) !== -1) {
        const rawLine = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        const line = rawLine.replace(/\r$/, "").trim();
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") continue;
        try {
          const obj = JSON.parse(payload);
          const delta = obj.choices?.[0]?.delta;
          if (typeof delta?.content === "string") content += delta.content;
          if (typeof delta?.reasoning_content === "string") reasoning += delta.reasoning_content;
          if (typeof delta?.reasoning === "string") reasoning += delta.reasoning;
          if (obj.usage) usage = obj.usage;
        } catch {}
      }
    }
    clearTimeout(timer);
    const ms = Date.now() - start;
    const ttft = firstByteAt ? firstByteAt - start : undefined;
    console.log(
      `[${ts()}] ${model.padEnd(24)} OK    ${(ms / 1000).toFixed(1)}s  ttft=${ttft ?? "?"}ms  ` +
      `out=${usage?.completion_tokens ?? "?"}  content=${content.length}c  reasoning=${reasoning.length}c`,
    );
    return { model, durationMs: ms, ttftMs: ttft, ok: true, content, reasoningContent: reasoning || undefined, usage };
  } catch (err: any) {
    clearTimeout(timer);
    const ms = Date.now() - start;
    const msg = err?.name === "AbortError" ? "TIMEOUT (60min)" : err?.message || String(err);
    console.log(`[${ts()}] ${model.padEnd(24)} ERR   ${(ms / 1000).toFixed(1)}s  ${msg}`);
    return { model, durationMs: ms, ok: false, error: msg };
  }
}

async function main() {
  const start = Date.now();
  console.log(`Question: ${QUESTION}\n`);
  console.log(`Streaming round 3: ${MODELS.length} models, stagger ${STAGGER_MS}ms\n`);

  const promises: Promise<Result>[] = [];
  for (const m of MODELS) {
    promises.push(callStreaming(m.name, m.maxTokens));
    await sleep(STAGGER_MS);
  }

  const results = await Promise.all(promises);
  const totalSec = ((Date.now() - start) / 1000).toFixed(1);

  console.log(`\n=== ALL DONE in ${totalSec}s ===\n`);
  results.sort((a, b) => a.durationMs - b.durationMs);
  console.log("model                    status  duration  ttft");
  for (const r of results) {
    const d = (r.durationMs / 1000).toFixed(1) + "s";
    const t = r.ttftMs ? (r.ttftMs + "ms").padStart(7) : "      -";
    console.log(`${r.model.padEnd(24)} ${r.ok ? "OK  " : "FAIL"}    ${d.padStart(8)}  ${t}`);
  }
  const okCount = results.filter((r) => r.ok).length;
  console.log(`\n${okCount}/${results.length} succeeded.`);

  writeFileSync(
    "scripts/benchmark-results-stream3.json",
    JSON.stringify({ question: QUESTION, totalSec, startedAt: new Date(start).toISOString(), results }, null, 2),
  );
  console.log("Full answers: scripts/benchmark-results-stream3.json");
}

main().catch((e) => { console.error(e); process.exit(1); });
