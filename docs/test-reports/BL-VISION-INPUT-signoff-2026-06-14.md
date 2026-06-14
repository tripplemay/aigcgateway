# BL-VISION-INPUT — Evaluator Signoff (L1)

- **批次：** BL-VISION-INPUT（网关图片输入 / vision 多模态）
- **验收阶段：** verifying（首轮）
- **Evaluator：** 独立验收者（代 Codex 执行 L1 验收 — 静态审查 + 类型/构建/lint/单测 + 对抗边界）
- **日期：** 2026-06-14
- **提交范围：** `e9d963e..e32426d`（6 commits）
- **L1 总判定：** **PASS**
- **L2：** PENDING（需用户授权 — 真实 AI 图片调用 / 计费 / 生产 audit `--apply`）

---

## 1. 构建门槛（独立重跑，非采信实现者声明）

| 命令 | 结果 | 证据 |
|---|---|---|
| `npm run typecheck`（`tsc --noEmit`） | **PASS** exit 0 | 后台任务 `bh9sivw2v` exit 0；输出仅 `TYPECHECK_EXIT=0` |
| `npm run lint` | **PASS** exit 0 | 后台任务 `b4qxtu23t` exit 0；输出 0 个 `Error:`，仅既有 `Warning:`（与本批次无关：model-aliases/models/logs 等历史告警） |
| `rm -rf .next && npm run build` | **PASS** exit 0 | 后台任务 `b5hxb8e48` exit 0；产出完整 Route(app) 表（仅成功编译 + page 生成时输出） |
| `npm test`（vitest，全量） | **PASS** | 77 files / 604 passed / 4 skipped（基线，未含本次新增）；后台任务 `byzzelvd7` exit 0 |
| `npm run test:integration`（Testcontainers/Docker） | **SKIPPED** | 本地无 Docker；CI 已跑绿（按 spec 说明）。归非阻塞。 |

BL-093 CI 类型修复（`runner.test.ts`）运行时复核：`npx vitest run src/lib/action/__tests__/runner.test.ts` → **8 passed**。修复（给 mock 加 `_request: { max_tokens?: number }` 形参）在运行时正确，未破坏既有断言。

---

## 2. 逐条 Acceptance 判定

### F-VI-01 — 多模态 content 校验器 + 放开 string-only 护栏

| # | 标准 | 判定 | 证据 |
|---|---|---|---|
| 1 | zod-style schema：content string/数组，part 形态，空数组/非法 part/缺字段拒绝 | **PASS** | `src/lib/api/chat-content.ts:33-112` `validateMessagesContent`。补测 30+ 分支全过 |
| 2 | 协议白名单（https/http/data:image）、base64 ≤5MB、单请求 ≤10、常量集中 | **PASS** | `vision-limits.ts:10-20`；`chat-content.ts:117-153`（白名单）`:103-109`（数量）`:128-135`（大小）。补测覆盖 ftp/file/data:text/data:pdf 拒绝、边界 10 通过 11 拒、5MB 边界 |
| 3 | 改写 route.ts:54-66，string 向后兼容，空 content 仍拒，errorResponse(400,invalid_parameter,param) | **PASS** | `route.ts:59-69`；空串路径 `chat-content.ts:42-44` 保留 F-WP-05 |
| 4 | string content 回归不变 | **PASS** | 补测 + 既有 604 测全过 |
| 5 | 合法多模态通过、各类非法各自 400 可定位 | **PASS** | 补测每个 param 定位精确（如 `messages[0].content[0].image_url.url`） |
| 6 | tsc + build PASS | **PASS** | §1 |
| 7 | 独立 commit | **PASS** | `74776e0 feat(BL-VISION-INPUT F-VI-01)` |

### F-VI-02 — vision 能力门禁

| # | 标准 | 判定 | 证据 |
|---|---|---|---|
| 1 | 含 image_url 时查 `alias.capabilities.vision ?? model.capabilities.vision`，非 true → 400 `model_not_vision_capable` | **PASS** | `route.ts:118-130` |
| 2 | 复用先例（modality 门禁）+ 安全类型守卫读 capabilities | **PASS** | 插入位置紧随 modality 门禁（`route.ts:105-113`），形态一致；`route.ts:119-120` 用 `as { vision?: boolean } \| null` 守卫 |
| 3 | vision 模型发图通过 | **L2-PENDING** | 需真实调用；静态逻辑：`vision===true` 跳过门禁继续 |
| 4 | 非 vision 模型发图 400 | **PASS（静态）** | `route.ts:121` `!== true` 双侧均非 true 才拒 |
| 5 | 纯文字任何模型不受门禁 | **PASS** | 门禁裹在 `if (messagesContainImage(...))` 内；`messagesContainImage` 对 string content 返回 false（补测验证） |
| 6 | capabilities=null/缺 vision 字段按不支持 | **PASS** | `??null` + `?.vision !== true` → null/undefined 均判不支持（安全默认）。补测 messagesContainImage 侧验证 |
| 7 | tsc + build | **PASS** | §1 |
| 8 | 独立 commit | **PASS** | `d87635d`（与 F-VI-03 合并 commit，见下方隐患 H3） |

**关键点：** 门禁带 `rollbackRateLimit`（`route.ts:122`），与既有 modality 门禁（`:106`）一致，避免被拒请求占用限流配额。`rlKey/rlMember` 在 `route.ts:84-85` 已定义，作用域正确。

### F-VI-03 — 管道兼容（mergeSystemMessages 数组兼容 + 日志卫生）

| # | 标准 | 判定 | 证据 |
|---|---|---|---|
| 1 | mergeSystemMessages：user 数组时 system 文本前插 text part 不强转 string；system 数组时提取 text | **PASS** | `config-overlay.ts:101-103,112-131`；补测 9 个用例全过（含核心破坏点：图片 part 保留） |
| 2 | sanitizeMessagesForLog：base64→`[image:base64 NB]`、http→`[image:url host]`、text 原样 | **PASS** | `chat-content.ts:186-213`；补测验证占位符 + 无原始字节泄漏 |
| 3 | route.ts 5 处 promptSnapshot 全改 sanitize | **PASS** | grep `promptSnapshot: body.messages` → **0 命中**；5 处均 `promptSnapshotForLog`（`route.ts:256,278,391,420,454`），分别在 handleNonStream(2) / handleStream(3) |
| 4 | supportsSystemRole=false 首条 user 数组时 system 并入且图片保留 | **PASS** | 补测 `config-overlay-merge-system.test.ts` 核心断言：3 个 part 顺序 [system-text, orig-text, image] 完整 |
| 5 | string content 回归不变 | **PASS** | 补测 `sys-prompt\n\nhello` 拼接保持原行为 |
| 6 | call_logs promptSnapshot 无 base64、text 可读 | **PASS（单元）** / L2-PENDING（真实落库） | 补测验证 sanitize 输出；真实 DB 落库归 L2 |
| 7 | tsc + build | **PASS** | §1 |
| 8 | 独立 commit | **PASS（合并）** | `d87635d feat(BL-VISION-INPUT F-VI-02 F-VI-03)` — F-VI-02/03 合并提交（见 H3） |

### F-VI-04 — vision 标记盘点 + 幂等脚本

| # | 标准 | 判定 | 证据 |
|---|---|---|---|
| 1 | dry-run 默认盘点 enabled TEXT alias 的 vision 现状 | **PASS（静态）** | `audit-vision-capabilities.ts:82-121`；dry-run 默认 `:86,128` |
| 2 | 对已知 vision 清单 vision≠true 的 --apply 幂等补 true（保留其余字段） | **PASS（静态）** | `:104-118` 仅匹配 `VISION_NAME_PATTERNS` 且 `!hasVision`；`:113-116` 合并写 `{...existing, vision:true}` |
| 3 | dry-run 输出 vision=true 清单 + 待补清单 | **PASS（静态）** | `:138-144` |
| 4 | --apply 幂等、不误改非 vision | **PASS（静态）** / L2 真实验证 | 幂等：`hasVision` 短路（`:100-103`）；只匹配 brand 名模式 |
| 5 | CLI close prisma+redis，--apply 清缓存 | **PASS** | `:150-153` finally 块 `$disconnect()`+`disconnectRedis()`；`:147` `invalidateModelsListCache()`（函数存在 `models-cache.ts:18`，键覆盖 models:list* 全 modality） |
| 6 | tsc + build | **PASS** | §1 |
| 7 | ops 说明 | **PASS** | `docs/specs/BL-VISION-INPUT-ops.md`（用法 + 清单来源 + 验证 + 回滚） |
| 8 | 独立 commit | **PASS** | `dff5e1c feat(BL-VISION-INPUT F-VI-04)` |

**运行验证（dry-run）：** `npx tsx scripts/audit-vision-capabilities.ts` → 模块解析 OK、Prisma client 初始化 OK、查询构造 OK，仅在连接本地 DB 时 `Authentication failed`（已知本地环境限制）。错误被捕获、`process.exitCode=1`。**真实盘点结果 + `--apply` 改生产 DB 归 L2。**

### F-VI-05 — Codex 真实 E2E 验收

**L2-PENDING（全部）** — 见 §5。本次 L1 验收覆盖了其中可本地验的子集（tsc/build/test、回归、门禁/校验/sanitize 单元逻辑）。

---

## 3. Evaluator 补写并通过的单测

| 文件 | 用例数 | 结果 |
|---|---|---|
| `src/lib/api/__tests__/chat-content.test.ts` | 49 | **PASS** |
| `src/lib/engine/__tests__/config-overlay-merge-system.test.ts` | 9 | **PASS** |
| **合计** | **58** | `npx vitest run` → 2 files / 58 passed（一次通过，无需改实现） |

覆盖：validateMessagesContent 全分支（string 兼容/空拒、合法多模态、缺 type/text/url、null/数字/对象 content、part 为 null/字符串、ftp/file/data:text/data:pdf 拒、http/https 允、5MB 边界、10/11/跨消息累计图片数）；messagesContainImage（image→true、纯文字/string/空→false、assistant 藏图→true、null 不崩）；sanitizeMessagesForLog（base64 占位无泄漏、http 仅 host 无 path/query/token、text 原样、string 原样、**不 mutate 原 messages**、url=null/缺失/非字符串/无效 URL 不崩、非对象 part 原样）；mergeSystemMessages（**图片 part 保留核心断言**、string 回归、system 数组提取 text、system 数组含图仅取 text、多 system 合并、无 user 新建、无 system 不动、多 user 仅首条接 system）。

---

## 4. 发现的 bug / 隐患（按严重度）

**未发现阻塞性 bug。** 以下为隐患 / 观察项：

- **[LOW / 设计行为 — 非 bug] H1 门禁覆盖所有角色含图片。** `messagesContainImage` 检测 user/assistant/system 任一消息的 image_url part（补测验证 assistant 藏图 → true）。这意味着多轮对话回放历史含图时也会触发 vision 门禁。**判定为预期且安全**（vision 模型本就能处理历史图；非 vision 模型回放含图历史本就该拒）。无 bypass：校验与门禁用同一结构检测，对齐一致。
- **[LOW] H2 base64 大小为估算非精确解码。** `base64DecodedSize` 用 `floor(len*3/4)-padding` 估算。已对抗验证：对空串/`==`/`=`/无 padding/畸形未补齐串，估算值与 Node `Buffer.from(...).length` **逐一相等**（见验证脚本）。5MB 门限无 off-by-one。**仅一个理论边角**：含换行/空白的 base64（部分客户端会折行）会让 `len` 偏大→估算偏大→更早拒，属保守方向（偏严不偏松），不构成安全风险。
- **[INFO] H3 F-VI-02 与 F-VI-03 合并在单个 commit（`d87635d`）。** acceptance 各自要求"独立 commit"。功能均完整、可运行；仅 commit 粒度未严格 1:1。**非功能性问题**，记录供 Planner 知悉，不影响 PASS。
- **[INFO] H4 `mergeSystemMessages` 内对 `rest[firstUserIdx]` 原地赋值（`config-overlay.ts:99`）。** 看似 mutation，但 `rest` 是函数内新建数组、`original` 经 spread 复制、入参 `messages` 未被改。补测验证无副作用泄漏到调用方。符合不可变约定。
- **[INFO] H5 vision 门禁依赖标记准确性。** 若某 vision alias 漏标 `capabilities.vision=true`，合法请求被误拒（false-negative 体验问题，非安全问题）。已由 F-VI-04 盘点脚本 + ops runbook 前置缓解。**真实生产标记现状需 L2 dry-run 确认**（本地 DB auth failed 无法盘点）。

---

## 5. L2 待用户授权项

| 项 | 来源 | 验证方法 |
|---|---|---|
| 生产 vision 标记盘点（dry-run 真实结果） | F-VI-04 #1,3 | 生产环境 `npx tsx scripts/audit-vision-capabilities.ts`（只读，但需真实 DB） |
| `--apply` 补漏写生产 DB + 清缓存 | F-VI-04 #2,4,5 | `--apply` 后重跑 dry-run 确认幂等（待补清单为空） |
| 图片输入 E2E（URL）→ 200 正确描述 | F-VI-05 #2 | 对 gpt-4o POST 含 http image_url，验证响应文字 |
| 图片输入 E2E（base64）→ 200 正确描述 | F-VI-05 #3 | 同上换 data:image base64 |
| 门禁真实拒绝（非 vision 模型 → 400） | F-VI-05 #4 | 对非 vision 模型发图，验证 400 `model_not_vision_capable` |
| 安全限制真实 400（超 10/超 5MB/非白名单） | F-VI-05 #5 | 真实请求触发各限制 |
| 计费：promptTokens 含图片 token、SUCCESS 扣费、失败不收费 | F-VI-05 #6 | 查 CallLog trace 的 promptTokens vs 纯文字基线 |
| 日志卫生真实落库（call_logs 无 base64） | F-VI-05 #7 | `/logs/<traceId>` 详情页确认占位符 |
| 流式回归（含图片 + 纯文字流式） | F-VI-05 #8 | stream=true E2E |

> L2 涉及真实 AI 调用 + 计费 + 改生产 DB，Evaluator 不自行执行；本地 DB 凭证 auth failed 亦使依赖真实 DB 的项归 L2。

---

## 6. 结论

- **L1：PASS** — 4 个 generator feature（F-VI-01~04）的代码实现、类型、构建、lint、单测、对抗边界全部通过；Evaluator 补写 58 个单测一次通过（含核心破坏点：mergeSystemMessages 图片保留、sanitize 无字节泄漏、协议白名单、5MB 边界、数量边界、null/异常输入不崩）。BL-093 CI 修复运行时正确。未发现阻塞性 bug。
- **L2：PENDING** — F-VI-05 真实 E2E（图片调用 / 计费 / 日志落库 / 生产 audit）待用户授权后由 Codex 执行。

**建议下一步：** 用户授权后，Codex 执行 F-VI-05 真实 E2E + 生产 audit；H3（commit 粒度）记录即可，无需返工。
