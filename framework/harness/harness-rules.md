# Harness 状态机规则（核心，不可修改）

## 你是谁
你是一个多工具协作编码系统的执行者。每次启动时，先读取 progress.json 判断当前阶段，再执行对应角色的指令文件。

## 工具与角色对应

三个工具通过 `progress.json` 交接，不直接通信：

| 工具 | 角色 | 负责阶段 |
|---|---|---|
| Cowork（Claude Desktop） | Planner + 记忆维护 | `new` / `planning` / `done` |
| Claude CLI（Claude Code） | Generator（实现 + 修复） | `building` / `fixing` |
| Codex | Evaluator（验收 + 复验） | `verifying` / `reverifying` |

## 启动流程（每次必须按顺序执行）

### 第零步：清缓存，读最新文件
**每次启动，必须从磁盘重新读取以下文件，不得使用任何缓存版本：**
- `progress.json` — 当前阶段和进度
- `features.json` — 功能列表和状态
- `harness-rules.md` — 本文件自身
- `.auto-memory/MEMORY.md` — 项目记忆索引（**Cowork 必读**，读完后按需加载 `project-aigcgateway.md` 等记忆文件）

`.auto-memory/` 是唯一的项目记忆源，通过 git 在所有 agent 和 Cowork 之间同步。Cowork 作为 PM，每次会话必须读取最新项目记忆，才能做出准确的规划决策。

多 Agent 并发场景下，缓存版本可能落后于实际状态，导致角色误判或重复工作。

### 第一步：判断阶段
读取 progress.json（已确认为最新版本）：

| status | 执行工具 | 加载文件 | 动作 |
|---|---|---|---|
| `new` | Cowork | planner.md | 拆解需求，生成 features.json，写 spec |
| `planning` | Claude CLI | generator.md | 按功能列表逐条实现 |
| `building` | Claude CLI | generator.md | 继续实现（上次中断时） |
| `verifying` | Codex | evaluator.md | 首轮验收 |
| `fixing` | Claude CLI | generator.md | 根据 evaluator_feedback 修复 |
| `reverifying` | Codex | evaluator.md | 复验，写 signoff 报告 |
| `done` | Cowork | — | 更新记忆，处理 proposed-learnings |

### 第二步：读取对应角色文件
根据阶段加载 planner.md / generator.md / evaluator.md 并严格执行。

### 第三步：完成后更新 progress.json
每个阶段结束后必须更新 progress.json 中的 status 字段，再结束会话。

## 状态流转图

```
new → planning → building → verifying → fixing ⟷ reverifying → done
                                  ↑__________________________|
                                        （有问题继续循环）
```

- `verifying`：首轮，有问题 → `fixing`，全 PASS → `done`
- `fixing`：修复完成 → `reverifying`，fix_rounds +1
- `reverifying`：有问题 → `fixing`，全 PASS → `done`

## 文档目录约定

```
docs/
├── specs/         # Planner 写，Generator 读
├── test-cases/    # Evaluator 读写
├── test-reports/  # Evaluator 在 reverifying→done 时写（硬性要求）
├── archive/       # 历史文档归档
└── adr/           # 可选：架构决策记录
```

## 需求池（backlog.json）

**backlog.json** 是独立于当前批次的需求暂存区。Cowork 在与用户确认需求后，若当前有批次正在执行，将需求写入 backlog.json 而非打断当前批次。

**写入规则（Cowork）：**
- 任意阶段均可向 backlog.json 追加条目
- 条目格式：`{ id, title, description, decisions[], confirmed_at, priority }`
- 写入后告知用户"已加入需求池，等待下一批次安排"

**读取规则（Planner）：**
- 每次新批次启动（status = new）时，必须先读 backlog.json
- 有条目时向用户展示，询问本批次要包含哪些
- 选中的条目并入 features.json，并从 backlog.json 中移除
- 未选条目保留在 backlog.json

## 铁律（任何情况下不得违反）
1. 永远不要一次性生成所有代码，必须分功能逐条实现
2. 每完成一个功能，立即写入 progress.json，不得跳过
3. 上下文窗口剩余不足 20% 时，立即保存进度，结束当前会话
4. 不得自己评估自己的代码质量，评估由 Codex（evaluator.md）完成
5. 每次提交代码前必须确认可以运行，不提交无法运行的代码

## Cowork（Claude）框架提案规则

Cowork 在执行任务过程中，若发现框架值得更新，采用以下两种模式：

- **即时提出**：影响当前决策的、需要用户立即判断的，直接在对话中提出，用户确认后立即更新 `framework/` 文件
- **后台队列**：不紧急的、不影响主线任务的，追加到 `framework/proposed-learnings.md`，在下次用户说「更新项目共享记忆」时一并提出

**不得在未经用户确认的情况下直接修改 `framework/` 其他文件。**

格式（追加到 `framework/proposed-learnings.md`）：

```markdown
## [YYYY-MM-DD] Cowork — 来源：[触发场景简述]

**类型：** 新规律 / 新坑 / 模板修订 / 铁律补充

**内容：** [一句话描述，足够让用户判断是否值得沉淀]

**建议写入：** `framework/README.md` §经验教训 / `framework/harness/xxx.md` / 其他

**状态：** 待确认
```
