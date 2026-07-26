/**
 * Final retry: gpt-5 only, after Nginx /v1/ proxy_read_timeout was bumped 120s→3700s.
 */
import { writeFileSync } from "fs";

const API_KEY = "pk_babacac250d73806db1e8bfb82a8cbeb408294a3c6abc8f2d462342cff8263bb";
const URL = "https://aigc.guangai.ai/v1/chat/completions";
const TIMEOUT_MS = 60 * 60 * 1000;

const QUESTION =
  "六个人A B C D E F参加一个循环赛，每两人之间恰好比赛一次，赢得1分，输得0分，平局各得0.5分。" +
  "比赛结束后：A的得分严格高于B，B严格高于C，C严格高于D，D严格高于E，E严格高于F，所有人得分各不相同，" +
  "且A和F的比赛结果是平局。请问C的得分是多少？给出完整推理过程。";

const ts = (): string => new Date().toISOString().slice(11, 19);

async function main() {
  const start = Date.now();
  let firstByteAt: number | undefined;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  console.log(`[${ts()}] gpt-5 firing (stream, no max_tokens)…`);
  try {
    const res = await fetch(URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
        Accept: "text/event-stream",
      },
      body: JSON.stringify({ model: "gpt-5", messages: [{ role: "user", content: QUESTION }], stream: true }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      clearTimeout(timer);
      const text = await res.text();
      const ms = Date.now() - start;
      console.log(`[${ts()}] gpt-5 FAIL ${(ms / 1000).toFixed(1)}s HTTP ${res.status} ${text.slice(0, 200)}`);
      writeFileSync("scripts/benchmark-results-gpt5.json", JSON.stringify({ ok: false, durationMs: ms, status: res.status, error: text.slice(0, 1000) }, null, 2));
      return;
    }
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buf = "", content = "", reasoning = "";
    let usage: any;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (firstByteAt === undefined) firstByteAt = Date.now();
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, nl).replace(/\r$/, "").trim();
        buf = buf.slice(nl + 1);
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
    console.log(`[${ts()}] gpt-5 OK ${(ms / 1000).toFixed(1)}s ttft=${ttft}ms out=${usage?.completion_tokens} content=${content.length}c reasoning=${reasoning.length}c`);
    writeFileSync(
      "scripts/benchmark-results-gpt5.json",
      JSON.stringify({ ok: true, durationMs: ms, ttftMs: ttft, content, reasoningContent: reasoning || undefined, usage }, null, 2),
    );
  } catch (err: any) {
    clearTimeout(timer);
    const ms = Date.now() - start;
    const msg = err?.name === "AbortError" ? "TIMEOUT (60min)" : err?.message;
    console.log(`[${ts()}] gpt-5 ERR ${(ms / 1000).toFixed(1)}s ${msg}`);
    writeFileSync("scripts/benchmark-results-gpt5.json", JSON.stringify({ ok: false, durationMs: ms, error: msg }, null, 2));
  }
}

main();
