import type {
  ChatResponse,
  ChatStream,
  StreamChunk,
  Usage,
  RawChatResponse,
  ToolCall,
  ToolCallDelta,
} from "./types/response";
import { ConnectionError } from "./errors";

/**
 * ChatStream 实现
 *
 * - AsyncIterable<StreamChunk>
 * - traceId / usage 流结束后可用
 * - abort() 中止流
 * - collect() 收集为完整 ChatResponse
 */
export class ChatStreamImpl implements ChatStream {
  traceId: string;
  usage: Usage | null = null;

  private reader: ReadableStreamDefaultReader<Uint8Array>;
  private abortController: AbortController;
  private decoder = new TextDecoder();
  private buffer = "";
  private done = false;
  private fullContent = "";
  private lastFinishReason: string | null = null;
  private toolCallDeltas: ToolCallDelta[] = [];

  constructor(
    response: Response,
    abortController: AbortController,
  ) {
    this.traceId =
      response.headers.get("x-trace-id") ?? "";
    this.reader = response.body!.getReader();
    this.abortController = abortController;
  }

  abort(): void {
    this.abortController.abort();
  }

  async collect(): Promise<ChatResponse> {
    const chunks: StreamChunk[] = [];
    for await (const chunk of this) {
      chunks.push(chunk);
    }

    return {
      content: this.fullContent,
      traceId: this.traceId,
      finishReason: (this.lastFinishReason ?? "stop") as ChatResponse["finishReason"],
      usage: this.usage ?? { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      raw: {} as RawChatResponse,
    };
  }

  [Symbol.asyncIterator](): AsyncIterator<StreamChunk> {
    return {
      next: async (): Promise<IteratorResult<StreamChunk>> => {
        while (true) {
          if (this.done) return { done: true, value: undefined };

          // Try to parse a chunk from buffer
          const chunk = this.parseNextChunk();
          if (chunk !== null) return { done: false, value: chunk };

          // Read more data
          try {
            const { done, value } = await this.reader.read();
            if (done) {
              this.done = true;
              // Process remaining buffer
              const remaining = this.parseNextChunk();
              if (remaining) return { done: false, value: remaining };
              return { done: true, value: undefined };
            }
            this.buffer += this.decoder.decode(value, { stream: true });
          } catch (err) {
            this.done = true;
            if (this.abortController.signal.aborted) {
              throw new ConnectionError("Stream aborted", "abort");
            }
            throw new ConnectionError(
              `Stream read failed: ${(err as Error).message}`,
              "network",
            );
          }
        }
      },
    };
  }

  private parseNextChunk(): StreamChunk | null {
    while (true) {
      const nlIdx = this.buffer.indexOf("\n");
      if (nlIdx === -1) return null;

      const line = this.buffer.slice(0, nlIdx).trimEnd();
      this.buffer = this.buffer.slice(nlIdx + 1);

      // Skip empty lines
      if (line === "") continue;

      // Skip SSE comments
      if (line.startsWith(":")) continue;

      // Must be data: line
      if (!line.startsWith("data:")) continue;

      const data = line.slice(5).trimStart();

      // [DONE] signal
      if (data === "[DONE]") {
        this.done = true;
        return null;
      }

      // Parse JSON chunk
      try {
        const parsed = JSON.parse(data);

        // Extract traceId from first chunk if not from header
        if (!this.traceId && parsed.id) {
          this.traceId = parsed.id.replace("chatcmpl-", "");
        }

        // Extract usage from last chunk
        if (parsed.usage) {
          this.usage = {
            promptTokens: parsed.usage.prompt_tokens ?? 0,
            completionTokens: parsed.usage.completion_tokens ?? 0,
            totalTokens: parsed.usage.total_tokens ?? 0,
          };
        }

        const choice = parsed.choices?.[0];
        if (!choice) continue;

        const content = choice.delta?.content ?? "";
        const finishReason = choice.finish_reason ?? null;
        const toolCalls = choice.delta?.tool_calls as ToolCallDelta[] | undefined;

        if (finishReason) this.lastFinishReason = finishReason;
        if (content) this.fullContent += content;
        if (toolCalls) this.toolCallDeltas.push(...toolCalls);

        return { content, finishReason, toolCalls };
      } catch {
        // Skip unparseable chunks
        continue;
      }
    }
  }
}
