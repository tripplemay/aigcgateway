# BL-IMG-PERSIST-GCS — 图片生成转存 GCS 根治批次（hotfix）

**类型：** 生产 hotfix（铁律 9：Planner 分析根因 + 方案 → 用户确认 → Generator 实现 → Codex 验收）
**创建：** 2026-06-01
**根因报告：** `docs/audits/image-download-failure-diagnosis-2026-06-01.md`
**用户裁决：** 根治方案 / 存储后端 = **GCS 桶** / 保留 = **90 天 TTL**

---

## 1. 背景与根因（已确认）

base64 类图片模型（gemini-3-pro-image / gpt-image / gpt-image-mini）生成的图无法下载。两条独立缺陷叠加：

1. **MCP `generate-image.ts:265-267`** 把 `data:` URI 也包装成签名代理 URL（缺 `!url.startsWith("data:")` 判断），而代理只能回源 http(s) 上游 → 永远 404。
2. **`b64_json` 字段被全链路忽略**：`rewriteImageResponseUrls` / MCP / `summarizeImageUrl` / `original_urls` 都只读 `d.url`，无视 `d.b64_json`（types.ts:188-189 证实 data 项可只带 b64_json）。`b64_json`-only 的 provider 经 MCP → `images: []`（空）。
3. **衍生**：base64 落库被 F-ILDF-01 strip 成 `[image:png, NKB]`，日志不可回看；http 上游预签名 URL 1h 签名 / 24h 上游双重过期。

**根治思路：** 生成时把图（三种形态统一）转存自有 GCS 桶，对外统一返回**同源签名代理 URL（回源改读 GCS，TTL 提到 90 天）**。一举消除：MCP 死链、b64_json 空数组、日志不可回看、1h/24h 过期、落库膨胀。

## 2. 设计决策（D）

- **D1 后端：** GCS（`@google-cloud/storage`）。认证用 **ADC**（生产 GCP VM 默认服务账号，免密钥文件）。桶 region 与 VM 同区（asia-northeast1，降延迟/egress）。
- **D2 对象 key：** `images/{projectId}/{traceId}/{idx}.{ext}`，`ext` 由 content-type 推断（png/jpeg/webp…）。确定性、幂等（同 trace 重跑覆盖同 key）。
- **D3 访问模型：** **私有桶 + 复用同源签名代理** `/v1/images/proxy/{traceId}/{idx}`（回源由"fetch 上游"改为"读 GCS 对象"）。不用公开桶（隐私 + 保留 F-ACF-07 隐藏上游 host + content-type sanitize）。GCS V4 signed URL 上限 7d 无法覆盖 90d，故用自有 HMAC 代理。
- **D4 时序：** 转存在**请求路径内同步 await**（返回响应前完成上传 + 写好 `original_urls`），保证返回的代理 URL **立即可解析**——同时消除现有 fire-and-forget 落库竞态。计费/完整日志可继续异步。
- **D5 三形态归一：** 持久化 helper 必须处理：`url`=http(s)（服务端 fetch）/ `url`=`data:`（解码）/ `b64_json`（解码）。三者都转 Buffer + contentType 上传。
- **D6 失败兜底：** 单图上传失败 → 该图回退原行为（http 走旧代理/上游、base64 内联）+ `console.warn`，**生成绝不因存储故障硬失败**。
- **D7 API 兼容：** 不破坏现有字段——`b64_json` 原样透传（若 provider/请求带），**额外**把 `data[i].url` 一律置为可用代理 URL（含 base64 图）。无消费方被破坏；MCP 仍只回代理 URL（不回 base64 文本，控 payload）。
- **D8 不回填：** 历史已 strip/已过期的图无法恢复，**不做回填**，显式 `log` 说明（不静默截断）。
- **D9 保留：** 90 天，由桶 lifecycle 规则（ops）实现；代码侧代理签名 `DEFAULT_TTL_SECONDS` 提到 90d 对齐。
- **D10 Feature flag：** `IMAGE_PERSIST_ENABLED`（默认 true）。关闭时回退当前行为，便于灰度/故障快速回滚。

## 3. 前置条件（ops / 用户执行，Generator 不得代为 provision 生产基建）

Generator 须在交付时给出**确切 gcloud 命令清单**，由用户在生产执行：
1. 建桶：`gsutil mb -l asia-northeast1 gs://<bucket>`（建议 `aigc-gateway-images`）。
2. 授权 VM 默认 SA：`gsutil iam ch serviceAccount:<vm-sa>@<proj>.iam.gserviceaccount.com:roles/storage.objectAdmin gs://<bucket>`。
3. 90d lifecycle：`gsutil lifecycle set lifecycle-90d.json gs://<bucket>`（Generator 附 json）。
4. 生产 `.env` 增 `GCS_IMAGE_BUCKET=<bucket>` + `IMAGE_PERSIST_ENABLED=true`。

> 本地开发可用 dev 桶或 `IMAGE_PERSIST_ENABLED=false` 跳过。Generator 须标注此前置为遗留交接项（铁律：manual 任务归属，不甩 Codex）。

## 4. Features

### F-IGP-01 — GCS 存储抽象层 + 配置（executor: generator）
- 新增依赖 `@google-cloud/storage`。
- `src/lib/storage/image-store.ts`（接口）+ `src/lib/storage/gcs-image-store.ts`（GCS 实现）：
  - `putImage({ key, body, contentType }): Promise<void>`
  - `getImageObject(key): Promise<{ body: Readable | ArrayBuffer; contentType: string } | null>`
- 配置：`GCS_IMAGE_BUCKET`（启用时必填）、`IMAGE_PERSIST_ENABLED`（默认 true）；ADC 认证。
- 校验：启用但缺 bucket → 启动期/首次调用清晰报错 + 走 D6 兜底，不 crash。
- `.env.example` 增两项 + 注释。
- **Acceptance：** (1) 接口 + GCS 实现存在，put/get round-trip 可用（dev 桶或 mock）；(2) 缺 bucket 时按 D6 兜底不 crash；(3) `npx tsc --noEmit` PASS；(4) `npm run build` PASS；(5) `.env.example` 更新；(6) 独立 commit `feat(BL-IMG-PERSIST-GCS F-IGP-01)`。

### F-IGP-02 — 持久化 helper（三形态归一）+ 同步接入两入口（executor: generator）
- `src/lib/api/persist-image.ts`：`persistGeneratedImages(traceId, projectId, response): Promise<Array<{ key: string; contentType: string } | null>>`，按 D5 处理 url-http / url-data: / b64_json 三形态 → 上传 GCS（D2 key）→ 返回 keys（失败项 null，D6）。
- 同步 await 接入 `src/app/api/v1/images/generations/route.ts` 与 `src/lib/mcp/tools/generate-image.ts`，在构造对外响应**之前**完成。
- `original_urls` 改存 GCS keys，并保证在对外代理 URL 可被使用前**已可解析**（D4，消除竞态——Generator 选最小改法：同步建 CallLog 后异步补计费，或同步写最小映射）。
- **Acceptance：** (1) 三形态（构造 fixture：http url / `data:` url / 仅 `b64_json`）均成功上传且返回 key；(2) `original_urls` = GCS keys（非上游 URL、非 metadata）；(3) 竞态闭合：响应返回后立即 GET 代理 URL 可解析（不依赖异步落库完成）；(4) 上传失败按 D6 兜底，生成不硬失败；(5) tsc + build PASS；(6) 独立 commit `feat(BL-IMG-PERSIST-GCS F-IGP-02)`。

### F-IGP-03 — 代理回源改 GCS + 90d TTL + MCP/API 统一返回可用代理 URL（executor: generator）
- `src/app/api/v1/images/proxy/[traceId]/[idx]/route.ts`：`original_urls[idx]` 作为 GCS key → `getImageObject` 流式回传；去掉 fetch 上游分支；保留 `sanitizeImageContentType` + `X-Content-Type-Options:nosniff`；对象缺失 → 404。
- `src/lib/api/image-proxy.ts`：`DEFAULT_TTL_SECONDS` → 90d。
- **MCP** `generate-image.ts`：对**每张已持久化图**（含 data:/b64_json）构造代理 URL（修复 data: 死链 + b64_json 空数组）。
- **API** `generations/route.ts`：所有图 `data[i].url` 置为可用代理 URL；`b64_json` 字段按 D7 原样透传不删。`rewriteImageResponseUrls` 相应调整或退役。
- **Acceptance：** (1) 经 MCP 用 `gpt-image-mini`/`gemini-3-pro-image` 生成 → 返回代理 URL，GET **200 返回图**（修复前必 404）；(2) ~~`seedream-3`（http 上游）同样 200~~ **[已放宽 @2026-06-04，用户裁决]**：seedream-3 本就在火山引擎下线名单（channel `realModelId` 仍是模型名而非 `ep-ID`，调用恒 404），用户裁决**下线该 alias**（已 `enabled=false, deprecated=true`，从 `/v1/models` 移除），故不再要求其 200。http 上游→GCS 持久化路径由 `persist-image.test.ts` 单测覆盖（当前在售 image 模型 gpt-image-mini / gemini-3-pro-image / gpt-image 均为 base64 形态，生产无在售 http-url image 模型可做 E2E 对照）；(3) 构造 b64_json-only fixture → MCP `images[]` 非空；(4) API 响应不含被强塞的超大 inline `data:`（但 `b64_json` 字段若本就存在则保留）；(5) 代理签名 TTL=90d 生效；(6) tsc + build PASS；(7) 独立 commit `feat(BL-IMG-PERSIST-GCS F-IGP-03)`。

### F-IGP-04 — 日志可回看 + 下载（executor: generator）
- `src/app/(console)/logs/[traceId]/page.tsx`：当 CallLog 含持久化图资产（`responseSummary.original_urls` 非空）时，对每张图用服务端新签的 `buildProxyUrl(traceId, idx, origin)` 渲染 `<img>`；不再对这些图显示 `[image:fmt,NKB]`。非图文本保留原 `whitespace-pre-wrap` 分支。
- `responseContent` / `summarizeImageUrl` 用法调整：为持久化图存可再生的图标识，使日志页能渲染（`isImageUrl` 已识别 `/v1/images/proxy/`，复用）。
- 多图（n>1）全部渲染。
- **Acceptance：** (1) 持久化生成后，日志详情页显示**图**而非 `[image:png,NKB]`；(2) 图可右键另存 / 直接打开（同源代理 URL 90d 内有效）；(3) n>1 多图全渲染；(4) 中英 i18n 文案正常；(5) tsc + build PASS；(6) 独立 commit `feat(BL-IMG-PERSIST-GCS F-IGP-04)`。

### F-IGP-05 — Codex 验收 + 签收报告（executor: codex）
- **Acceptance：** (1) `scripts/test/codex-setup.sh` + wait PASS；(2) **复现修复**：MCP base64 模型生成图 → 代理 URL GET 200（对照修复前 404）；b64_json-only fixture → 非空；(3) 回归既有图片测试（`image-proxy.test.ts` / `summarize-image-url.test.ts` / `process-image-base64-strip.test.ts` / `is-image-url.test.ts`）——因 original_urls 语义由"上游 URL/metadata"改为"GCS key"、data: 不再内联，相关用例需同步更新，Codex 负责测试域；(4) 存储层 put/get（mock 或 dev 桶）；(5) D6 兜底路径（存储故障不硬失败）有验证；(6) 日志页可回看图（视觉/DOM）；(7) `npx tsc --noEmit` / `npm run build` / `npm run test` PASS；(8) 前置 ops 清单（gcloud 命令 + lifecycle json）齐备可执行；(9) 输出 `docs/test-reports/BL-IMG-PERSIST-GCS-signoff-YYYY-MM-DD.md` 含命令证据 + 结论 PASS/FAIL。

## 5. 影响文件清单（grep 反向消费点已核，铁律 1.5）

- 改：`src/lib/mcp/tools/generate-image.ts`、`src/app/api/v1/images/generations/route.ts`、`src/app/api/v1/images/proxy/[traceId]/[idx]/route.ts`、`src/lib/api/image-proxy.ts`、`src/lib/api/post-process.ts`、`src/app/(console)/logs/[traceId]/page.tsx`
- 新增：`src/lib/storage/*`、`src/lib/api/persist-image.ts`、`lifecycle-90d.json`、`.env.example` 增项
- 测试（Codex 域，本批不由 Generator 写）：`src/lib/api/__tests__/image-proxy.test.ts`、`summarize-image-url.test.ts`、`process-image-base64-strip.test.ts`、`is-image-url.test.ts` 需随语义更新

## 6. 风险与回滚

- `IMAGE_PERSIST_ENABLED=false` 一键回退当前行为（D10）。
- 存储故障不阻断生成（D6）。
- API base64 响应仅"新增可用 url"，不删 `b64_json`（D7），无消费方破坏。
- 历史图不可回填（D8），仅前向生效——需告知用户。
