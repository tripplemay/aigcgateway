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

  return new TransformStream<string, SSEEvent>({
    transform(chunk, controller) {
      buffer += chunk;

      // 按行分割，保留未完成的行在 buffer
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      let currentEvent: string | undefined;
      let dataLines: string[] = [];

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
      // 处理最后可能未以换行符结尾的数据
      if (buffer.trim().startsWith("data:")) {
        const data = buffer.trim().slice(5).trimStart();
        if (data !== "[DONE]") {
          controller.enqueue({ data });
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
