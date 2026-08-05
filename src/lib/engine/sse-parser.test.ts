/**
 * BL-SEC-HOTFIX-2608 F-SH-04 — SSE 解析器跨 chunk 丢帧回归（审查 H13）。
 *
 * 修复前 currentEvent / dataLines 声明在 transform() 内部，每个 chunk 重置。
 * 只要某个 chunk 以完整的 `data:` 行结尾、终止空行落在下一个 chunk，该事件就被
 * 静默丢弃。后果：① 流式回答缺内容且无报错；② 多数服务商把 usage 放在 [DONE]
 * 前的最后一帧，该帧被丢则 lastUsage=null → sellUsd=0 → 该次调用完全不计费。
 *
 * 分片场景取自 spec §4 的三组必测输入。
 */
import { describe, it, expect } from "vitest";
import { createSSEParser } from "./sse-parser";

/** 把若干 chunk 喂进解析器，收集解析出的事件 */
async function parse(chunks: string[]): Promise<Array<{ event?: string; data: string }>> {
  const parser = createSSEParser();
  const out: Array<{ event?: string; data: string }> = [];

  const reader = parser.readable.getReader();
  const pump = (async () => {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      out.push(value);
    }
  })();

  const writer = parser.writable.getWriter();
  // [DONE] 会 controller.terminate()，此后的 write/close 必然拒绝——这是解析器的
  // 既有正确行为（pipeThrough 场景下等价于上游被切断），测试侧吞掉即可。
  try {
    for (const c of chunks) await writer.write(c);
    await writer.close();
  } catch {
    /* stream terminated */
  }
  await pump;
  return out;
}

const d = (n: number) => JSON.stringify({ i: n });

describe("F-SH-04 SSE 分片边界", () => {
  it("场景 A：每帧独立到达（修复前后都应正确）", async () => {
    const out = await parse([`data: ${d(1)}\n\n`, `data: ${d(2)}\n\n`]);
    expect(out.map((e) => e.data)).toEqual([d(1), d(2)]);
  });

  it("场景 B：边界落在帧内两个换行之间 —— 修复前丢第 1 帧", async () => {
    const out = await parse([`data: ${d(1)}\n`, `\ndata: ${d(2)}\n\n`]);
    expect(out.map((e) => e.data)).toEqual([d(1), d(2)]);
  });

  it("场景 C：多帧合并且 chunk 以完整 data 行结尾 —— 修复前丢第 2 帧", async () => {
    const out = await parse([`data: ${d(1)}\n\ndata: ${d(2)}\n`, `\ndata: ${d(3)}\n\n`]);
    expect(out.map((e) => e.data)).toEqual([d(1), d(2), d(3)]);
  });

  it("逐字符分片（最坏情况）仍不丢帧", async () => {
    const whole = `data: ${d(1)}\n\ndata: ${d(2)}\n\ndata: ${d(3)}\n\n`;
    const out = await parse(whole.split(""));
    expect(out.map((e) => e.data)).toEqual([d(1), d(2), d(3)]);
  });

  it("携带 usage 的末帧不会因分片丢失（计费回归）", async () => {
    // 真实形态：内容帧 + usage 帧 + [DONE]，分片切在 usage 帧的两个换行之间
    const usage = JSON.stringify({ choices: [], usage: { total_tokens: 42 } });
    const out = await parse([`data: ${d(1)}\n\ndata: ${usage}\n`, `\ndata: [DONE]\n\n`]);
    const last = out[out.length - 1];
    expect(JSON.parse(last.data).usage.total_tokens).toBe(42);
  });
});

describe("F-SH-04 既有语义不得改变", () => {
  it("[DONE] 终止流且不作为事件下发", async () => {
    const out = await parse([`data: ${d(1)}\n\n`, `data: [DONE]\n\n`, `data: ${d(9)}\n\n`]);
    expect(out.map((e) => e.data)).toEqual([d(1)]);
  });

  it("注释行（keepalive / OpenRouter processing）被忽略", async () => {
    const out = await parse([`: keepalive\n\n`, `: OPENROUTER PROCESSING\n\n`, `data: ${d(1)}\n\n`]);
    expect(out.map((e) => e.data)).toEqual([d(1)]);
  });

  it("event: 字段被解析，且跨 chunk 与其 data 保持配对", async () => {
    const out = await parse([`event: ping\n`, `data: ${d(1)}\n`, `\n`]);
    expect(out).toEqual([{ event: "ping", data: d(1) }]);
  });

  it("多行 data 合并为一个事件", async () => {
    const out = await parse([`data: line1\ndata: line2\n\n`]);
    expect(out.map((e) => e.data)).toEqual(["line1\nline2"]);
  });

  it("流结束时未以空行收尾的最后一帧仍被补发", async () => {
    const out = await parse([`data: ${d(7)}`]);
    expect(out.map((e) => e.data)).toEqual([d(7)]);
  });
});
