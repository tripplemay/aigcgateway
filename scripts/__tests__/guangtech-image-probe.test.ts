/**
 * BL-IMG-GUANGTECH-CHANNEL F-GTI-01 fix_round 1 — GTI-DEF-03 回归。
 *
 * 首版 probe 只统计 base64 解码后的字节数就判 PASS，等于只验证了"上游回了点什么"，
 * 没验证"回的是不是我们声称的那个东西"。结果三张图请求 1024x1024、实际返回
 * 1254x1254，而 alias 的 supported_sizes 照旧对外声明 1024x1024 —— list_models
 * 与 MCP 给出的能力元数据是失真的。
 *
 * 这与 seedream-3 的翻车同类：不能凭"上游有响应"推断"上游按我们的约定工作"。
 */
import { describe, it, expect } from "vitest";
import { readImageMeta } from "../add-guangtech-image-channels";

/** 造一个最小合法 PNG 头（只需前 24 字节可解析） */
function pngHeader(width: number, height: number): Buffer {
  const buf = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  buf.writeUInt32BE(13, 8); // IHDR chunk length
  buf.write("IHDR", 12, "latin1");
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

/** 造一个带 SOF0 的最小 JPEG */
function jpegWithSof(width: number, height: number): Buffer {
  const buf = Buffer.alloc(20);
  buf.writeUInt16BE(0xffd8, 0); // SOI
  buf.writeUInt16BE(0xffe0, 2); // APP0
  buf.writeUInt16BE(4, 4); // APP0 length（含自身 2 字节）
  buf.writeUInt16BE(0xffc0, 8); // SOF0
  buf.writeUInt16BE(11, 10); // segment length
  buf.writeUInt8(8, 12); // precision
  buf.writeUInt16BE(height, 13);
  buf.writeUInt16BE(width, 15);
  return buf;
}

describe("readImageMeta — 格式与真实像素尺寸", () => {
  it("解析 PNG 的宽高", () => {
    expect(readImageMeta(pngHeader(1024, 1024))).toEqual({
      format: "png",
      width: 1024,
      height: 1024,
    });
  });

  it("解析出生产实际返回的 1254x1254（本缺陷的现场值）", () => {
    expect(readImageMeta(pngHeader(1254, 1254))).toEqual({
      format: "png",
      width: 1254,
      height: 1254,
    });
  });

  it("解析 JPEG 的宽高（注意 JPEG 段内是 height 在前）", () => {
    expect(readImageMeta(jpegWithSof(1536, 1024))).toEqual({
      format: "jpeg",
      width: 1536,
      height: 1024,
    });
  });

  it("非图片字节返回 null —— 绝不当作可用响应", () => {
    expect(readImageMeta(Buffer.from("not an image at all, just text bytes"))).toBeNull();
  });

  it("空 buffer 返回 null 而不是抛异常", () => {
    expect(readImageMeta(Buffer.alloc(0))).toBeNull();
  });

  it("截断的 PNG（签名对但没到 IHDR）返回 null", () => {
    expect(readImageMeta(pngHeader(1024, 1024).subarray(0, 10))).toBeNull();
  });
});

describe("尺寸匹配判定 —— 决定能否声明 supported_sizes", () => {
  const REQUESTED = "1024x1024";
  const [reqW, reqH] = REQUESTED.split("x").map(Number);

  const matches = (buf: Buffer) => {
    const meta = readImageMeta(buf);
    return meta !== null && meta.width === reqW && meta.height === reqH;
  };

  it("返回尺寸与请求一致 → 可声明", () => {
    expect(matches(pngHeader(1024, 1024))).toBe(true);
  });

  it("返回 1254x1254（生产实况）→ 不可声明 1024x1024", () => {
    expect(matches(pngHeader(1254, 1254))).toBe(false);
  });

  it("尺寸解析不出来 → 按未验证处理，不可声明", () => {
    expect(matches(Buffer.from("garbage"))).toBe(false);
  });
});
