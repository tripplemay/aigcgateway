# 生产问题诊断：生成的图片无法下载（2026-06-01）

**报告人：** Kimi (Claude CLI / Planner)
**触发：** 用户反馈 — 其他用户用网关生成了几张图片，但无法下载
**状态：** ✅ 根因已确认（代码级 + 用户现场证据互证）。
**现场证据：** 日志中输出显示为 `[image:png, 1735KB]`；刚生成就下载失败。

---

## 0. 结论（一句话）

**base64 类图片模型（gemini-3-pro-image / gpt-image / gpt-image-mini）经 MCP `generate_image` 生成时，工具把 `data:` URI 也错误地包装成了签名代理 URL，而该代理只能回源 http(s) 上游、且 base64 早已被落库逻辑 strip 成 `[image:png, NKB]` metadata——代理永远 404，故图片"刚生成就无法下载"。**

## 1. 证据链（完全自洽）

1. 当前网关可用图片模型仅 4 个（`list_models(image)` 实测）：`gemini-3-pro-image`、`gpt-image`、`gpt-image-mini`（**均返回 base64 `data:` URI**）、`seedream-3`（返回 https URL）。
2. 用户在日志看到 `[image:png, 1735KB]` —— 这是 `summarizeImageUrl()` 对 **`data:` URI** 的输出（`post-process.ts:251-268`）。证明出问题的图是 **base64 模型**生成的。
3. "刚生成就不行" —— 不是过期（1h/24h）问题，是**结构性**失败。

## 2. 确认的 Bug（MCP 路径）

`src/lib/mcp/tools/generate-image.ts:264-267`：
```js
const baseOrigin = process.env.NEXT_PUBLIC_GATEWAY_ORIGIN ?? "https://aigc.guangai.ai";
const urls = response.data
  .map((d, i) => (d?.url ? buildProxyUrl(traceId, i, baseOrigin) : null))  // ⚠️ 未排除 data:
  .filter((u): u is string => typeof u === "string");
```

对比正确实现 `src/lib/api/image-proxy.ts:58`（API 路径）：
```js
url: url && !url.startsWith("data:") ? buildProxyUrl(traceId, i, origin) : url,  // data: 原样透传
```

**MCP 工具缺了 `!url.startsWith("data:")` 判断**，把 base64 `data:` URI 也包装成代理 URL 返回给客户端。

## 3. 为什么代理 URL 必然 404

代理回源 `src/app/api/v1/images/proxy/[traceId]/[idx]/route.ts:33-42`：
1. 从 `CallLog.responseSummary.original_urls[idx]` 取上游地址。
2. `original_urls` 由 `post-process.ts:477-479` 用 `summarizeImageUrl(d.url)` 构建——对 `data:` URI 返回 **`[image:png, 1735KB]`**（metadata，F-ILDF-01 防日志膨胀）。
3. 代理 `if (!/^https?:\/\//i.test(upstream)) return 404 "image not found"` —— metadata 串不是 http → **永远 404**。

即使没有 F-ILDF-01 的 strip，代理也只接受 http(s) 上游，data: URI 本就无法回源。**两层叠加 → base64 图经 MCP 100% 不可下载。**

## 4. 影响面（按入口）

| 入口 | base64 模型（gemini/gpt-image） | http 模型（seedream-3） |
|---|---|---|
| **MCP `generate_image`** | ❌ 返回死代理 URL，下载必 404（用户本例） | ✅ 代理可回源（1h 签名 / 24h 上游内有效） |
| **API `/v1/images/generations`** | ⚠️ 内联返回完整 base64（拿得到数据，但 1.7MB data: URI，部分客户端无法"下载成文件"） | ✅ 同上 |
| **控制台日志回看** | ❌ 仅 `[image:png, NKB]` 文本，不可看不可下（base64 已 strip） | ✅ `<img>` 预览（1h/24h 内） |

> 控制台无图片生成 playground UI；图片生成只走 API / MCP。

## 5. 修复方向（Planner 不直接改代码；用户已说"先别动，我去查现场"，**暂不起批次**）

**A. 最小止血（MCP data: URI 处理）**
- `generate-image.ts:265` 比照 `rewriteImageResponseUrls`：对 `data:` URI 不要包装代理，改为直接回传图片。MCP 原生支持 image 内容块 `{type:"image", data, mimeType}`，比回传 1.7MB 文本更合适。

**B. 根治（推荐，统一所有入口）**
- 生成时把图（base64 与 http 上游一并）**转存自有对象存储**（GCS 桶 / 自有火山 TOS / 阿里 OSS），`original_urls` 与对外 URL 都用持久 http URL。
- 一举解决：MCP 死链、base64 不可回看、1h 签名过期、24h 上游过期、API data: URI 过大。代价：新建存储基建 + 保留策略 + 生成链路 +一次上传。

## 6. 用户现场可验证（一步确认本根因）

经 MCP 用 `gpt-image-mini` 或 `gemini-3-pro-image` 生成一张图 → 拿到的 `images[0]` 会是 `https://aigc.guangai.ai/v1/images/proxy/<traceId>/0?exp=...&sig=...` → 直接 GET 该 URL → 预期 **404 `image not found`**（签名有效但回源是 metadata）。对照用 `seedream-3` 生成 → 同样代理 URL 但 GET 可得图（http 上游）。

---

> 后续：用户查完现场决定是否起 hotfix 批次。届时 Planner 写 spec（建议含 A 止血 + B 根治取舍），Generator 实现，Codex 验收（铁律 9）。
