# BL-VISION-INPUT — 网关支持图片输入（Vision / 多模态输入）

**类型：** 新功能（混合批次：generator 实现 + codex 验收）
**创建：** 2026-06-14
**背景：** 网关当前仅支持图片**输出**（`generate_image`）。图片**输入**（vision：messages 带图片 → 模型理解后输出文字）被两处 string-only 护栏显式拒绝。本批次放开 REST `/v1/chat/completions` 的图片输入，按 OpenAI 多模态格式（`content` 数组 + `image_url`）。

---

## 1. 目标

让 REST `/v1/chat/completions` 接受 OpenAI 标准多模态 message：

```jsonc
{ "role": "user", "content": [
  { "type": "text", "text": "这张图里有什么？" },
  { "type": "image_url", "image_url": { "url": "https://..." | "data:image/png;base64,...", "detail": "auto" } }
]}
```

模型理解图片后正常输出文字（含流式）。**本批次只做 REST 面**；MCP chat tool 保持 string-only（另起批次）。

## 2. 现状评估（已核验，地基大量存在）

**已就绪、无需改：**
- 内部类型已支持多模态：`src/lib/engine/types.ts:7-19`（`ChatMessage.content: string | ChatContentPart[]`，`ChatContentPart` 带 `image_url`）。
- 透传链路通：`openai-compat.ts:240 prepareRequest` 仅 `{...request}` 展开，数组 content 原样透传上游。
- **所有 11 家走 OpenAI 兼容端点**（adapter 仅 openai-compat / siliconflow / volcengine 三种）。**Anthropic 经 `api.anthropic.com/v1/` 的 OpenAI 兼容端点**接入，其兼容层自动把 `image_url` 翻译为原生格式 → **无需任何 per-provider 图片格式转换 adapter**。
- **计费自动覆盖**：`post-process.ts` 按上游返回的 `usage.prompt_tokens` 计费（line 143/194），图片 token 已由服务商算进 prompt_tokens → **无需自写图片 tile/尺寸计税**。
- 响应侧 `volcengine.ts:118` / `openai-compat.ts:422` 的 `content as string` 是解析模型**输出**（恒 string），**非破坏点**。

**真正的拦路点（本批次修）：**
1. REST 入口硬拒绝非字符串 content：`src/app/api/v1/chat/completions/route.ts:54-66`（注释 F-WP-05）。
2. `vision` capability 已存在但只用于 list 筛选（`models/route.ts:200`），请求层没用它门禁。
3. `mergeSystemMessages`（`config-overlay.ts:78-109`）在 `supportsSystemRole=false` 时把首条 user 消息的数组 content 强转 `""` → **销毁图片**（line 98-101）。
4. `promptSnapshot = body.messages`（`route.ts` 5 处：232/254/363/392/426）原样写 DB → base64 图片 → **call_logs 暴涨**。

## 3. 设计决策（D）

- **D1 格式：** 只接受 OpenAI 多模态格式（`content` 为 `ChatContentPart[]`，part 类型 `text` / `image_url`）。`content` 仍可为 string（向后兼容）。
- **D2 图片来源（用户裁决）：** 支持 **http(s) URL + base64 data URI 两种**。网关**不 fetch** URL（由上游拉取，SSRF 在上游侧）；仅做格式与协议白名单校验。
- **D3 能力门禁（用户裁决 = 严格）：** 请求含 image part 时，查 `route.alias?.capabilities?.vision`（优先，vision 由 alias-classifier 写在 alias）`?? route.model?.capabilities?.vision`；非 true → 干净 400 `model_not_vision_capable`。先例：route.ts:102 已用 `route.alias?.modality` 做门禁。
- **D4 安全限制（默认值，admin 可后续调）：**
  - 单请求 image part 数 ≤ **10**
  - 单张 base64 解码后 ≤ **5 MB**（http URL 不限大小，由上游约束）
  - `image_url.url` 协议白名单：`https://` / `http://` / `data:image/<type>;base64,`，其余 400
  - 这些常量集中定义（如 `src/lib/api/vision-limits.ts`），便于后续接 systemConfig 调参
- **D5 校验形式：** 用 zod 写多模态 schema（项目 Input Validation 约定），放在可复用位置（如 `src/lib/api/chat-content.ts`），REST 用、未来 MCP 可共用。校验失败返回与现有一致的 `errorResponse(400, "invalid_parameter", ...)`。
- **D6 日志卫生：** 抽 `sanitizeMessagesForLog(messages)` helper —— 把 `image_url.url` 的 base64 data URI 替换为占位符 `[image:base64 <bytes>B]`、http URL 替换为 `[image:url <host>]`（保留可诊断信息，不存原始字节）。`route.ts` 全部 `promptSnapshot = body.messages` 改为 `promptSnapshot = sanitizeMessagesForLog(body.messages)`。text part 原样保留。
- **D7 管道兼容：** `mergeSystemMessages` 改为：合并 system 文本到首条 user 消息时，若该 user 消息 content 是数组，则把 system 文本作为一个 `{type:"text"}` part **插到数组最前**（而非强转 string）；system 消息自身含数组时提取其 text part 拼接。保持 `supportsSystemRole=false` 的 provider 也能收到图片。
- **D8 不改的：** prepareRequest 透传、计费、各家格式转换、流式、响应解析。
- **D9 vision 标记前置：** 严格门禁要求各 vision alias 的 `capabilities.vision=true` 已配置。alias-classifier 在 model sync 时自动推断，生产 alias（gpt-4o/claude/gemini/qwen-vl/glm-4v 等）大概率已有；但需**盘点 + 幂等补漏**，否则门禁会误拒能用的模型。

## 4. Features

### F-VI-01 — 多模态 content 校验器 + 放开 string-only 护栏（executor: generator）
- 新增可复用 zod schema（如 `src/lib/api/chat-content.ts`）：校验 `content` 为 `string` 或 `ChatContentPart[]`；数组每个 part 为 `{type:"text",text:string}` 或 `{type:"image_url",image_url:{url:string,detail?}}`；空数组、非法 part、缺 text/url → 拒绝。
- 校验 `image_url.url`：协议白名单（D4）；base64 data URI 解码后大小 ≤ 5MB；单请求 image part ≤ 10（D4）。安全常量集中定义（`src/lib/api/vision-limits.ts`）。
- 改写 `route.ts:54-66`：用新 schema 替换 `typeof content !== "string"` 硬拒绝；保持 string content 向后兼容；保持空 content 拒绝；错误返回沿用 `errorResponse(400,"invalid_parameter",...)` + `param` 定位。
- **Acceptance：** (1) string content 请求行为不变（回归）；(2) 合法多模态数组通过校验；(3) 非法 part / 空数组 / 缺字段 / 非白名单协议 / 超 5MB base64 / 超 10 张 → 各自 400 且 message 可定位；(4) 新增校验器有单测覆盖各分支（generator 写实现，不写测试由 Codex 验，但实现须自洽可跑）；(5) `npx tsc --noEmit` + `npm run build` PASS；(6) 独立 commit。

### F-VI-02 — vision 能力门禁（executor: generator）
- 在 `route.ts` route 解析后、调用上游前：若请求任一 message content 含 `image_url` part，检查 `route.alias?.capabilities?.vision ?? route.model?.capabilities?.vision`；非 true → `errorResponse(400,"model_not_vision_capable", "model <x> does not support image input")`。
- 复用先例形态（route.ts:102 `route.alias?.modality` 门禁、135 读 capabilities）。capabilities 是 `Json?`，需安全类型守卫读取 `vision` 字段。
- **Acceptance：** (1) 向 vision 模型发图片 → 通过门禁进入调用；(2) 向非 vision 模型发图片 → 400 `model_not_vision_capable`；(3) 纯文字请求不受门禁影响（任何模型）；(4) capabilities 为 null / 缺 vision 字段时按"不支持"处理（安全默认）；(5) tsc + build PASS；(6) 独立 commit。

### F-VI-03 — 管道兼容修复（mergeSystemMessages 数组兼容 + 日志卫生）（executor: generator）
- **mergeSystemMessages（D7）**：改 `config-overlay.ts:78-109`，user 消息 content 为数组时把 system 文本作为首个 text part 插入，不强转 string；补单测覆盖（数组 + string 两路）。
- **日志卫生（D6）**：新增 `sanitizeMessagesForLog`（位置自定，如 `src/lib/api/post-process.ts` 或新文件）；`route.ts` 5 处 `promptSnapshot = body.messages` → `sanitizeMessagesForLog(body.messages)`。text part 原样、image_url 转占位符。
- **Acceptance：** (1) `supportsSystemRole=false` 且首条 user 为数组 content 时，system 文本被并入且图片 part 保留（不丢失）；(2) string content 路径行为不变（回归）；(3) call_logs `promptSnapshot` 中无 base64 原始字节，仅占位符 + 可诊断信息；(4) text 内容在日志中可读；(5) tsc + build PASS；(6) 独立 commit。

### F-VI-04 — vision 标记盘点 + 幂等 provisioning 脚本（executor: generator）
- 新增 `scripts/audit-vision-capabilities.ts`（dry-run 默认 / `--apply`）：盘点所有 enabled alias 的 `capabilities.vision` 现状；对已知 vision 模型清单（gpt-4o 系 / claude sonnet+opus / gemini / qwen-vl / glm-4v / step-1v / kimi-vl 等，按 brand+alias 名匹配）中 vision≠true 的，`--apply` 幂等补 `vision=true`（保留其余 capabilities 字段）。
- 脚本：dry-run 输出"当前 vision=true 清单 + 待补清单"；CLI 退出 close prisma + redis（铁律）；幂等（重复跑无副作用）；`--apply` 后清 Redis `models:list*` 缓存。
- **Acceptance：** (1) dry-run 输出生产 vision 标记现状盘点（哪些已 true、哪些待补）；(2) `--apply` 幂等补漏，重复跑无变化；(3) 不误改非 vision 模型；(4) close 连接 + 清缓存；(5) tsc + build PASS；(6) 新增 ops 说明（脚本用法 + 已知 vision 模型清单来源）；(7) 独立 commit。

### F-VI-05 — Codex 验收 + 签收报告（executor: codex）
- **前置：** F-VI-04 脚本已 `--apply` 到生产（或 Codex 在可控环境 apply），目标 vision 模型 `capabilities.vision=true`。
- **Acceptance（真实 E2E，生产为准）：**
  1. `scripts/test/codex-setup.sh` + wait PASS；
  2. **图片输入 E2E（URL）**：用 vision 模型（如 gpt-4o）POST `/v1/chat/completions`，message 含 `image_url`（http URL 指向一张公网图）→ 200，响应文字正确描述图片内容；
  3. **图片输入 E2E（base64）**：同上但用 `data:image/...;base64,` → 200，文字正确；
  4. **门禁**：向非 vision 模型发图片 → 400 `model_not_vision_capable`；
  5. **安全限制**：超 10 张 / 超 5MB base64 / 非白名单协议 → 各自 400；
  6. **计费**：CallLog 该 trace `promptTokens` 含图片 token（> 纯文字基线）、SUCCESS 扣费、失败不收费；
  7. **日志卫生**：日志详情页 / call_logs `promptSnapshot` 无 base64 原始字节（仅占位符），text 可读；
  8. **回归**：纯文字 chat（string content）行为不变、流式正常；
  9. `npx tsc --noEmit`（以 CI typecheck job 为准）/ `npm run build` / `npm run test` PASS；
  10. 输出 `docs/test-reports/BL-VISION-INPUT-signoff-YYYY-MM-DD.md` 含命令证据 + 结论 PASS/FAIL。

## 5. 影响 / 复用（grep 反向消费点，铁律 1.5）

- **改动点：** `route.ts`（校验 + 门禁 + 日志卫生 5 处 promptSnapshot）、`config-overlay.ts mergeSystemMessages`、新增 `chat-content.ts`(zod) + `vision-limits.ts`(常量) + `audit-vision-capabilities.ts`(脚本) + sanitize helper。
- **复用：** 已有 `ChatMessage`/`ChatContentPart` 类型（types.ts:7-19）、`errorResponse` 工具、capabilities 读取先例（route.ts:102/135）、provisioning 脚本范式（add-seedream-45.ts）。
- **无需改（已核验）：** prepareRequest 透传、calculateTokenCost 计费、各家 adapter 格式转换、流式、响应解析（volcengine:118 / openai-compat:422 是响应侧）。
- **数据变更：** F-VI-04 经脚本补 alias.capabilities.vision（生产 DB），幂等。

## 6. 风险与回滚

- **门禁误拒**（vision 标记缺失）→ D9 + F-VI-04 盘点补漏前置化；门禁对 capabilities=null 按"不支持"处理是安全默认，但依赖标记准确。
- **mergeSystemMessages 回归**：仅 `supportsSystemRole=false` 的 provider 受影响，须 string + array 双路单测保护。
- **日志卫生遗漏**任一 promptSnapshot 站点 → base64 入库；F-VI-03 acceptance 要求 5 处全改 + Codex 验 call_logs 无原始字节。
- **回滚：** 纯代码批次，revert 整批即回到 string-only。无 DB schema 变更（F-VI-04 仅改 capabilities Json 值，可脚本反向）。
- **上游差异**：个别服务商 OpenAI 兼容端点对 image_url 支持程度不一 → 门禁 + 已知 vision 清单限定到确认支持的模型；Codex E2E 实测确认。
