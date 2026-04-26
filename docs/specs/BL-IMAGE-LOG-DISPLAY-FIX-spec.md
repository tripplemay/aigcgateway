# BL-IMAGE-LOG-DISPLAY-FIX Spec

**批次：** BL-IMAGE-LOG-DISPLAY-FIX（简化 X 方案）
**创建：** 2026-04-26
**工时：** 0.4 day
**优先级：** high
**前置：** BL-IMAGE-PRICING-OR-P2 已 done

## 1. 背景

用户 2026-04-26 报告生产 image log 前端显示不正常。Planner 诊断结论：

- **OR image 模型** 返回 `data:image/...` base64 (~1MB/张)，Gateway 直接落 `call_logs.responseContent` + `responseSummary.original_urls` 各一份 → 单 row ≈ 2MB
- **前端** `src/app/(console)/logs/[traceId]/page.tsx:250-254` 把 responseContent 作 `whitespace-pre-wrap` 纯文本渲染 → 浏览器 layout 卡顿、用户看到 base64 乱码
- volcengine seedream / qwen-image 等返回 https URL（含 image-proxy 签名 URL）不受影响

证据：
- `trc_aexjskz4s69fyopsh7etf2ez`（gemini-3-pro-image）responseContent_size=993,227
- `trc_yylqgk63due4kue4dqcipw0c`（gpt-image-mini）responseContent_size=1,463,110
- `trc_y3rusinj9idvpigj8yeboj31`（seedream-3）responseContent_size=447（正常）

## 2. 决策

| 项 | 决策 |
|---|---|
| 方案 | **简化 X**（用户 2026-04-26 拍板） |
| 后端 base64 落库 | strip，存 metadata 文本 `[image:{format}, {size}KB]` |
| 客户端 API 响应 | 不变（OR base64 仍透传给调用方）|
| 前端 log 详情 | 识别 http(s) image URL 渲染 `<img>`；其他纯文本 |
| 历史回填 | 做（扫近 30 天 call_logs.responseContent 含 `data:image/` 的行 strip）|
| 不接对象存储 | 保留未来升 C 方案的路径不阻塞 |

## 3. 目标

### 3.1 后端 base64 strip（F-ILDF-01）

**修改：** `src/lib/api/post-process.ts:processImageResultAsync`

**核心改动点：**

1. 第 402-413 行 `responseSummary.original_urls`：data: 前缀的 URL 替换为 metadata 字符串 `[image:jpeg, 993KB]`（mime-type + 大小）；http(s) URL 保留
2. 第 423 行 `responseContent`：同样转换；nullable 不变

**Helper 函数：**

```ts
function summarizeImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (!url.startsWith("data:")) return url;  // http(s) / proxy URL 透传
  // 解析 data:image/jpeg;base64,xxxx
  const match = url.match(/^data:([^;]+);base64,/);
  const mime = match?.[1] ?? "unknown";
  const format = mime.split("/")[1] ?? "unknown";
  const sizeKB = Math.round(url.length / 1024);
  return `[image:${format}, ${sizeKB}KB]`;
}
```

**单测 ≥ 4 条：**

1. http URL 透传不变
2. `data:image/jpeg;base64,...`（构造 100KB string）→ `[image:jpeg, 100KB]`（容差 ±1KB）
3. data: 前缀但格式异常（无 `;base64,`）→ 仍 strip 不抛错（fallback `[image:unknown, XKB]`）
4. processImageResultAsync 集成测试：mock OR /v1/chat/completions 响应（含 base64 data URL）→ 真实跑 processImageResultAsync → call_log.responseContent 是 metadata 字符串而非 1MB；call_log.responseSummary.original_urls[0] 也是 metadata（**最外层边界 mock，按 v0.9.4 铁律**）

**Non-Goals：** 不改 image-proxy.ts（line 58 注释 data: passthrough 给客户端的逻辑保留）；不动 OR 调用响应给客户端的内容。

### 3.2 前端 log 详情图片预览（F-ILDF-02）

**修改：** `src/app/(console)/logs/[traceId]/page.tsx`

**核心改动点：**

第 250-254 行 `{detail.responseContent ? ...}` 块改造：

```tsx
{detail.responseContent ? (
  <div className="bg-ds-surface-container-lowest p-8 rounded-2xl shadow-sm">
    {isImageUrl(detail.responseContent) ? (
      <img
        src={detail.responseContent}
        alt="response image"
        className="max-w-full max-h-[600px] rounded-lg"
        loading="lazy"
        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
      />
    ) : (
      <div className="text-sm leading-7 text-ds-on-surface/80 whitespace-pre-wrap">
        {detail.responseContent}
      </div>
    )}
    {detail.finishReason && ( /* 保持 */ )}
  </div>
) : ...}
```

**Helper：**

```ts
function isImageUrl(text: string): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  // http(s) image URL: ends with image extension OR contains /v1/images/proxy/ (gateway proxy)
  if (/^https?:\/\//i.test(trimmed)) {
    return /\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i.test(trimmed)
      || /\/v1\/images\/proxy\//i.test(trimmed);
  }
  return false;
}
```

**显式不识别的形式：**
- `[image:jpeg, 993KB]` metadata 字符串 → 走 else 分支（纯文本显示）
- `data:image/...` → 不识别（X 方案 Gateway 不再落库这个，前端见到也按文本处理）
- ipfs:// 等 → 不识别

**单测 ≥ 3 条：**

1. responseContent="https://example.com/foo.png" → 渲染 `<img>` 而非 `<div>`
2. responseContent="https://gateway.example.com/v1/images/proxy/trc_xxx/0?exp=..." → 渲染 `<img>`
3. responseContent="[image:jpeg, 100KB]" → 渲染 `<div>` 文本

**i18n：** alt 文案从 messages（en/zh-CN）取，保持双语；新增 key `responseImage`。

### 3.3 历史数据回填（F-ILDF-03）

**新建脚本：** `scripts/maintenance/strip-image-base64-2026-04-26.ts`

**逻辑：**

1. 扫 `call_logs WHERE createdAt > now-30d AND (LENGTH(responseContent) > 10000 OR responseContent LIKE 'data:image/%')`
2. 对每条：
   - `responseContent` 用 §3.1 `summarizeImageUrl` 转换
   - `responseSummary.original_urls` 同样
3. dry-run（默认）输出"X rows would update"；`--apply` 实际 UPDATE
4. 幂等：metadata 字符串再跑也是无变化
5. 退出前 close prisma + redis（按 v0.9.5 铁律）

**单测 ≥ 1 条：** dry-run 模拟 5 条 mixed call_log（3 条 base64 / 2 条 https）→ 输出 "3 rows would update / 2 unchanged"。

**生产执行：** Codex 在 reverifying 阶段执行 `--apply`。

### 3.4 Codex 验收（F-ILDF-04）

构建（4 项）：
1. `npm run build` 通过
2. `npx tsc --noEmit` 通过
3. `npx vitest run` 全过（新增 ≥ 8 条测试 + 历史不破坏，预期总数 398+）
4. 脚本本地 dry-run 输出符合预期

数据正确性（5 项）：
5. 生产触发一次 OR image 调用（`google/gemini-2.5-flash-image`）→ 查 call_logs：responseContent ≤ 200B 且形如 `[image:{fmt}, {n}KB]`；responseSummary.original_urls[0] 同样 metadata
6. 同时调一次 volcengine seedream-3 → responseContent 仍是 https URL（透传不变）
7. 客户端 API 响应（捕 curl）：OR 调用仍返回完整 base64 data URL（**透传保护，不能影响调用方**）
8. 生产执行 `npx tsx scripts/maintenance/strip-image-base64-2026-04-26.ts --apply` 退出 0；输出"X rows updated"
9. 重跑脚本输出 "0 rows would update"（幂等）

前端（2 项）：
10. 浏览器打开 `/logs/<seedream-3 traceId>` → 看到 image 预览（`<img>` 渲染 https URL）
11. 浏览器打开 `/logs/<OR traceId after strip>` → 看到 metadata 文本而非 base64 乱码；页面渲染秒开

报告：
12. 生成 signoff `docs/test-reports/BL-IMAGE-LOG-DISPLAY-FIX-signoff-2026-04-2X.md`

## 4. Non-Goals

- 不接对象存储（保留未来升 C 方案路径不阻塞）
- 不改 OR 调用方响应（客户端仍收到完整 base64 data URL）
- 不改 image-proxy.ts（line 58 data: passthrough 逻辑给客户端）
- 不超过近 30 天的历史回填（与 P2 call_logs TTL 30d 对齐）

## 5. 风险

| 风险 | 应对 |
|---|---|
| `summarizeImageUrl` mime-type 解析失败（非标准 data: 格式）| fallback `[image:unknown, XKB]`，不抛错 |
| 历史 backfill 误伤非 image 字段 | 严格 `LIKE 'data:image/%'` + base64 检测；dry-run 必跑 |
| 前端 `<img>` src 是恶意外链 | image-proxy 已经 HMAC 签名所有上游 URL（line 26），且只渲染 http(s) image extension 或 `/v1/images/proxy/`；非这两种走文本 |

## 6. 应用框架自检（v0.9.5）

- ✅ 铁律 1：post-process.ts:423 + logs/[traceId]/page.tsx:250 已 Read 源码 + file:line 引用
- ✅ 铁律 1.1：spec 描述行为（"data: 前缀转 metadata"）不锁死字符串格式（允许 `[image:fmt, NKB]` 或等价表达）
- ✅ 铁律 1.2：所有 acceptance 基于 DB / API / 浏览器渲染，不依赖运维
- ✅ 铁律 1.3：定量阈值（responseContent ≤ 200B / 大小 ±1KB 容差）已显式
- ✅ 铁律 1.4：本批次数据写入是同步路径（image API 调用），**不涉及周期任务**，无需 sync 回归保护
- ✅ 铁律 2：base64 检测格式 `^data:([^;]+);base64,` 已查 RFC 2397 标准
- ✅ 铁律 2.1：所有 API 协议层都是 HTTP / Next.js RSC，无跨协议冲突
- ✅ 测试 mock 层级（v0.9.4）：F-ILDF-01 集成测试要求最外层 mock（OR /v1/chat/completions HTTP 响应），让 processImageResultAsync 链路真实跑
- ✅ CLI 脚本退出（v0.9.5）：F-ILDF-03 strip 脚本必须 close prisma + redis
