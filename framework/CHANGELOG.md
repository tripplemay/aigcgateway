# Framework CHANGELOG

记录框架每次迭代的内容、来源批次和触发原因。
每条记录由 Cowork 提案、用户确认后写入。

---

## v0.1.0 — 2026-04-04（初始版本）

**来源批次：** AIGC Gateway 成本优化 + Bug 修复批次（7/7 PASS）

**创建内容：**

```
framework/
├── README.md                  新项目启动指南（5步流程）+ 经验教训
├── harness/
│   ├── harness-rules.md       状态机规则（Planner → Generator → Evaluator）
│   ├── planner.md             Planner 角色指令
│   ├── generator.md           Generator 角色指令
│   ├── evaluator.md           Evaluator 角色指令
│   └── progress.init.json     初始 progress.json（status: "new"）
├── memory/
│   ├── MEMORY.md              记忆索引模板
│   ├── user-role.md           用户信息模板
│   └── project.md             项目状态模板
└── templates/
    ├── CLAUDE.md              Claude / Codex 项目指令模板
    ├── signoff-report.md      功能签收报告模板（含 Framework Learnings 章节）
    └── features.template.json features.json 模板
```

**经验教训（已写入 README.md）：**
- Harness 纪律：Cowork 做规划和记忆，Codex 做代码实现，职责不混淆
- 成本控制：聚合型服务商必须设白名单；图片健康检查止步于 L2
- Schema 变更：每个 migration 只包含一个功能；`@updatedAt` 需手动补 `DEFAULT now()`
- 跨设备协作：`.auto-memory/` 纳入 git，每次会话结束 commit + push

---

## v0.2.0 — 2026-04-04

**来源批次：** AIGC Gateway 遗留问题修复批次（7/7 PASS）+ 框架设计讨论

**变更：**

**一、七状态机（替换原五状态）**

```
new → planning → building → verifying → fixing ⟷ reverifying → done
```

`verifying`/`reverifying` 分别对应首轮验收和复验，消除原 `reviewing` 的双重语义。

**二、工具与角色对应表**（新增）

| 工具 | 角色 | 负责阶段 |
|---|---|---|
| Cowork（Claude Desktop） | Planner + 记忆维护 | `new` / `planning` / `done` |
| Claude CLI（Claude Code） | Generator | `building` / `fixing` |
| Codex | Evaluator | `verifying` / `reverifying` |

**三、文档目录标准化**（新增）

```
docs/specs/ → docs/test-cases/ → docs/test-reports/ → docs/archive/ → docs/adr/（可选）
```
每个角色文件明确标注读哪个目录、写哪个目录。

**四、progress.json 新增字段**

- `fix_rounds`：记录 fixing ↔ reverifying 循环次数
- `docs`：文档流追踪（spec / test_cases / signoff / framework_reviewed），signoff 和 framework_reviewed 为 done 前硬性要求

**五、角色文件全面更新**

- `planner.md`：新增写 docs/specs/ 和填 docs.spec 步骤
- `generator.md`：区分 building / fixing 双模式，明确完成标准
- `evaluator.md`：区分 verifying / reverifying 双阶段，signoff 硬性要求，L1/L2 标注处理规则

**触发原因：** Codex 出现角色误判（AGENTS.md vs 状态机冲突），讨论后发现根因是工具分工未在框架中明确，`reviewing` 状态语义模糊，借此机会做整体架构升级。

---

## v0.2.1 — 2026-04-04

**来源批次：** proposed-learnings.md 首次批量处理（5 条提案，本会话确认）

**变更：**

- `framework/README.md` §经验教训·成本控制：新增"聚合型服务商图片生成不可靠，直连优先"
- `framework/proposed-learnings.md`：5 条提案全部关闭存档（2 已实现、1 写入、1 用户决策不纳入框架、1 关闭）
- `framework/cowork-constraint-design.md`（新增）：记录 Cowork 与 Claude Code CLI 约束机制差异，推荐 MEMORY.md 索引方案
- `.auto-memory/cowork-constraints.md`（新增）：Cowork 行为边界约束，每次会话自动注入
- `.auto-memory/MEMORY.md`：新增 cowork-constraints.md 索引条目

**触发原因：** 项目首个完整批次（成本优化 7/7 PASS）后，整理框架自迭代机制，同步处理 Evaluator 和 Cowork 在批次执行中提交的所有 proposed-learnings。

---

<!-- 后续条目格式：

## v0.x.0 — YYYY-MM-DD

**来源批次：** [批次名称 + signoff 文档链接]

**变更：**
- [新增 / 修改 / 删除] `framework/path/to/file.md`：[一句话描述变更内容]

**触发原因：**
[本次改动的背景，如：Evaluator 反复在某个点上 PARTIAL、新技术栈带来新约定等]

-->
