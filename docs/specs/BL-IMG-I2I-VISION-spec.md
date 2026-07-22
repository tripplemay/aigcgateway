# BL-IMG-I2I-VISION — 图生图 + MCP 图片输入（vision）

**类型：** 新功能（混合批次：generator 实现 + codex 验收）
**创建：** 2026-07-22
**背景：** 用户需求「网关支持图片输入，提供图生图和图片解析能力」。勘察结论：图片解析（vision）REST 面已在 BL-VISION-INPUT 落地，MCP 面仍 string-only（backlog BL-MCP-VISION-INPUT，本批次并入消化）；**图生图完全空白**——无 `/v1/images/edits` 路由、`ImageGenerationRequest` 无源图字段、三个 adapter 均无源图上送。Seedream 4.5 接入时（BL-IMG-SEEDREAM45 D7）已明确「支持图生图/多图融合，列为后续增强」，本批次收割。

---

## 1. 目标

1. **MCP chat 图片输入**：MCP `chat` tool 接受 OpenAI 多模态 content（text + image_url），与 REST 行为对齐。
2. **图生图（i2i）**：`/v1/images/generations` 增加可选 `image` 参数（源图 URL / base64，单图或数组）；新增 `/v1/images/edits` OpenAI 兼容壳（multipart）；MCP `generate_image` 同步增加 `image` 参数。
3. **首发模型**：`seedream-4-5`（volcengine，官方原生 i2i）+ OpenRouter 图模（`gpt-5-image` / `gemini-3-pro-image`，经 imageViaChat 带图）。上游契约**前置实测**，探测不通的模型收缩出本批次（不硬上）。

## 2. 现状评估（已勘察核验，2026-07-22）

**已就绪、直接复用：**
- 多模态校验器 `src/lib/api/chat-content.ts`（validateMessagesContent / messagesContainImage / sanitizeMessagesForLog），文件头注释明示「未来 MCP 可共用」。
- 安全限制 `src/lib/api/vision-limits.ts`：≤10 张 / base64 解码 ≤5MB / 协议白名单 https/http/data:image。
- 生成结果管道零改动：GCS 持久化（persist-image.ts 三形态归一）+ HMAC 签名同源代理（90d）+ perCall/token 双模计费 + 零图 FILTERED 不扣费。
- capability 门禁先例：completions/route.ts:115-130（vision 门禁 + 限流回滚）。
- 内部类型 `ChatMessage.content: string | ChatContentPart[]`（engine/types.ts:7-19）已多模态。

**拦路点（本批次修）：**
1. MCP chat `messageSchema.content` 仍 `z.string().min(1)`（`src/lib/mcp/tools/chat.ts:23`），:242-255 还有 string 假设的二次 trim 校验。
2. `ImageGenerationRequest`（engine/types.ts:51-58）无 `image` 字段；openai-compat / volcengine / siliconflow 三个 adapter 请求体均无源图上送。
3. 无 `/v1/images/edits` 路由；网关无任何 multipart 入口。
4. MCP `generate_image` 参数仅 model/prompt/size/n。
5. `alias-classifier.ts reinferAllCapabilities`（:648-675）存在 `image_input → vision` 一次性迁移（剥离 image_input 键），且 Step 2 用 LLM 推断**全量覆盖** capabilities——新 capability 命名与存活性必须避开。

## 3. 设计决策（D）

- **D1 源图形态**：http(s) URL + base64 data URI，网关**不 fetch 不落盘**（沿用 BL-VISION-INPUT D2，SSRF 留上游侧）。`image` 参数接受 `string | string[]`（多图融合场景，Seedream 4.5 支持）。张数/大小/协议复用 `vision-limits`（源图与 chat 图片同限：≤10 张、base64 解码 ≤5MB）。
- **D2 能力门禁（命名关键）**：新 capability **`image_to_image`**（不用 `image_input`——reinferAllCapabilities 会把该键剥离并入 vision；也与「文本模型看图」的 vision 语义区分）。请求带 `image` 但 `route.alias?.capabilities?.image_to_image ?? route.model?.capabilities?.image_to_image` 非 true → 400 `model_not_i2i_capable`。capabilities=null 按「不支持」处理（安全默认）。
- **D3 REST 主形态 = generations 扩展**：`POST /v1/images/generations` body 增可选 `image`。与 Seedream 4.x 官方形态一致，JSON 管道零结构改动。
- **D4 edits 兼容壳**：`POST /v1/images/edits` 接受 multipart/form-data（OpenAI SDK `images.edit()` 形态：`image` 文件（可多个）+ `prompt` + `model` + `n`/`size`）。文件在内存转 base64 data URI（不落盘），归一化为内部 `ImageGenerationRequest` 后走与 generations 完全相同的管道（路由/门禁/计费/持久化/日志）。`mask` 参数本批次**不支持**（首发模型均无 mask 语义），带 mask → 400 显式拒绝。multipart 总大小上限对齐 5MB/张 × 张数 + 余量；超限干净 413/400。
- **D5 adapter 源图上送（前置实测铁律）**：动手前必须用真实 key 探测上游契约（seedream-3 ep-ID 翻车教训，L1：外部模型可用性前置验证）：
  - **volcengine（seedream-4-5）**：探测两条路径——chat 接口 messages content 数组带 image_url；`/images/generations` body 带 `image` 字段。以实测通的路径为准改 `volcengine.ts`（imageViaChat 的 content 从纯 prompt 改为带图数组 / imageFallback body 增 image）。
  - **OpenRouter（gpt-5-image / gemini-3-pro-image）**：探测 chat 接口 content 数组带 image_url（该管道 quirk `image_via_chat_modalities` 已存在）。实测通 → 改 base `imageViaChat`（openai-compat.ts）把 `request.image` 展开为 image_url parts。
  - 任一模型探测不通 → 该模型移出本批次（capability 不标 true），**不硬上**；探测记录写入 ops 文档。
- **D6 日志卫生**：images 两路由 + MCP generate_image 的 promptSnapshot 对 `image` 参数做占位符化（复用 sanitize 思路：base64 → `[image:base64 NB]`、URL → `[image:url host]`），防 call_logs 暴涨。responseSummary 增 `source_images_count`。
- **D7 MCP 面约束**：MCP chat 与 generate_image 的图片输入沿用 5MB/10 张上限，但 tool description 明确引导「优先 URL，base64 偏重」。校验失败返回 MCP 错误信封（isError:true + code），与现有 MCP 错误形态一致。
- **D8 capability 存活性**：provisioning 脚本幂等可重跑；Generator 须核验常规 model-sync 对 capabilities 的写入是 merge 还是覆盖——若覆盖，须把 `image_to_image` 并入 sync 保留集（或 classifier 推断键清单），防止下次 sync 抹掉。`reinferAllCapabilities` 为一次性函数，不改它，但 ops 文档标注「重跑该函数后需重跑本批次 provisioning 脚本」。
- **D9 计费**：沿用现状 perCall（n>1 与多源图不加价，与现有行为一致）；OpenRouter token 计价路径 usage 自动覆盖（图输入 token 由上游算进 prompt_tokens）。不自建 i2i 差异化价目。
- **D10 不改的**：GCS 持久化、签名代理、failover、健康检查（探针仍纯文生图，不带源图）、size 预校验、Action/Template 体系（IMAGE Action 无执行路径是既有事实，不在本批次范围）。

## 4. Features

### F-IIV-01 — MCP chat 多模态 content（vision）（executor: generator）
- `src/lib/mcp/tools/chat.ts`：`messageSchema.content` 从 `z.string().min(1)` 放开为 `z.union([z.string().min(1), z.array(z.record(z.unknown())).min(1)])`（形态校验交给 chat-content.ts，避免双处维护）；进入处理前调 `validateMessagesContent`；:242-255 的 string 假设 trim 校验改为 string 路径才执行。
- vision 门禁：任一 message 含 image part（`messagesContainImage`）时检查 `capabilities.vision`（同 REST 语义），非 true → MCP 错误 `model_not_vision_capable`。
- 日志卫生：MCP chat 的 promptSnapshot 走 `sanitizeMessagesForLog`（核验现状，缺则补）。
- tool schema description 更新：说明 content 可为多模态数组 + URL 优先引导（D7）。
- **Acceptance：** (1) string content 行为不变（回归）；(2) 合法多模态数组经 MCP chat 调 vision 模型 → 正常回答图片内容；(3) 非 vision 模型带图 → `model_not_vision_capable`；(4) 超限/非法 part → 干净 MCP 错误（code + 定位信息）；(5) call_logs 无 base64 原始字节；(6) `npx tsc --noEmit` + `npm run build` PASS；(7) 独立 commit `feat(BL-IMG-I2I-VISION F-IIV-01)`。

### F-IIV-02 — 引擎类型扩展 + REST generations `image` 参数（executor: generator）
- `engine/types.ts`：`ImageGenerationRequest` 增 `image?: string | string[]`。
- `/v1/images/generations/route.ts`：body 增可选 `image`；新增校验 helper（建议 `src/lib/api/image-input.ts`，供 REST 两路由 + MCP 共用）：归一化 string→[string]、逐条协议白名单/大小校验（复用 vision-limits 常量）、总张数 ≤10。
- i2i 门禁（D2）：带 `image` 且 capability 非 true → 400 `model_not_i2i_capable`（含限流计数回滚，对齐 vision 门禁先例）。
- 日志卫生（D6）：promptSnapshot 的 image 占位符化 + responseSummary.source_images_count。
- **Acceptance：** (1) 纯文生图行为不变（回归）；(2) 带合法 image 参数且模型标 image_to_image → 通过门禁进入 adapter；(3) 非 i2i 模型带 image → 400 `model_not_i2i_capable`；(4) 非法协议/超大/超张数 → 各自 400 可定位；(5) call_logs 无源图 base64；(6) tsc + build PASS；(7) 独立 commit。

### F-IIV-03 — `/v1/images/edits` OpenAI 兼容壳（executor: generator）
- 新增 `src/app/api/v1/images/edits/route.ts`：解析 multipart/form-data（`image`（1..n 个文件）/ `prompt` / `model` / `n` / `size` / `response_format`）；文件 Buffer → base64 data URI（内存，不落盘），归一化为 `ImageGenerationRequest{prompt, image[]}` 后**复用 generations 的完整管道**（提炼共享 handler 或内部调用，不复制粘贴管道逻辑）。
- `mask` 出现 → 400 `mask_not_supported`；非 multipart Content-Type → 400 显式提示；总大小超限 → 干净 413/400（D4）。
- 响应与 generations 同构（data[].url 签名代理），错误信封一致。
- **Acceptance：** (1) OpenAI SDK `images.edit()`（或等价 curl -F）打通 → 200 + 可解析代理 URL；(2) 多文件（2 张）通过并上送多源图；(3) mask/非法类型/超大 → 各自干净 4xx；(4) 计费/审计与 generations 行为一致（CallLog 完整）；(5) tsc + build PASS；(6) 独立 commit。

### F-IIV-04 — Volcengine adapter 源图上送（seedream-4-5）（executor: generator）
- **前置（D5）**：真实 key 探测 chat 带图 / images 端点带 `image` 两路径，探测记录（请求形态 + 响应摘要）写入 `docs/specs/BL-IMG-I2I-VISION-ops.md`。
- 按实测结果改 `src/lib/engine/adapters/volcengine.ts`：`request.image` 存在时——imageViaChat 的 messages content 改为 `[{type:"text",text:prompt}, {type:"image_url",...}...]` 数组，和/或 imageFallback body 增 `image` 字段；多尺寸重试与 failover 语义保持。
- 响应提取链兼容核验（extractImageFromChatResponse 对 i2i 响应形态）。
- **Acceptance：** (1) 探测记录在 ops 文档（两路径结论明确）；(2) seedream-4-5 带源图（URL + base64 各一）真实生成 → 返回可解析代理 URL 且结果图与源图相关；(3) 纯文生图回归不变；(4) 探测不通 → 按 D5 收缩并在 ops 文档记录，capability 不标 true；(5) tsc + build PASS；(6) 独立 commit。

### F-IIV-05 — OpenRouter imageViaChat 源图上送（executor: generator）
- **前置（D5）**：真实 key 探测 gpt-5-image / gemini-3-pro-image 的 chat content 数组带 image_url，记录入 ops 文档。
- 改 `openai-compat.ts imageViaChat`：`request.image` 展开为 image_url parts 附在 user message content；`message.images[]` / parts / data URI 提取链不动（响应侧已覆盖）。
- **Acceptance：** (1) 探测记录在 ops 文档；(2) 两模型各带源图真实生成 → 可解析代理 URL；(3) 纯文生图（image_via_chat_modalities 路径）回归不变；(4) 探测不通的模型收缩出批次（capability 不标）；(5) tsc + build PASS；(6) 独立 commit。

### F-IIV-06 — MCP `generate_image` 增 `image` 参数（executor: generator）
- `src/lib/mcp/tools/generate-image.ts`：zod 增 `image: z.union([z.string(), z.array(z.string()).max(10)]).optional()`；复用 F-IIV-02 的校验 helper + i2i 门禁；错误回 MCP 信封。
- tool description 更新：i2i 用法 + 「先 list_models 确认 image_to_image capability」+ URL 优先引导（D7）。
- **Acceptance：** (1) MCP 带源图调 seedream-4-5 → 返回代理 URL；(2) 非 i2i 模型带图 → MCP 错误 `model_not_i2i_capable`；(3) 超限 → 干净 MCP 错误；(4) 纯文生图 MCP 回归不变；(5) tsc + build PASS；(6) 独立 commit。

### F-IIV-07 — capability provisioning + 文档（executor: generator）
- 新增 `scripts/provision-i2i-capabilities.ts`（dry-run 默认 / `--apply`）：为实测通过的模型（目标 seedream-4-5 / gpt-5-image / gemini-3-pro-image）幂等补 `capabilities.image_to_image=true`（保留其余键）；`--apply` 后清 `models:list*` 缓存；CLI 退出 close prisma + redis（铁律）。
- D8 存活性核验：确认 model-sync 写 capabilities 的 merge 语义，必要时把 `image_to_image` 并入保留集/推断键清单（改动点入本 feature）。
- `/docs` 控制台页：补 vision 多模态 curl 示例（REST 已上线但文档缺失）+ 图生图 generations/edits 示例 + MCP 用法段落。i18n 中英双语（既有惯例）。
- `docs/specs/BL-IMG-I2I-VISION-ops.md`：探测记录汇总 + 脚本用法 + 回滚（capability 置 false）。
- **Acceptance：** (1) 脚本 dry-run 输出现状盘点 + 待补清单，`--apply` 幂等（重跑无变化）；(2) 不误标探测未通过的模型；(3) sync 语义核验结论落 ops 文档（如有代码改动一并提交）；(4) docs 页双语示例可见且与实际 API 一致；(5) tsc + build PASS；(6) 独立 commit。

### F-IIV-08 — Codex 验收 + 签收报告（executor: codex）
- **前置：** F-IIV-07 脚本已 `--apply`（生产或可控环境）；探测通过模型清单以 ops 文档为准。
- **Acceptance（真实 E2E，生产为准）：**
  1. `scripts/test/codex-setup.sh` + wait PASS；
  2. **i2i E2E**：对每个探测通过的模型，REST generations 带 `image`（URL 源图 + base64 源图各一）→ 200，代理 URL GET 200 image/*，GCS 已持久化；
  3. **edits E2E**：curl -F（multipart）经 `/v1/images/edits` → 200 同构响应；mask → 400；
  4. **MCP E2E**：generate_image 带源图 → 代理 URL 可解析；MCP chat 带 image_url 调 vision 模型 → 正确描述图片；
  5. **门禁**：非 i2i 模型带 image → 400/MCP `model_not_i2i_capable`；非 vision 模型 MCP 带图 → `model_not_vision_capable`；
  6. **安全限制**：超 10 张 / 超 5MB base64 / 非白名单协议 / multipart 超限 → 各自干净 4xx；
  7. **计费**：i2i SUCCESS 按 perCall 扣费（OR token 计价路径 usage 覆盖源图 token）、失败/零图不扣费；
  8. **日志卫生**：call_logs promptSnapshot 无源图 base64 原始字节（仅占位符）、responseSummary 含 source_images_count；
  9. **回归**：纯文生图（REST + MCP）、纯文字 chat（string content）、REST vision 输图行为均不变；
  10. `npx tsc --noEmit` / `npm run build` / `npm run test` PASS（CI 为准）；
  11. 输出 `docs/test-reports/BL-IMG-I2I-VISION-signoff-YYYY-MM-DD.md` 含命令证据 + 结论 PASS/FAIL。

## 5. 影响 / 复用（grep 反向消费点，铁律 1.5）

- **改动点：** `mcp/tools/chat.ts`、`mcp/tools/generate-image.ts`、`engine/types.ts`（ImageGenerationRequest）、`engine/openai-compat.ts`（imageViaChat）、`engine/adapters/volcengine.ts`、`app/api/v1/images/generations/route.ts`、新增 `app/api/v1/images/edits/route.ts` + `lib/api/image-input.ts` + `scripts/provision-i2i-capabilities.ts`、`(console)/docs/page.tsx`。
- **复用：** chat-content.ts / vision-limits.ts / persist-image.ts / image-proxy.ts / post-process.ts 计费 / vision 门禁先例 / add-seedream-45.ts 脚本范式。
- **数据变更：** 仅 alias/model `capabilities.image_to_image`（脚本幂等，可反向置 false），无 schema migration。
- **前端纪律：** docs 页触及区域按「shadcn 渗透」工程纪律顺手替换（若触及 raw 元素）。

## 6. 风险与回滚

- **HIGH — 上游契约未实测**：D5 前置探测硬门禁；探测不通即收缩模型范围，批次不因单模型阻塞。
- **MEDIUM — capability 被 sync 抹掉**：D8 存活性核验入 F-IIV-07 acceptance。
- **MEDIUM — MCP base64 args 偏重**：沿用 5MB 上限 + URL 优先引导；如实测 MCP 传输层受限，收紧为 MCP 面仅 URL（决策记录入 ops）。
- **LOW — multipart 首入口**：Next.js App Router `request.formData()` 原生支持，注意 body 大小限制配置与内存占用（≤10 张 × 5MB 上限内）。
- **回滚：** 纯代码 revert + capability 置 false 脚本反向，无 DB migration。
