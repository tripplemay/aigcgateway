/**
 * BL-VISION-INPUT F-VI-05 (Evaluator) — chat-content.ts 校验/检测/日志卫生单测。
 *
 * 覆盖 validateMessagesContent / messagesContainImage / sanitizeMessagesForLog
 * 全分支 + 对抗性边界（base64 大小估算、null/数字 content、异常嵌套、
 * 协议白名单绕过、占位符无字节泄漏、原 messages 不被 mutate）。
 *
 * 由独立 Evaluator 编写（generator 不写测试）。
 */
import { describe, it, expect } from "vitest";
import {
  validateMessagesContent,
  messagesContainImage,
  sanitizeMessagesForLog,
} from "../chat-content";
import { VISION_LIMITS } from "../vision-limits";

// ----- 构造工具 -----
function textPart(text = "hi") {
  return { type: "text", text };
}
function imagePart(url: string) {
  return { type: "image_url", image_url: { url } };
}
/** 生成解码后字节数约为 bytes 的 base64 data URI（jpeg）。 */
function dataUri(bytes: number, mime = "image/jpeg"): string {
  // base64 长度 ≈ ceil(bytes/3)*4；用无 padding 估算近似
  const b64Len = Math.ceil(bytes / 3) * 4;
  return `data:${mime};base64,${"A".repeat(b64Len)}`;
}

describe("validateMessagesContent — string 向后兼容", () => {
  it("非空 string content 通过", () => {
    expect(validateMessagesContent([{ role: "user", content: "hello" }])).toBeNull();
  });

  it("空 string content 拒绝（保留 F-WP-05 约束）", () => {
    const err = validateMessagesContent([{ role: "user", content: "" }]);
    expect(err).not.toBeNull();
    expect(err!.code).toBe("invalid_parameter");
    expect(err!.param).toBe("messages[0].content");
  });

  it("多条 string 混合，定位到第二条空串", () => {
    const err = validateMessagesContent([
      { role: "system", content: "sys" },
      { role: "user", content: "" },
    ]);
    expect(err!.param).toBe("messages[1].content");
  });
});

describe("validateMessagesContent — 多模态数组合法路径", () => {
  it("text + image_url(http) 合法数组通过", () => {
    expect(
      validateMessagesContent([
        { role: "user", content: [textPart("what is this"), imagePart("https://x.com/a.png")] },
      ]),
    ).toBeNull();
  });

  it("纯 text part 数组通过", () => {
    expect(
      validateMessagesContent([{ role: "user", content: [textPart("a"), textPart("b")] }]),
    ).toBeNull();
  });

  it("合法 base64 data:image 通过", () => {
    expect(
      validateMessagesContent([
        { role: "user", content: [imagePart("data:image/png;base64,AAAA")] },
      ]),
    ).toBeNull();
  });

  it("detail 字段不影响合法性", () => {
    expect(
      validateMessagesContent([
        {
          role: "user",
          content: [{ type: "image_url", image_url: { url: "https://x.com/a.png", detail: "high" } }],
        },
      ]),
    ).toBeNull();
  });
});

describe("validateMessagesContent — 非法结构", () => {
  it("空数组拒绝", () => {
    const err = validateMessagesContent([{ role: "user", content: [] }]);
    expect(err!.param).toBe("messages[0].content");
    expect(err!.message).toMatch(/empty array/);
  });

  it("part 缺 type 拒绝", () => {
    const err = validateMessagesContent([{ role: "user", content: [{ text: "x" }] }]);
    expect(err!.param).toBe("messages[0].content[0].type");
  });

  it("未知 type 拒绝", () => {
    const err = validateMessagesContent([
      { role: "user", content: [{ type: "video", url: "x" }] },
    ]);
    expect(err!.param).toBe("messages[0].content[0].type");
  });

  it("text part 缺 text 拒绝", () => {
    const err = validateMessagesContent([{ role: "user", content: [{ type: "text" }] }]);
    expect(err!.param).toBe("messages[0].content[0].text");
  });

  it("text part text 为空串拒绝", () => {
    const err = validateMessagesContent([{ role: "user", content: [{ type: "text", text: "" }] }]);
    expect(err!.param).toBe("messages[0].content[0].text");
  });

  it("text part text 非字符串拒绝", () => {
    const err = validateMessagesContent([{ role: "user", content: [{ type: "text", text: 123 }] }]);
    expect(err!.param).toBe("messages[0].content[0].text");
  });

  it("image_url 缺 url 拒绝", () => {
    const err = validateMessagesContent([
      { role: "user", content: [{ type: "image_url", image_url: {} }] },
    ]);
    expect(err!.param).toBe("messages[0].content[0].image_url.url");
  });

  it("image_url 整体缺失拒绝", () => {
    const err = validateMessagesContent([
      { role: "user", content: [{ type: "image_url" }] },
    ]);
    expect(err!.param).toBe("messages[0].content[0].image_url.url");
  });

  it("part 为 null 拒绝", () => {
    const err = validateMessagesContent([{ role: "user", content: [null] }]);
    expect(err!.param).toBe("messages[0].content[0]");
  });

  it("part 为字符串(非对象)拒绝", () => {
    const err = validateMessagesContent([{ role: "user", content: ["just a string"] }]);
    expect(err!.param).toBe("messages[0].content[0]");
  });
});

describe("validateMessagesContent — content 类型边界", () => {
  it("content 为 null 拒绝（非 string 非数组）", () => {
    const err = validateMessagesContent([{ role: "user", content: null }]);
    expect(err!.param).toBe("messages[0].content");
    expect(err!.message).toMatch(/non-empty string or an array/);
  });

  it("content 为数字拒绝", () => {
    const err = validateMessagesContent([{ role: "user", content: 42 as unknown }]);
    expect(err!.param).toBe("messages[0].content");
  });

  it("content 为对象(非数组)拒绝", () => {
    const err = validateMessagesContent([{ role: "user", content: { foo: "bar" } as unknown }]);
    expect(err!.param).toBe("messages[0].content");
  });

  it("content 为 undefined 拒绝", () => {
    const err = validateMessagesContent([{ role: "user" }]);
    expect(err!.param).toBe("messages[0].content");
  });
});

describe("validateMessagesContent — 协议白名单", () => {
  it("ftp:// 协议拒绝", () => {
    const err = validateMessagesContent([
      { role: "user", content: [imagePart("ftp://x.com/a.png")] },
    ]);
    expect(err!.param).toBe("messages[0].content[0].image_url.url");
    expect(err!.message).toMatch(/scheme/);
  });

  it("file:// 协议拒绝（SSRF/本地文件防护）", () => {
    const err = validateMessagesContent([
      { role: "user", content: [imagePart("file:///etc/passwd")] },
    ]);
    expect(err!.message).toMatch(/scheme/);
  });

  it("非 image 的 data: URI（data:text/html）拒绝", () => {
    const err = validateMessagesContent([
      { role: "user", content: [imagePart("data:text/html;base64,AAAA")] },
    ]);
    expect(err!.param).toBe("messages[0].content[0].image_url.url");
  });

  it("data:application/pdf 拒绝（仅 image）", () => {
    const err = validateMessagesContent([
      { role: "user", content: [imagePart("data:application/pdf;base64,AAAA")] },
    ]);
    expect(err).not.toBeNull();
  });

  it("非法 URL 字符串(无协议)拒绝", () => {
    const err = validateMessagesContent([
      { role: "user", content: [imagePart("not a url")] },
    ]);
    expect(err).not.toBeNull();
  });

  it("http:// 与 https:// 都允许", () => {
    expect(
      validateMessagesContent([{ role: "user", content: [imagePart("http://x.com/a.png")] }]),
    ).toBeNull();
    expect(
      validateMessagesContent([{ role: "user", content: [imagePart("https://x.com/a.png")] }]),
    ).toBeNull();
  });
});

describe("validateMessagesContent — base64 大小限制", () => {
  it("base64 解码 < 5MB 通过", () => {
    const uri = dataUri(VISION_LIMITS.maxBase64DecodedBytes - 1024); // ~5MB-1KB
    expect(
      validateMessagesContent([{ role: "user", content: [imagePart(uri)] }]),
    ).toBeNull();
  });

  it("base64 解码 > 5MB 拒绝", () => {
    const uri = dataUri(VISION_LIMITS.maxBase64DecodedBytes + 100 * 1024); // ~5MB+100KB
    const err = validateMessagesContent([{ role: "user", content: [imagePart(uri)] }]);
    expect(err).not.toBeNull();
    expect(err!.message).toMatch(/exceeds/);
  });
});

describe("validateMessagesContent — 图片数量限制", () => {
  it("恰好 10 张图片通过（边界）", () => {
    const content = Array.from({ length: VISION_LIMITS.maxImagesPerRequest }, () =>
      imagePart("https://x.com/a.png"),
    );
    expect(validateMessagesContent([{ role: "user", content }])).toBeNull();
  });

  it("11 张图片拒绝", () => {
    const content = Array.from({ length: VISION_LIMITS.maxImagesPerRequest + 1 }, () =>
      imagePart("https://x.com/a.png"),
    );
    const err = validateMessagesContent([{ role: "user", content }]);
    expect(err!.param).toBe("messages");
    expect(err!.message).toMatch(/maximum is/);
  });

  it("图片数跨多条 message 累计超 10 拒绝", () => {
    const six = () => ({
      role: "user",
      content: Array.from({ length: 6 }, () => imagePart("https://x.com/a.png")),
    });
    const err = validateMessagesContent([six(), six()]); // 12 张
    expect(err!.param).toBe("messages");
  });
});

describe("messagesContainImage", () => {
  it("含 image_url part → true", () => {
    expect(
      messagesContainImage([{ role: "user", content: [textPart(), imagePart("https://x/a.png")] }]),
    ).toBe(true);
  });

  it("纯文字数组 → false", () => {
    expect(messagesContainImage([{ role: "user", content: [textPart("a")] }])).toBe(false);
  });

  it("string content → false", () => {
    expect(messagesContainImage([{ role: "user", content: "hi" }])).toBe(false);
  });

  it("空数组 → false", () => {
    expect(messagesContainImage([{ role: "user", content: [] }])).toBe(false);
  });

  it("图片藏在 assistant 消息里也检测到（门禁覆盖所有角色）", () => {
    expect(
      messagesContainImage([
        { role: "user", content: "describe" },
        { role: "assistant", content: [imagePart("https://x/a.png")] },
      ]),
    ).toBe(true);
  });

  it("content 为 null/undefined 不崩 → false", () => {
    expect(messagesContainImage([{ role: "user", content: null }])).toBe(false);
    expect(messagesContainImage([{ role: "user" }])).toBe(false);
  });
});

describe("sanitizeMessagesForLog", () => {
  it("base64 data URI → [image:base64 NB] 占位符，无原始字节泄漏", () => {
    const bigB64 = "A".repeat(10000);
    const url = `data:image/png;base64,${bigB64}`;
    const out = sanitizeMessagesForLog([{ role: "user", content: [imagePart(url)] }]);
    const part = (out[0].content as { image_url: { url: string } }[])[0];
    expect(part.image_url.url).toMatch(/^\[image:base64 \d+B\]$/);
    expect(part.image_url.url).not.toContain("AAAA");
    expect(part.image_url.url.length).toBeLessThan(40);
  });

  it("http URL → [image:url host]，不含 path/query", () => {
    const out = sanitizeMessagesForLog([
      { role: "user", content: [imagePart("https://cdn.example.com/secret/path.png?token=xyz")] },
    ]);
    const part = (out[0].content as { image_url: { url: string } }[])[0];
    expect(part.image_url.url).toBe("[image:url cdn.example.com]");
    expect(part.image_url.url).not.toContain("token");
    expect(part.image_url.url).not.toContain("secret");
  });

  it("text part 原样保留", () => {
    const out = sanitizeMessagesForLog([
      { role: "user", content: [textPart("readable text"), imagePart("https://x/a.png")] },
    ]);
    const parts = out[0].content as { type: string; text?: string }[];
    expect(parts[0]).toEqual({ type: "text", text: "readable text" });
  });

  it("string content 原样返回", () => {
    const out = sanitizeMessagesForLog([{ role: "user", content: "plain string" }]);
    expect(out[0].content).toBe("plain string");
  });

  it("不 mutate 原 messages（深层不变）", () => {
    const url = "data:image/png;base64,AAAABBBB";
    const original = [{ role: "user", content: [imagePart(url)] }];
    const snapshot = JSON.stringify(original);
    sanitizeMessagesForLog(original);
    expect(JSON.stringify(original)).toBe(snapshot);
    // 原对象 url 未被改写
    expect((original[0].content[0] as { image_url: { url: string } }).image_url.url).toBe(url);
  });

  it("image_url.url 为 null 不崩 → [image]", () => {
    const out = sanitizeMessagesForLog([
      { role: "user", content: [{ type: "image_url", image_url: { url: null } }] },
    ]);
    const part = (out[0].content as { image_url: { url: string } }[])[0];
    expect(part.image_url.url).toBe("[image]");
  });

  it("image_url 整体缺失不崩", () => {
    const out = sanitizeMessagesForLog([
      { role: "user", content: [{ type: "image_url" }] },
    ]);
    const part = (out[0].content as { image_url: { url: string } }[])[0];
    expect(part.image_url.url).toBe("[image]");
  });

  it("image_url.url 非字符串(数字)不崩 → [image]", () => {
    const out = sanitizeMessagesForLog([
      { role: "user", content: [{ type: "image_url", image_url: { url: 12345 } }] },
    ]);
    const part = (out[0].content as { image_url: { url: string } }[])[0];
    expect(part.image_url.url).toBe("[image]");
  });

  it("无效 URL(无 host)不崩 → [image:url]", () => {
    const out = sanitizeMessagesForLog([
      { role: "user", content: [{ type: "image_url", image_url: { url: "::::" } }] },
    ]);
    const part = (out[0].content as { image_url: { url: string } }[])[0];
    expect(part.image_url.url).toBe("[image:url]");
  });

  it("非对象 part 原样返回", () => {
    const out = sanitizeMessagesForLog([
      { role: "user", content: ["raw", null] as unknown[] },
    ]);
    expect((out[0].content as unknown[])[0]).toBe("raw");
    expect((out[0].content as unknown[])[1]).toBeNull();
  });
});
