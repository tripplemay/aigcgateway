# Framework CHANGELOG

记录框架每次迭代的内容、来源批次和触发原因。
每条记录由 Planner 提案、用户确认后写入。新条目追加在最上方。

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
