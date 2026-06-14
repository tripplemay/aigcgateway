/**
 * BL-VISION-INPUT F-VI-05 (Evaluator) — mergeSystemMessages 数组兼容单测。
 *
 * mergeSystemMessages 是 file-private，通过 applyConfigOverlay 入口测：
 * 构造 supportsSystemRole=false 的 ProviderConfig，验证 system 文本被并入
 * 首条 user 消息时——数组 content（含 image_url）的图片 part 必须保留不丢失。
 *
 * 关键破坏点（spec § 2.3）：旧实现把数组 content 强转 ""，销毁图片。
 *
 * 由独立 Evaluator 编写。
 */
import { describe, it, expect } from "vitest";
import type { ProviderConfig } from "@prisma/client";
import { applyConfigOverlay } from "../config-overlay";
import type { ChatCompletionRequest, ChatContentPart } from "../types";

/** 构造一个 supportsSystemRole=false 的最小 ProviderConfig。 */
function noSystemConfig(): ProviderConfig {
  return {
    id: "cfg1",
    providerId: "p1",
    temperatureMin: 0,
    temperatureMax: 2,
    chatEndpoint: "/chat/completions",
    imageEndpoint: "/images/generations",
    imageViaChat: false,
    supportsModelsApi: false,
    healthCheckEndpoint: null,
    supportsSystemRole: false,
    currency: "USD",
    quirks: null,
    staticModels: null,
    pricingOverrides: null,
    docUrls: null,
    updatedAt: new Date(),
  } as unknown as ProviderConfig;
}

/** supportsSystemRole=true 的 config（不触发 mergeSystemMessages）。 */
function withSystemConfig(): ProviderConfig {
  return { ...noSystemConfig(), supportsSystemRole: true } as ProviderConfig;
}

function req(messages: ChatCompletionRequest["messages"]): ChatCompletionRequest {
  return { model: "m", messages };
}

describe("mergeSystemMessages — 数组 content 图片 part 保留（核心破坏点）", () => {
  it("首条 user 为数组(含 image_url) 时，system 文本前插 text part，图片保留", () => {
    const out = applyConfigOverlay(
      req([
        { role: "system", content: "You are a helper" },
        {
          role: "user",
          content: [
            { type: "text", text: "what is this?" },
            { type: "image_url", image_url: { url: "https://x.com/cat.png" } },
          ],
        },
      ]),
      noSystemConfig(),
    );

    expect(out.messages).toHaveLength(1);
    const userMsg = out.messages[0];
    expect(userMsg.role).toBe("user");
    const parts = userMsg.content as ChatContentPart[];
    // system 文本作为首个 text part 前插
    expect(parts[0]).toEqual({ type: "text", text: "You are a helper" });
    // 原 text part 保留
    expect(parts[1]).toEqual({ type: "text", text: "what is this?" });
    // 图片 part 必须保留不丢失（关键断言）
    expect(parts[2]).toEqual({ type: "image_url", image_url: { url: "https://x.com/cat.png" } });
    expect(parts).toHaveLength(3);
  });

  it("数组里只有 image part 时，system 前插后图片仍在", () => {
    const out = applyConfigOverlay(
      req([
        { role: "system", content: "sys" },
        { role: "user", content: [{ type: "image_url", image_url: { url: "https://x/a.png" } }] },
      ]),
      noSystemConfig(),
    );
    const parts = out.messages[0].content as ChatContentPart[];
    expect(parts[0]).toEqual({ type: "text", text: "sys" });
    expect(parts.some((p) => p.type === "image_url" && p.image_url?.url === "https://x/a.png")).toBe(
      true,
    );
  });
});

describe("mergeSystemMessages — string content 回归（行为不变）", () => {
  it("首条 user 为 string 时保持原拼接行为", () => {
    const out = applyConfigOverlay(
      req([
        { role: "system", content: "sys-prompt" },
        { role: "user", content: "hello" },
      ]),
      noSystemConfig(),
    );
    expect(out.messages).toHaveLength(1);
    expect(out.messages[0].content).toBe("sys-prompt\n\nhello");
  });

  it("supportsSystemRole=true 时不合并（system 消息保留）", () => {
    const out = applyConfigOverlay(
      req([
        { role: "system", content: "sys" },
        { role: "user", content: "hi" },
      ]),
      withSystemConfig(),
    );
    expect(out.messages).toHaveLength(2);
    expect(out.messages[0].role).toBe("system");
  });
});

describe("mergeSystemMessages — system 消息本身为数组", () => {
  it("system content 为数组时提取 text part 拼接（不再强转空串丢内容）", () => {
    const out = applyConfigOverlay(
      req([
        {
          role: "system",
          content: [
            { type: "text", text: "rule A" },
            { type: "text", text: "rule B" },
          ],
        },
        { role: "user", content: "go" },
      ]),
      noSystemConfig(),
    );
    expect(out.messages).toHaveLength(1);
    // 两条 text part 用 \n 拼接后再与 user 拼接
    expect(out.messages[0].content).toBe("rule A\nrule B\n\ngo");
  });

  it("system 数组含 image part 时仅提取 text（system 角色不携带图片入 user 文本）", () => {
    const out = applyConfigOverlay(
      req([
        {
          role: "system",
          content: [
            { type: "text", text: "sys-text" },
            { type: "image_url", image_url: { url: "https://x/sys.png" } },
          ],
        },
        { role: "user", content: "q" },
      ]),
      noSystemConfig(),
    );
    expect(out.messages[0].content).toBe("sys-text\n\nq");
  });
});

describe("mergeSystemMessages — 多条 / 边界", () => {
  it("多条 system 消息按出现顺序合并到首条 user", () => {
    const out = applyConfigOverlay(
      req([
        { role: "system", content: "s1" },
        { role: "system", content: "s2" },
        { role: "user", content: "u" },
      ]),
      noSystemConfig(),
    );
    expect(out.messages).toHaveLength(1);
    expect(out.messages[0].content).toBe("s1\ns2\n\nu");
  });

  it("无 user 消息时新建一条 user 承载 system 文本", () => {
    const out = applyConfigOverlay(
      req([{ role: "system", content: "only-sys" }]),
      noSystemConfig(),
    );
    expect(out.messages).toHaveLength(1);
    expect(out.messages[0].role).toBe("user");
    expect(out.messages[0].content).toBe("only-sys");
  });

  it("无 system 消息时不动 messages（数组 content 原样透传）", () => {
    const messages = [
      {
        role: "user" as const,
        content: [{ type: "image_url" as const, image_url: { url: "https://x/a.png" } }],
      },
    ];
    const out = applyConfigOverlay(req(messages), noSystemConfig());
    expect(out.messages).toHaveLength(1);
    const parts = out.messages[0].content as ChatContentPart[];
    expect(parts[0].image_url?.url).toBe("https://x/a.png");
  });

  it("多条 user 消息：仅首条 user 接收 system 文本，第二条 user 图片不变", () => {
    const out = applyConfigOverlay(
      req([
        { role: "system", content: "sys" },
        { role: "user", content: "first" },
        {
          role: "user",
          content: [{ type: "image_url", image_url: { url: "https://x/second.png" } }],
        },
      ]),
      noSystemConfig(),
    );
    expect(out.messages).toHaveLength(2);
    expect(out.messages[0].content).toBe("sys\n\nfirst");
    const secondParts = out.messages[1].content as ChatContentPart[];
    expect(secondParts[0].image_url?.url).toBe("https://x/second.png");
  });
});
