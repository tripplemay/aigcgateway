import { writeFileSync } from "fs";

const KEY = "pk_babacac250d73806db1e8bfb82a8cbeb408294a3c6abc8f2d462342cff8263bb";
const Q =
  "六个人A B C D E F参加一个循环赛，每两人之间恰好比赛一次，赢得1分，输得0分，平局各得0.5分。" +
  "比赛结束后：A的得分严格高于B，B严格高于C，C严格高于D，D严格高于E，E严格高于F，所有人得分各不相同，" +
  "且A和F的比赛结果是平局。请问C的得分是多少？给出完整推理过程。";

async function main() {
  const start = Date.now();
  let firstByte: number | undefined;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 3_600_000);
  try {
    const res = await fetch("https://aigc.guangai.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${KEY}`,
        Accept: "text/event-stream",
      },
      body: JSON.stringify({ model: "minimax-m2.5", messages: [{ role: "user", content: Q }], stream: true }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      clearTimeout(timer);
      const t = await res.text();
      console.log("FAIL", res.status, t.slice(0, 300));
      writeFileSync("scripts/benchmark-results-minimax-m25.json", JSON.stringify({ ok: false, status: res.status, error: t.slice(0, 1000) }, null, 2));
      return;
    }
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let buf = "", content = "", reasoning = "";
    let usage: any;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (firstByte === undefined) firstByte = Date.now();
      buf += dec.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, nl).replace(/\r$/, "").trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const p = line.slice(5).trim();
        if (p === "[DONE]") continue;
        try {
          const o = JSON.parse(p);
          const d = o.choices?.[0]?.delta;
          if (typeof d?.content === "string") content += d.content;
          if (typeof d?.reasoning_content === "string") reasoning += d.reasoning_content;
          if (typeof d?.reasoning === "string") reasoning += d.reasoning;
          if (o.usage) usage = o.usage;
        } catch {}
      }
    }
    clearTimeout(timer);
    const ms = Date.now() - start;
    console.log(`minimax-m2.5 OK ${(ms / 1000).toFixed(1)}s ttft=${firstByte! - start}ms out=${usage?.completion_tokens} content=${content.length}c reasoning=${reasoning.length}c`);
    writeFileSync(
      "scripts/benchmark-results-minimax-m25.json",
      JSON.stringify({ ok: true, durationMs: ms, ttftMs: firstByte! - start, content, reasoningContent: reasoning, usage }, null, 2),
    );
  } catch (err: any) {
    clearTimeout(timer);
    const ms = Date.now() - start;
    console.log("ERR", (ms / 1000).toFixed(1) + "s", err?.message || err);
    writeFileSync("scripts/benchmark-results-minimax-m25.json", JSON.stringify({ ok: false, durationMs: ms, error: err?.message || String(err) }, null, 2));
  }
}

main();
