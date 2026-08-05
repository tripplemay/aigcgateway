/**
 * SSE 解析器
 *
 * 处理：
 * - buffer 拼接（跨 chunk 的不完整行）
 * - 忽略 `:` 开头的注释行（keepalive / OpenRouter processing）
 * - `[DONE]` 终止信号
 * - 空行分隔事件
 */

export interface SSEEvent {
  event?: string;
  data: string;
}

/**
 * 将 SSE 字节流转为 SSEEvent 对象流
 */
export function createSSEParser(): TransformStream<string, SSEEvent> {
  let buffer = "";
  // BL-SEC-HOTFIX-2608 F-SH-04（审查 H13）：这两个必须与 buffer 同级放在闭包里，
  // 跨 chunk 保留。原先它们声明在 transform() 内部，每个 chunk 都重置——一旦某个
  // chunk 以**完整的 data: 行**结尾、而终止空行落在下一个 chunk，本次积累的
  // dataLines 就在 transform 返回时被静默丢弃，该事件永远不会 enqueue。
  //
  // 后果有两层：① 用户收到的回答缺一段 token 且无任何报错；② 多数 OpenAI 兼容
  // 服务商把 usage 放在 [DONE] 前的最后一个 data 帧，该帧一旦被丢，
  // route.ts 的 lastUsage 保持 null → calculateTokenCost 返回 {0,0} →
  // shouldDeduct=false → 该次调用完全不计费。
  //
  // 分片边界由网络决定，单次概率不高，但每个流有成百上千次分片，生产流量下
  // 会稳定持续发生。
  let currentEvent: string | undefined;
  let dataLines: string[] = [];

  return new TransformStream<string, SSEEvent>({
    transform(chunk, controller) {
      buffer += chunk;

      // 按行分割，保留未完成的行在 buffer
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trimEnd();

        // 忽略注释行（: 开头，包括 keepalive 和 OpenRouter processing）
        if (trimmed.startsWith(":")) {
          continue;
        }

        // 空行 = 事件分隔符，派发已收集的数据
        if (trimmed === "") {
          if (dataLines.length > 0) {
            const data = dataLines.join("\n");
            // [DONE] 信号：关闭流
            if (data === "[DONE]") {
              controller.terminate();
              return;
            }
            controller.enqueue({ event: currentEvent, data });
            currentEvent = undefined;
            dataLines = [];
          }
          continue;
        }

        // event: xxx
        if (trimmed.startsWith("event:")) {
          currentEvent = trimmed.slice(6).trim();
          continue;
        }

        // data: xxx
        if (trimmed.startsWith("data:")) {
          dataLines.push(trimmed.slice(5).trimStart());
          continue;
        }

        // 其他字段（id:, retry: 等）忽略
      }
    },

    flush(controller) {
      // F-SH-04: 上游结束时可能有一个「data 行已到齐、但终止空行永远不会来」的
      // 事件悬在半空——既可能是残留在 buffer 里的最后一行未以 \n 结尾，也可能是
      // 已进 dataLines 但没等到空行。两种都要补发，否则仍会丢掉最后一帧
      // （通常正是携带 usage 的那一帧）。
      const tail = buffer.trim();
      if (tail.startsWith("data:")) {
        dataLines.push(tail.slice(5).trimStart());
      }
      buffer = "";

      if (dataLines.length > 0) {
        const data = dataLines.join("\n");
        dataLines = [];
        const event = currentEvent;
        currentEvent = undefined;
        if (data !== "[DONE]") {
          controller.enqueue({ event, data });
        }
      }
    },
  });
}

/**
 * 将 ReadableStream<Uint8Array> 转为 ReadableStream<string>
 */
export function createTextDecoderStream(): TransformStream<Uint8Array, string> {
  const decoder = new TextDecoder();
  return new TransformStream({
    transform(chunk, controller) {
      controller.enqueue(decoder.decode(chunk, { stream: true }));
    },
    flush(controller) {
      const final = decoder.decode();
      if (final) controller.enqueue(final);
    },
  });
}
