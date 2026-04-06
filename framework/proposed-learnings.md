# Framework 提案暂存区

> Generator 和 Evaluator 在工作中发现值得沉淀的经验时，追加到本文件。
> Cowork（Claude）在每次「更新项目共享记忆」时读取本文件，逐条提交给用户确认。
> 确认后由 Cowork 正式写入 `framework/` 对应文件，并在 `CHANGELOG.md` 追加记录，最后清空已确认条目。

---

<!-- 待确认的提案将出现在此处，示例格式：

## [YYYY-MM-DD] Generator — 来源：F-XXX

**类型：** 新规律 / 新坑 / 模板修订 / 铁律补充

**内容：** [一句话描述]

**建议写入：** `framework/README.md` §经验教训

**状态：** 待确认

-->

## [2026-04-04] Evaluator — 来源：F-FIX-01 / F-FIX-02

**类型：** 新坑

**内容：** 白名单收窄后，已同步到 DB 的旧模型不会自动删除，`/v1/models` 仍会暴露它们。白名单变更必须配套一次"清理已下线模型"的数据库操作，否则白名单形同虚设。

**建议写入：** 不纳入框架（属于项目特有内容）

**状态：** 已关闭（2026-04-04）

---

## [2026-04-04] Evaluator — 来源：F-DATA-03

**类型：** 新坑

**内容：** SiliconFlow 本地 401 导致 L2 验收标准（sync 后 sellPrice > 0）在 L1 环境永远无法满足。此类依赖外部服务的 acceptance 标准需明确标注「L2 Only」，避免 Evaluator 在 L1 环境尝试验证而产生 PARTIAL。

**建议写入：** `framework/harness/evaluator.md`（新增：acceptance 中标注 [L1] / [L2] 的处理规则）

**状态：** 已实现（evaluator.md §3 已包含 [L1]/[L2] 说明，2026-04-04）

---

## [2026-04-04] Cowork — 来源：Codex reviewing 阶段角色冲突

**类型：** 框架缺口

**内容：** AGENTS.md（角色身份约束）与 harness-rules.md（状态机流程）可能产生冲突。当 AGENTS.md 限制 Codex 为"纯验收代理"时，`reviewing → Generator（修复）` 的映射失效，修复责任归属不明确。

**状态：** 已解决（2026-04-04）— 升级为七态状态机，`reviewing` 拆为 `fixing`（Claude CLI）和 `reverifying`（Codex），角色语义不再重叠；AGENTS.md §18 同步更新

---

## [2026-04-04] Cowork — 来源：openrouter-whitelist.ts 图片模型移除

**类型：** 新坑

**内容：** OpenRouter 图片模型走 chat 端点，生产验证 gemini-2.5-flash-image / gpt-5-image-mini 均 FAIL（频繁返回空 content）。聚合型服务商的图片生成能力不可信赖，图片生成应优先使用直连 Provider（OpenAI dall-e-3、zhipu、volcengine 等）。

**状态：** 已写入（2026-04-04）— framework/README.md §经验教训·成本控制

---

## [2026-04-04] Cowork — 来源：Codex 缓存导致读到过期 progress.json

**类型：** 新坑

**内容：** 多 Agent 并发场景下，Codex 读取到缓存版本的 progress.json（旧状态 reviewing/6 of 7），导致角色误判和状态误报。清缓存重读后才恢复正确。每次启动时必须强制从磁盘读取最新文件。

**状态：** 已实现（harness-rules.md 第零步，2026-04-04）

---

## [2026-04-06] Claude CLI — 来源：MCP 沙盒生存测试 + BL-019 hotfix

**类型：** 新坑 + 铁律补充

**内容：** 新增 sync adapter 时必须实现 `filterModel` 方法。白名单是模型暴露的最高优先级控制，但 volcengine/deepseek/anthropic 三个 adapter 遗漏了 `filterModel`，导致白名单收紧后旧 Channel 未被清理，`list_models` 仍返回不可用模型。Agent 选中这些模型后调用 404。此外，bug fix 级别的 hotfix 未走 harness 流程，应在 proposed-learnings 中记录。

**建议写入：** `framework/README.md` §经验教训 — "每个 SyncAdapter 必须实现 filterModel，白名单是最高优先级"

**状态：** 已写入（2026-04-06）— framework/README.md §经验教训·Sync Adapter

---

## [2026-04-06] Claude CLI — 来源：P3-1 模板页面设计稿过期

**类型：** 铁律补充

**内容：** P3-1 重构引入 Action + Template 两层架构后，Stitch 中的 4 个模板设计稿（基于旧的单层 Template 概念）从未更新，导致设计稿与代码架构严重脱节。Planner 在 planning 阶段拆解功能时，若涉及已有 Stitch 设计稿的页面架构变更（数据模型重构、页面新增/合并/拆分），必须同时创建一条 "更新 Stitch 设计稿" 的功能条目，确保设计稿与代码同步演进。

**建议写入：** `planner.md` §2 或 §3 — 新增检查项："涉及 UI 页面架构变更时，检查 Stitch 是否有对应设计稿，有则追加更新设计稿的功能条目"

**状态：** 已写入（2026-04-06）— planner.md §2.5 "检查 Stitch 设计稿"

---

## [2026-04-06] Kimi — 来源：Reviewer 复验发现 progress.json 非法字符

**类型：** 新坑

**内容：** Generator 写入 progress.json 时使用了中文弯引号（U+201C/U+201D）作为 JSON 结构分隔符，导致 JSON 解析失败。状态机文件（progress.json / features.json）必须使用标准 ASCII 双引号。建议在 generator.md 中增加提醒：写入 JSON 文件时禁止使用弯引号。

**建议写入：** `generator.md` §5 — "状态文件必须使用标准 ASCII 双引号，禁止弯引号"

**状态：** 待确认
