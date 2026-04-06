# Harness 状态机规则（核心，不可修改）

## 你是谁
你是一个多工具协作编码系统的执行者。每次启动时，先读取 progress.json 判断当前阶段，再执行对应角色的指令文件。

## 工具与角色对应

两个工具通过 `progress.json` 交接，不直接通信：

| 工具 | 角色 | 负责阶段 |
|---|---|---|
| Claude CLI（Claude Code） | Planner + Generator（需求拆解 + 功能实现 + 修复 + 记忆维护） | `new` / `planning` / `building` / `fixing` / `done` |
| Codex | Evaluator（测试设计 + 执行 + 验收 + 复验） | `verifying` / `reverifying` |

**职责边界说明：**
- Claude CLI 负责全流程：需求拆解、规格文档、功能实现、修复、记忆维护。不写任何测试。
- Codex 拥有完整的「测试域」——设计测试用例、编写测试脚本、执行测试、分析结果、输出报告。

## Feature 执行者（executor）

features.json 中每条功能必须声明 `executor` 字段：

| executor 值 | 含义 | 由谁执行 | 执行阶段 |
|---|---|---|---|
| `"generator"` | 代码实现类（默认值） | Claude CLI | `building` |
| `"codex"` | 执行 / 评估类 | Codex | `verifying` |

**executor:codex 的适用场景：** 压力测试执行、code review、安全审计、E2E 测试运行、性能分析报告。
这类任务的交付物是"结果报告"而非代码，由 Generator 提供工具/脚本，Codex 操作工具产出结论。

## 批次类型

| 批次类型 | 特征 | 状态流转 |
|---|---|---|
| 普通批次 | 全部 `executor:generator` | `planning → building → verifying → done` |
| 混合批次 | 部分 `generator`，部分 `codex` | `planning → building → verifying → done` |
| Codex-only 批次 | 全部 `executor:codex` | `planning → verifying → done`（跳过 building） |

**判断规则（Planner 在 planning 末尾执行）：**
- features.json 中存在任意一条 `executor:generator` → status 设为 `building`
- features.json 中全部为 `executor:codex` → status 直接设为 `verifying`（Codex-only 批次）

## 启动流程（每次必须按顺序执行）

### 第零步：同步远端，读最新文件

**第一：先从远端拉取最新代码（所有 agent 通用）**

```bash
git pull --ff-only origin main
```

`progress.json`、`features.json`、`.auto-memory/`、`harness-rules.md` 等状态机文件均通过 git 在所有 agent 之间同步。不先拉取，读到的可能是其他 agent 推送之前的旧状态，导致阶段误判或重复工作。

> 同机场景下此命令输出 `Already up to date.`，无副作用，仍需执行。

**第二：从磁盘重新读取以下文件，不得使用任何缓存版本：**
- `progress.json` — 当前阶段和进度
- `features.json` — 功能列表和状态
- `harness-rules.md` — 本文件自身
- `.auto-memory/MEMORY.md` — 项目记忆索引（**所有 agent 必读**，读完后按需加载 `project-aigcgateway.md` 等记忆文件）

### 第一步：识别身份
读取项目根目录 `.agent-id` 文件（如存在），获取当前 agent 的身份标识（如 `local`、`remote-builder-1`）。文件不存在则 myId = null。

### 第二步：判断阶段与角色

读取 progress.json（已确认为最新版本），获取 `status` 和 `role_assignments`。

**角色判断逻辑：**

```
如果 role_assignments 不存在或为 null：
  → 按默认映射执行（Claude CLI = planner + generator，Codex = evaluator）

如果 role_assignments 存在：
  如果 myId = null（未配置 .agent-id）：
    → 不主动执行任何角色，告知用户"检测到 role_assignments 但未配置 .agent-id，请先创建"
  如果 myId 有值：
    → 匹配 role_assignments 中的角色，加载对应角色文件
    → myId 不在当前阶段对应角色中 → 告知用户"本阶段工作已分配给其他 agent（{对应 agent-id}）"，等待指令
```

**默认映射（无 role_assignments 时）：**

| status | 执行工具 | 加载文件 | 动作 |
|---|---|---|---|
| `new` | Claude CLI | planner.md | 拆解需求，生成 features.json，写 spec |
| `planning` | Claude CLI | planner.md | 继续 planning（上次中断时） |
| `building` | Claude CLI | generator.md | 按功能列表逐条实现 |
| `verifying` | Codex | evaluator.md | 首轮验收 |
| `fixing` | Claude CLI | generator.md | 根据 evaluator_feedback 修复 |
| `reverifying` | Codex | evaluator.md | 复验，写 signoff 报告 |
| `done` | Claude CLI | planner.md | 更新记忆，处理 proposed-learnings，询问下一批次 |

**阶段与角色的对应关系：**

| 阶段 | 需要的角色 |
|---|---|
| `new` / `planning` / `done` | planner |
| `building` / `fixing` | generator |
| `verifying` / `reverifying` | evaluator |

### 第三步：读取对应角色文件
根据第二步的判断结果加载 planner.md / generator.md / evaluator.md 并严格执行。

### 第三步：完成后更新 progress.json
每个阶段结束后必须更新 progress.json 中的 status 字段，再结束会话。

## 状态流转图

```
普通批次 / 混合批次：
  new → planning → building → verifying → fixing ⟷ reverifying → done
                                    ↑__________________________|
                                          （有问题继续循环）

Codex-only 批次（全部 executor:codex）：
  new → planning → verifying → fixing ⟷ reverifying → done
                      ↑___________________________|
```

- `planning → building`：仅当存在 `executor:generator` 的功能时
- `planning → verifying`：当全部功能均为 `executor:codex` 时（跳过 building）
- `verifying`：首轮，有问题 → `fixing`，全 PASS → `done`
- `fixing`：修复完成 → `reverifying`，fix_rounds +1
- `reverifying`：有问题 → `fixing`，全 PASS → `done`

## 文档目录约定

```
docs/
├── specs/                  # Planner 写，Generator 读
├── test-cases/             # Evaluator 读写
├── test-reports/           # Evaluator 在 reverifying→done 时写（硬性要求）
│   └── user_report/        # 用户反馈报告（Planner 在新批次启动时必读）
├── archive/                # 历史文档归档
└── adr/                    # 可选：架构决策记录
```

## 需求池（backlog.json）

**backlog.json** 是独立于当前批次的需求暂存区。Claude CLI 在与用户确认需求后，若当前有批次正在执行，将需求写入 backlog.json 而非打断当前批次。

**写入规则（Claude CLI）：**
- 任意阶段均可向 backlog.json 追加条目
- 条目格式：`{ id, title, description, decisions[], confirmed_at, priority }`
- 写入后告知用户"已加入需求池，等待下一批次安排"

**读取规则（Planner）：**
- 每次新批次启动（status = new）时，必须先读 backlog.json
- 有条目时向用户展示，询问本批次要包含哪些
- 选中的条目并入 features.json，并从 backlog.json 中移除
- 未选条目保留在 backlog.json

## 分支规则

项目使用单一 `main` 分支：

| 操作 | 执行者 | 说明 |
|---|---|---|
| `git push origin main` | Claude CLI | 触发 CI（lint + tsc），不自动部署 |
| 手动触发 Deploy workflow | 用户 | Codex 验收通过后，在 GitHub Actions 手动点击触发部署 |

```bash
# Generator 的标准提交流程
git add <files>
git commit -m "..."
git push origin main         # 触发 CI，不触发部署
```

进度类文件（progress.json / features.json / .auto-memory/ 等）推 `main` 不触发 CI（paths-ignore 已配置）。

## 角色动态分配（role_assignments）

支持在 progress.json 中按批次指定角色分配，覆盖默认映射。

**字段格式（progress.json）：**
```json
{
  "role_assignments": {
    "planner": "local",
    "generator": "remote-builder-1",
    "evaluator": "codex-1"
  }
}
```

**约束规则：**
- generator 和 evaluator 不得为同一 agent-id（不能自己评估自己的代码）
- planner 可与任何角色重叠
- 当前阶段（方向 B）：Codex 只能被分配为 evaluator（AGENTS.md 限制）
- `role_assignments` 为 null 或不存在时，按默认映射执行，完全向后兼容
- done 阶段清除 `role_assignments`

**适用边界：**
- 跨机器多 agent：各机器配不同 `.agent-id`，通过 `role_assignments` 分工 → 支持
- 同机器多实例：共享同一 `.agent-id`，harness 无法区分 → 由用户在对话中口头指定

## 铁律（任何情况下不得违反）
1. 永远不要一次性生成所有代码，必须分功能逐条实现
2. 每完成一个功能，立即写入 progress.json，不得跳过
3. 上下文窗口剩余不足 20% 时，立即保存进度，结束当前会话
4. 不得自己评估自己的代码质量，评估由 Codex（evaluator.md）完成
5. 每次提交代码前必须确认可以运行，不提交无法运行的代码
6. Generator 不得执行 `executor:codex` 的功能；Codex 不得实现 `executor:generator` 的功能
7. 压测执行、code review、安全审计等"产出报告"类任务，必须标注 `executor:codex`
8. `role_assignments` 存在时，agent 只执行分配给自己的角色，不越界

## 框架提案规则

Claude CLI 在执行任务过程中，若发现框架值得更新，采用以下两种模式：

- **即时提出**：影响当前决策的、需要用户立即判断的，直接在对话中提出，用户确认后立即更新 `framework/` 文件
- **后台队列**：不紧急的、不影响主线任务的，追加到 `framework/proposed-learnings.md`，在 `done` 阶段一并提出

**不得在未经用户确认的情况下直接修改 `framework/` 其他文件。**

格式（追加到 `framework/proposed-learnings.md`）：

```markdown
## [YYYY-MM-DD] Claude CLI — 来源：[触发场景简述]

**类型：** 新规律 / 新坑 / 模板修订 / 铁律补充

**内容：** [一句话描述，足够让用户判断是否值得沉淀]

**建议写入：** `framework/README.md` §经验教训 / `framework/harness/xxx.md` / 其他

**状态：** 待确认
```
