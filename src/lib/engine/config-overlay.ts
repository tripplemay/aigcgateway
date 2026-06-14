/**
 * 配置覆盖层
 *
 * 根据 ProviderConfig 中的 quirks 标记，在发送请求前：
 * 1. clamp temperature 到 min/max 范围
 * 2. 移除不支持的参数
 * 3. 不支持 system 角色时合并到 user 消息
 */

import type { ProviderConfig } from "@prisma/client";
import type { ChatCompletionRequest, ChatMessage, ChatContentPart, Quirk } from "./types";

export function getQuirks(config: ProviderConfig): Set<Quirk> {
  const quirks = config.quirks;
  // Support both legacy array format and new object format { flags: [...], endpointMap: {...} }
  if (Array.isArray(quirks)) {
    return new Set(quirks as Quirk[]);
  }
  if (quirks && typeof quirks === "object" && "flags" in quirks) {
    return new Set((quirks as { flags: Quirk[] }).flags ?? []);
  }
  return new Set();
}

/**
 * 对请求应用配置覆盖
 */
export function applyConfigOverlay(
  request: ChatCompletionRequest,
  config: ProviderConfig,
): ChatCompletionRequest {
  const quirks = getQuirks(config);
  // 浅拷贝，避免修改原始对象
  const req = { ...request };

  // 1. clamp temperature
  if (req.temperature !== undefined) {
    const min = config.temperatureMin ?? 0;
    const max = config.temperatureMax ?? 2;

    if (quirks.has("temperature_open_interval")) {
      // 开区间 (min, max)，clamp 到 min+0.01 ~ max-0.01
      req.temperature = Math.min(Math.max(req.temperature, min + 0.01), max - 0.01);
    } else {
      req.temperature = Math.min(Math.max(req.temperature, min), max);
    }
  }

  // 2. 移除 response_format
  if (quirks.has("no_response_format")) {
    delete req.response_format;
  }

  // 3. 移除 penalty 参数
  if (quirks.has("no_penalty_params")) {
    delete req.presence_penalty;
    delete req.frequency_penalty;
  }

  // 4. 强制 n=1
  if (quirks.has("n_must_be_1")) {
    req.n = 1;
  }

  // 5. 不支持 system 角色：合并到第一条 user 消息
  if (!config.supportsSystemRole && req.messages) {
    req.messages = mergeSystemMessages(req.messages);
  }

  // 6. 流式请求加上 stream_options 以获取 usage
  if (req.stream) {
    req.stream_options = { include_usage: true };
  }

  return req;
}

function mergeSystemMessages(messages: ChatMessage[]): ChatMessage[] {
  const systemMsgs: string[] = [];
  const rest: ChatMessage[] = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      // BL-VISION-INPUT F-VI-03: system content 为数组时提取其 text part，
      // 不再无声转 "" 丢内容。
      systemMsgs.push(extractText(msg.content));
    } else {
      rest.push(msg);
    }
  }

  if (systemMsgs.length === 0) return messages;

  // 将 system 内容追加到第一条 user 消息前面
  const merged = systemMsgs.join("\n");
  const firstUserIdx = rest.findIndex((m) => m.role === "user");
  if (firstUserIdx >= 0) {
    const original = rest[firstUserIdx];
    rest[firstUserIdx] = {
      ...original,
      // BL-VISION-INPUT F-VI-03: 数组 content（含图片）时把 system 文本作为首个
      // text part 插入，保留图片等其余 part；string content 保持原拼接行为。
      content: prependSystemText(merged, original.content),
    };
  } else {
    // 没有 user 消息，创建一条
    rest.unshift({ role: "user", content: merged });
  }

  return rest;
}

/** 提取 message content 中的纯文本（string 直接返回；数组拼接 text part）。 */
function extractText(content: string | ChatContentPart[]): string {
  if (typeof content === "string") return content;
  return content
    .filter((p) => p.type === "text" && typeof p.text === "string")
    .map((p) => p.text as string)
    .join("\n");
}

/** 把 system 文本并入 user content：string 用拼接；数组则前插一个 text part。 */
function prependSystemText(
  prefix: string,
  content: string | ChatContentPart[],
): string | ChatContentPart[] {
  if (typeof content === "string") {
    return `${prefix}\n\n${content}`;
  }
  return [{ type: "text", text: prefix }, ...content];
}
