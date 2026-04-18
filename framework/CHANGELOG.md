# Framework CHANGELOG

记录框架每次迭代的内容、来源批次和触发原因。
每条记录由 Planner 提案、用户确认后写入。新条目追加在最上方。

---

## v0.7.2 — 2026-04-18（Planner 铁律 2.1：协议返回形式断言必须标明协议层）

**来源批次：** BL-SEC-INFRA-GUARD fix round 1 F-IG-04
**触发原因：** Planner 初稿 spec 要求 MCP tool 权限错误返回 `HTTP 403`，实际 MCP 协议（JSON-RPC over HTTP）标准是 `{content:[...], isError: true}` 外层 HTTP 200。Generator fix round 0 实现符合 MCP SDK 惯用法，但首轮 Evaluator 按 spec 要求 403 判 FAIL。若按 spec 真改 server 层拦截，会破坏所有 MCP client（Claude Desktop / CLI）错误处理兼容性。

**变更内容（`framework/harness/planner.md` Planner 铁律 2 新增子条目）：**

**铁律 2.1：协议返回形式断言必须标明协议层**
- HTTP API / MCP tool / WebSocket 的错误返回形式不同
- Code Review 报告对协议层描述按"线索"处理；协议格式断言必须查协议 SDK 或官方文档后再写 spec
- 禁止把 MCP 当普通 REST 或把 WebSocket 当 HTTP

**影响范围：** spec 涉及 MCP tool / JSON-RPC / WebSocket 错误返回形式时，Planner 必须查协议 SDK 文档核实；Generator 开工前规格核查可据此质疑。

---

## v0.8.1 — 2026-04-18（设计精美的 SVG 图：三角色 / 状态机 / 记忆金字塔）

**来源批次：** 独立任务（用户要求生成针对最终用户展示的、必要的、设计精美的 PNG 图片）
**触发原因：** v0.8.0 文档套件依赖 mermaid 图，虽然功能性够但视觉精致度不足；mermaid 在 GitHub 上渲染不可控，某些复杂图会变形。定位为"面向最终用户展示"，需要有设计感的图形作为 landing 视觉

**方案决策过程：**
1. 维度：载体（README / docs 多页 / 独立站）、图种（mermaid / ASCII / 真实截图 / GIF / 设计 PNG）、优先级
2. 用户选：现代极简风格 + P0 3 张（最影响第一印象的）
3. 实现：由于 Claude CLI 无法直接生成 PNG，选 SVG 方案 —— 可版本控制、GitHub 原生渲染、retina 友好、文本可diff、可后续转 PNG

**变更内容：**

- 新增 3 张精心设计的 SVG 图（`framework/docs/imgs/`）：
  - `three-roles.svg`（1200×800）：三角形布局 + 3 个角色卡片（Planner/Generator/Evaluator）+ 循环箭头（规格/代码/PASS/FAIL 反馈）+ 底部铁律
  - `state-machine.svg`（1400×700）：7 状态完整流转 + 角色色标 + 主流程/FAIL/PASS 三色箭头 + 底部图例
  - `memory-pyramid.svg`（1200×800）：T0/T1/T2 三层金字塔（暖到冷色渐进）+ 左侧加载时机标注 + 右侧写入职责标注 + 底部内容边界铁律
- 文档嵌入 SVG 替换对应 mermaid：
  - `README.md` §一图看懂：mermaid 状态机 + ASCII 三角色 → three-roles.svg + state-machine.svg
  - `docs/01-concepts.md` §解法1 / §解法2 / §记忆分层：3 个 mermaid → 3 张 SVG
  - `docs/02-usage.md` §状态机详解 / §.auto-memory/：2 个 mermaid → 2 张 SVG
- 保留不替换的 mermaid：§Git 总线、§完整批次时序图、§角色流程图（这些 mermaid 原生效果够用，无需重绘）

**设计规范：**
- 配色：Planner=#3B82F6（蓝）/ Generator=#10B981（绿）/ Evaluator=#EF4444（红）/ 终态=#0F172A（深）/ 金字塔三层=T0 琥珀/T1 绿/T2 蓝
- 字体：system-ui 堆栈 + 中文 fallback（PingFang SC / Microsoft YaHei）
- 风格：现代极简，浅色背景（#FAFAFA），轻度阴影，圆角 10-14px，无插画（纯几何）
- SVG 文件大小：6-8 KB 每张，总计 ~22 KB

**后续可升级路径：**
- 用 Figma/Stitch 做插画版 hero 封面图（放大版 three-roles 概念）
- 用 terminalizer 录制 2 个 GIF（bootstrap 演示 + Claude INIT 演示）
- 补 P1 2 张（状态机精美版已做，痛点对比图、Git 总线示意图待补）

---

## v0.8.0 — 2026-04-18（图文并茂文档套件首版）

**来源批次：** 独立任务（用户要求为框架撰写图文并茂的介绍文档）
**触发原因：** framework/README.md 虽然详尽但偏手册性质，缺乏直观的图形说明；没有分层文档让不同受众（概念学习 / 操作上手 / 实战演示）各取所需；mermaid 图可通过 GitHub 原生渲染，是低成本高效果的图文方案

**变更内容：**

- `framework/README.md` 升级为 landing page：
  - 新增 Hero 区：mermaid 状态机图 + ASCII 三角色示意图 + 30 秒快速开始
  - 新增文档导航区：指向 docs/01-03 + CHANGELOG
  - 保留原有完整手册内容于下方（不动）
- 新增 `framework/docs/` 目录及 4 份文档：
  - `01-concepts.md`（功能介绍 · ~280 行）：3 个痛点 → 3 个解法、三角色图、状态机、记忆分层图、铁律故事、适用与不适用、vs 普通 AI 编程 / Scrum 对比
  - `02-usage.md`（使用方法详解 · ~530 行）：完整批次时序图、状态机详解、三角色职责流程图、关键文件字段详解（progress.json / features.json / backlog.json / .auto-memory/）、高级用法（多 agent / Codex-only / Path A）、沉淀机制
  - `03-quickstart.md`（开箱即用手册 · ~350 行）：前置条件、3 步初始化（含 GIF 占位）、第一个批次实战（签到积分系统示例）、10 条 FAQ
  - `imgs/` + `gifs/` 目录（暂空，等后续设计工具出图和录屏）
- 同步推到 template repo `tripplemay/harness-template`

**设计决策：**
- 图以 mermaid 为主（GitHub 原生渲染、版本控制友好），辅以 ASCII 图（表格化信息）
- 2 处 GIF 占位（bootstrap 演示、Claude INIT 演示），待后续用 terminalizer/asciinema 录屏补上
- 中文为主，暂不双语（符合用户工作语言偏好）
- 未做 04-reference.md 和 05-case-study.md（当前文档已覆盖核心需求，未来可按需补充）

---

## v0.7.1 — 2026-04-18（Planner 铁律：spec 编写前核查源码 + 交叉验证 Code Review 断言）

**来源批次：** BL-SEC-BILLING-AI / BL-SEC-BILLING-CHECK-FOLLOWUP
**触发原因：** 两次连续事故：
1. BL-SEC-BILLING-AI 初稿 spec 把 `deduct_balance` 签名写错（2 参 BOOLEAN vs 实际 6 参 RETURNS TABLE），被 Generator 开工前规格核查捕获；若未核查会产生重复 DEDUCTION transaction 记录破坏对账
2. BL-SEC-BILLING-AI F-BA-03 CHECK migration 生产 `prisma migrate deploy` 失败，根因是 Code Review 对 `Transaction.amount` 符号断言错误（H-16 报告 REFUND < 0，实际代码 `scripts/refund-zero-image-audit.ts:102` 存 +sellPrice 为正数）；需 hotfix 回滚 + 开新批次 `BL-SEC-BILLING-CHECK-FOLLOWUP` 修正

**变更内容（`framework/harness/planner.md` 新增 "Planner 铁律" 小节）：**

**铁律 1：spec 涉及具体代码细节时必须核查源码**
- 函数签名 / API handler 参数 / schema 字段 / 枚举常量 — 写 spec 前必须 Read 对应文件确认
- 规格引用实际代码时必须用代码块贴片段 + 标注 `file:line`
- Generator 发现规格偏差时有义务开工前提出，Planner 修订后再开工

**铁律 2：Code Review 报告的事实性断言按"线索"处理不按"真相"采信**
- 符号/类型/约束/枚举/常量类断言必须双路交叉验证：源码 + 生产数据采样
- spec 中引用 Review 发现须标注 `[已核实 source + prod-data]` 或 `[待核实]`
- `[待核实]` 类不得作为 acceptance 阻断条件

**影响范围：** Planner 规格编写流程永久变更；Generator 开工前规格核查合法化并成为推荐做法。

---

## v0.7.0 — 2026-04-18（改名：Cowork + Harness → Triad Workflow）

**来源批次：** 独立任务（用户讨论时指出原名未准确反映框架工作模式）
**触发原因：** "Cowork" 是早期 Claude Desktop 作为 Planner 时的残留（v0.4.0 起已由 Claude CLI 承担），"Harness" 偏泛且容易与 CI/CD harness.io 混淆。两词都无法突出本框架真正独特的"三角色不重叠 + 状态机驱动 + 无自评"三件事

**新名称：Triad Workflow**
- Triad（三角色）：Planner / Generator / Evaluator
- Workflow：状态机 + Git 异步交接 + 记忆分层沉淀

**变更内容（表层改名，不动文件路径）：**
- `framework/README.md` 标题 + 介绍段重写：突出三角色 / 状态机 / Git 总线 / 记忆分层四个核心特征；保留历史说明解释 Cowork 来历
- `framework/INIT.md` 标题、首次 commit 消息中"Cowork-Harness framework" → "Triad Workflow"
- `framework/bootstrap.sh` 脚本注释 + 运行时输出"Harness framework" → "Triad Workflow"
- `framework/memory/user-role.md` 模板中"Harness 7 状态机" → "Triad Workflow 7 状态机"

**保留不动（向后兼容）：**
- 所有文件名：`harness-rules.md` / `framework/harness/` 目录等
- GitHub repo 名：`tripplemay/harness-template`（URL 稳定性优先，repo 描述已更新）
- aigcgateway 项目根目录所有文件（现用命名不受影响）
- 角色文件内容中出现的"harness 规则"引用（那些指的是 `harness-rules.md` 文件，是文件引用不是框架名）

**后续可选升级（当前不做）：** 档位 2 = 文件名和路径也对齐（`harness/` → `state-machine/`），档位 3 = repo 同步改名。短期不破坏现有协作，长期如需彻底统一可再推进

---

## v0.6.1 — 2026-04-18（一键初始化：bootstrap.sh + INIT.md）

**来源批次：** 独立任务（用户讨论"如何把框架应用到新项目"，确定形态三 = 独立 template repo + bootstrap + INIT 的初始化方案）
**触发原因：** 原 5 步手工 cp + 编辑流程对新项目不友好；纯 bash 脚本无法智能填充 environment.md / user-role.md 等需要判断的字段；选定 "bootstrap.sh 做机械复制 + Claude 通过 INIT.md 智能填占位符" 的双层分工

**变更内容：**

- 新增 `framework/bootstrap.sh`：机械复制脚本
  - 自动识别 flat（degit template repo 后）/ nested（aigcgateway 自身）布局
  - 拷贝 harness 角色文件到根目录、初始化 `.auto-memory/` 分层结构、复制 CLAUDE.md/AGENTS.md 占位符版本
  - 创建 progress.json/features.json/backlog.json/docs 骨架/.gitignore
  - flat 布局下把源文件规整到 `framework/` 子目录、把 INIT.md 提到根目录
  - 安全检查：harness-rules.md 已存在则拒绝执行
- 新增 `framework/INIT.md`：Claude CLI 引导 prompt
  - 6 个问题（项目名/技术栈/命令/生产环境/agent 身份/用户偏好）
  - 步骤 2 必须展示填充计划等用户确认
  - 用 Edit 工具精确替换占位符，不擅自编造信息
  - 完成后 `git init` + commit + 删除 INIT.md
- `framework/README.md` §新项目启动：从 5 步简化为 3 步（degit → bootstrap → Claude INIT）
- 同步发布到独立 template repo `tripplemay/harness-template`（首次 `git subtree push --prefix=framework`）

**分工设计：**
- bootstrap.sh = 机械活（确定性 cp/mkdir/echo），shell 脚本可回归
- Claude INIT.md = 判断题（智能填充占位符），自然语言交互
- 边界清晰，互不踩脚

---

## v0.6.0 — 2026-04-18（框架对齐审计 + 模板补齐）

**来源批次：** 独立任务（用户要求审查 framework 是否与当前流程对齐）
**触发原因：** 项目根的 generator.md / evaluator.md 多次更新后未同步到 framework；memory 模板停留在 v0.4.0 之前的扁平结构；features.template.json 缺 v0.2.0 引入的 executor 字段；signoff-report 残留 `reviewing` 和 "Cowork" 等过时词；progress.init.json 缺 v0.5.0 引入的 session_notes 字段

**变更内容：**

- `harness/generator.md`：从项目根同步，补齐两节
  - 设计稿页面保护规则（无条件适用，不依赖 acceptance 提及）
  - §4.5 CI 检查（每次 push 后 `gh run list` 检查，铁律：CI 红色不得继续开发）
- `harness/evaluator.md`：从项目根同步，补齐一节
  - 设计稿页面变更的视觉一致性验收（无条件适用）
- `harness/progress.init.json`：补 `session_notes`、`generator_handoff` 字段，与项目根 progress.json 字段对齐
- `templates/features.template.json`：每条 feature 补 `executor` 字段（v0.2.0 引入但模板未跟进），含 generator / codex 两个示例
- `templates/signoff-report.md`：
  - `status=reviewing` → `status=verifying`（reviewing 在 v0.2.0 已废弃）
  - "由 Cowork 在 status → done 时填写" → "由 Planner..."
  - 类型检查节加入 CI 检查输出
  - 新功能块加入 Executor 字段（generator / codex）
- `memory/` 目录按 v0.5.0 分层结构完全重写：
  - 新增 `project-status.md`（T0，覆盖写，≤30 行）替代 `project.md`
  - 新增 `environment.md`（T0）模板
  - 新增 `role-context/{planner,generator,evaluator}.md`（T1）模板
  - 新增 `reference-docs.md`（T2）模板
  - `MEMORY.md` 改为 T0/T1/T2 分层索引
  - `user-role.md` 去掉 "Cowork + Claude CLI + Codex" 表述
  - 删除旧的 `project.md`
- `README.md`：
  - 框架组成结构图反映 memory v0.5.0 分层
  - 新项目启动指南（第 2 步）按分层结构复制文件
  - 新增 §需求池（backlog.json）、§角色动态分配（role_assignments）章节
  - §记忆系统约定改为 T0/T1/T2 分层 + 写入职责表 + 内容边界铁律
  - §经验教训补充 4 个新条目：CI 守门铁律、回归测试硬性要求、设计稿一致性无条件适用、Path A 大型重构编排模式
  - 历史说明：保留 "Cowork" 词以表明出处，但行为上已不参与
- `CHANGELOG.md`：按时间倒序重排，去掉重复 v0.2.0

---

## v0.5.0 — 2026-04-08（共享记忆分层加载）

**来源批次：** R1-design-system-foundation planning 阶段，用户主动要求改进记忆系统
**触发原因：** agent 重启后加载全部记忆文件导致 context 浪费；project-aigcgateway.md 不断膨胀无人清理

**变更内容：**

- `.auto-memory/` 文件结构重组：
  - 新增 `project-status.md`（T0，≤30 行，覆盖写）替代膨胀的 `project-aigcgateway.md`
  - 新增 `environment.md`（T0）从 project-aigcgateway.md 拆出环境信息
  - 新增 `role-context/{generator,evaluator,planner}.md`（T1）角色行为规范
  - 删除 `project-aigcgateway.md`（拆分）、`feedback-testing-strategy.md`（合入 evaluator）、`feedback-harness-system.md`（已被 harness-rules 覆盖）、`project-ui-refactor-plan.md`（合入 project-status）
- `MEMORY.md` 索引改为分层格式（T0/T1/T2），T1 带触发条件标注
- `harness-rules.md` §记忆分层：全面重写为分层加载规则 + 写入职责 + 内容边界铁律
- `harness-rules.md` §启动流程第零步：加载指令改为 T0→T1→T2 分层
- `harness-rules.md` §第五步：更新 project-status.md（覆盖写）+ session_notes
- `planner.md` §done 收尾步骤 1：从"重写记忆"改为"校验整合 project-status.md"
- `progress.json` 新增 `session_notes` 字段：同角色跨会话叙事上下文

**设计原则：**
- project-status.md = WHAT（会变的事实），role-context = HOW（稳定的规范），不混放
- role-context 禁止写计划/决策/进度
- 每条信息只存一处，不重复 progress.json 已有的结构化数据
- 启动加载量上限 ~120 行（索引 + 状态 + 环境 + 角色文件）

---

## v0.4.0 — 2026-04-08（框架同步 + 工具角色修正）

**来源批次：** R1-design-system-foundation planning 阶段框架检查
**触发原因：** 框架模板与项目根目录实际运行的规则长期脱节，README 中工具角色映射仍写 Cowork

**变更内容：**

- `framework/harness/harness-rules.md`：从项目根目录全量同步，补齐第 1.2 步（agent 自动注册）、第 1.5 步（独立任务检查）、backlog.json 规则、推送前遗漏检查、分支规则、角色动态分配、铁律第 8-9 条
- `framework/README.md`：
  - 工具角色映射：Cowork → Claude CLI（Planner + Generator），Codex（Evaluator）
  - 日常使用流程：修正状态名（reviewing → fixing/reverifying）、工具分工、会话结束流程
  - 经验教训·Harness 纪律：更新为当前工具分工，补充铁律第 9 条
- `framework/cowork-constraint-design.md`：加历史标注，说明 Cowork 已不参与，设计原则仍适用
- `framework/CHANGELOG.md`：补记 v0.3.0 后所有变更

---

## v0.3.0 — 2026-04-05（测试域归属 Codex）

**来源批次：** 压力测试批次（框架设计讨论续）
**触发原因：** Codex 具备完整的测试设计能力，由 Generator 写测试脚本缺乏独立视角，违反不自评原则

**变更内容：**
- `harness-rules.md`：Codex 角色从「验收 + 复验 + 执行」改为「测试设计 + 执行 + 验收 + 复验」；新增职责边界说明
- `generator.md`：明确不写任何测试（单元测试、E2E 脚本、压测脚本均不负责）
- `evaluator.md`：任务从两件事改为三件事（加入「设计并编写测试」）；新增步骤 2「编写测试」（含单元测试、E2E 脚本、压测脚本）；原步骤 2 变为步骤 3；重要原则补充「测试域所有者」身份

**分工结论：**
- Generator：业务代码实现，不涉及任何测试
- Codex：测试域完整所有权（设计 → 编写 → 执行 → 分析 → 报告）

---

## v0.2.1 — 2026-04-04

**来源批次：** proposed-learnings.md 首次批量处理（5 条提案，本会话确认）

**变更：**

- `framework/README.md` §经验教训·成本控制：新增"聚合型服务商图片生成不可靠，直连优先"
- `framework/proposed-learnings.md`：5 条提案全部关闭存档（2 已实现、1 写入、1 用户决策不纳入框架、1 关闭）
- `framework/cowork-constraint-design.md`（新增）：记录 Cowork 与 Claude Code CLI 约束机制差异，推荐 MEMORY.md 索引方案
- `.auto-memory/cowork-constraints.md`（新增）：Cowork 行为边界约束
- `.auto-memory/MEMORY.md`：新增 cowork-constraints.md 索引条目

**触发原因：** 项目首个完整批次（成本优化 7/7 PASS）后，整理框架自迭代机制

---

## v0.2.0 — 2026-04-05（executor 字段 + 批次类型）

**来源批次：** 压力测试批次（框架设计讨论）
**触发原因：** 压测执行被 Generator 承担，违反"不得自评"铁律；压测类任务本质是 Codex 的执行职责

**变更内容：**
- `harness-rules.md`：新增 Feature executor 字段规范（generator / codex）；新增三种批次类型（普通 / 混合 / Codex-only）；更新状态流转图；新增铁律 6、7
- `planner.md`：步骤 3 features.json 格式加入 executor 字段；步骤 5 改为"判断批次类型"——全 codex 时直接设 verifying
- `generator.md`：任务定义限定为 executor:generator 功能；步骤 1 增加筛选逻辑；新增步骤 7（Handoff 说明）
- `evaluator.md`：新增步骤 2（执行 executor:codex 功能）；步骤 3 改为条件性启动；任务定义更新为"执行 + 验收"双职责

**同期增量（v0.2.0 后期，2026-04-04）：**
- 七状态机替换原五状态：`new → planning → building → verifying → fixing ⟷ reverifying → done`（消除原 `reviewing` 双重语义）
- 工具与角色对应表新增
- 文档目录标准化：`docs/specs/` → `docs/test-cases/` → `docs/test-reports/` → `docs/archive/`
- progress.json 新增字段：`fix_rounds`、`docs`（含 spec / test_cases / signoff / framework_reviewed）

---

## v0.1.0 — 2026-04-04（初始版本）

**来源批次：** AIGC Gateway 成本优化 + Bug 修复批次（7/7 PASS）

**创建内容：**

```
framework/
├── README.md                  新项目启动指南 + 经验教训
├── harness/
│   ├── harness-rules.md       状态机规则（5 状态机，Cowork/Claude CLI/Codex 三工具协作）
│   ├── planner.md             Planner 角色指令
│   ├── generator.md           Generator 角色指令
│   ├── evaluator.md           Evaluator 角色指令
│   └── progress.init.json     初始 progress.json
├── memory/
│   ├── MEMORY.md              记忆索引模板
│   ├── user-role.md           用户信息模板
│   └── project.md             项目状态模板
└── templates/
    ├── CLAUDE.md              Claude / Codex 项目指令模板
    ├── signoff-report.md      签收报告模板
    └── features.template.json features.json 模板
```

**经验教训（已写入 README.md）：**
- Harness 纪律：Cowork 做规划和记忆，Codex 做代码实现，职责不混淆（注：v0.4.0 后调整为 Claude CLI 同时承担 Planner + Generator）
- 成本控制：聚合型服务商必须设白名单；图片健康检查止步于 L2
- Schema 变更：每个 migration 只包含一个功能；`@updatedAt` 需手动补 `DEFAULT now()`
- 跨设备协作：`.auto-memory/` 纳入 git，每次会话结束 commit + push

---

<!-- 后续条目格式：

## v0.x.0 — YYYY-MM-DD

**来源批次：** [批次名称 + signoff 文档链接]

**变更：**
- [新增 / 修改 / 删除] `framework/path/to/file.md`：[一句话描述变更内容]

**触发原因：**
[本次改动的背景，如：Evaluator 反复在某个点上 PARTIAL、新技术栈带来新约定等]

-->
