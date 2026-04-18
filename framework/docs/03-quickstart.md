# 03 · 开箱即用手册

> 给"我要现在就跑起来"的读者。
> 阅读 + 跟着做约 15 分钟。

---

## 前置条件

| 必需 | 说明 |
|---|---|
| Git | 任意版本 |
| Node.js | 用 `npx degit` 拉取模板 |
| Claude CLI | 运行 Claude Code（`claude` 命令） |
| GitHub 账号 | 如需推送到 remote |

| 推荐但不必需 | 说明 |
|---|---|
| Codex CLI | 担任 Evaluator 角色；无 Codex 时可让 Claude CLI 在独立会话里扮演 Evaluator（通过切换 agent-id） |
| `gh` CLI | 方便检查 CI 状态、创建 repo |

---

## 3 步初始化

### 第 1 步：拉取模板

```bash
npx degit tripplemay/harness-template my-new-project
cd my-new-project
```

拉完目录结构：

```
my-new-project/
├── README.md              # 框架说明（会在 bootstrap 中被替换）
├── INIT.md                # Claude 初始化引导 prompt
├── bootstrap.sh           # 机械装机脚本
├── CHANGELOG.md           # 框架版本历史
├── harness/               # 状态机规则 + 角色文件
├── memory/                # 共享记忆模板
├── templates/             # CLAUDE.md / AGENTS.md 等
└── docs/                  # 框架文档（本目录）
```

### 第 2 步：运行 bootstrap

```bash
bash bootstrap.sh
```

**📹 Bootstrap 演示 GIF 占位：**

> _(GIF 待录制：terminalizer / asciinema 录屏 → 转 GIF，展示 bootstrap 运行过程和目录变化)_
>
> `![bootstrap demo](gifs/bootstrap-demo.gif)`

脚本会自动：
- 把 `harness/` 下的角色文件复制到项目根（`harness-rules.md` / `planner.md` / `generator.md` / `evaluator.md`）
- 从 `memory/` 初始化 `.auto-memory/`（含 T0/T1/T2 分层文件）
- 从 `templates/` 把占位符版本的 `CLAUDE.md` / `AGENTS.md` 复制到根
- 创建初始 `progress.json`（status=new）、空 `features.json`、空 `backlog.json`
- 创建 `docs/specs/` / `docs/test-cases/` / `docs/test-reports/user_report/` / `docs/dev/` 骨架目录
- 配置 `.gitignore`（忽略 `.agent-id` 等）
- 把原 template 源文件（harness/ memory/ templates/ 等）规整到 `framework/` 子目录
- 把 `INIT.md` 留在根目录

运行完后，项目看起来像这样：

```
my-new-project/
├── CLAUDE.md              # 占位符版本，待 Claude 填充
├── AGENTS.md              # 占位符版本
├── harness-rules.md       # 状态机规则（不动）
├── planner.md / generator.md / evaluator.md
├── progress.json          # status=new
├── features.json          # []
├── backlog.json           # []
├── INIT.md                # 待 Claude 读取的初始化 prompt
├── .auto-memory/
│   ├── MEMORY.md
│   ├── project-status.md  # 占位符
│   ├── environment.md     # 占位符
│   ├── user-role.md       # 占位符
│   ├── reference-docs.md
│   └── role-context/
├── docs/
│   ├── specs/
│   ├── test-cases/
│   ├── test-reports/user_report/
│   └── dev/
├── .gitignore
└── framework/             # template 源文件（供后续沉淀回流）
    ├── harness/
    ├── memory/
    ├── templates/
    ├── README.md          # Triad Workflow 完整文档
    ├── CHANGELOG.md
    ├── INIT.md            # （被拷贝了一份到根目录）
    ├── bootstrap.sh       # （完成后挪到这里）
    ├── archive/
    └── proposed-learnings.md
```

### 第 3 步：Claude 初始化

在项目根目录打开 Claude CLI（`claude`），告诉它：

> "按 INIT.md 初始化项目"

**📹 Claude INIT 演示 GIF 占位：**

> _(GIF 待录制：展示 Claude 提出 6 个问题、用户回答、Claude 填充文件、首次 commit 的过程)_
>
> `![claude init demo](gifs/claude-init-demo.gif)`

Claude 会按 [`INIT.md`](../INIT.md) 指引：

1. **问 6 个问题**（一次问一个，不会一下塞过来）：
   - 项目名 + 一句话描述
   - 技术栈
   - 常用命令（dev / build / lint / typecheck）
   - 生产环境信息（可选，无则填 TBD）
   - 当前 agent 身份（`cli: XXX` / `codex: YYY`）
   - 用户偏好（语言、背景、风格）

2. **展示填充计划**，等你确认

3. **用 Edit 精确替换占位符**，自动填好：
   - `CLAUDE.md`：项目概况 + 命令
   - `AGENTS.md`：生产测试开关
   - `.auto-memory/project-status.md`：初始批次状态
   - `.auto-memory/environment.md`：环境信息
   - `.auto-memory/user-role.md`：用户画像
   - `.agent-id`（新建）：本机身份

4. **首次 commit** + 删除 `INIT.md`：
   ```bash
   git init
   git add .
   git commit -m "chore: init project with Triad Workflow v0.7.x"
   ```

5. **告知下一步**：连 GitHub remote、开始第一个批次

---

## 第一个批次实战

假设你想开发一个"用户签到积分系统"，以下是完整流程：

### Step 1：启动 Planner

在 Claude CLI 说：

> "根据 harness 规则，我要开发一个用户签到积分系统。每日签到得 10 积分，连续签到 7 天额外奖励 50 积分，积分可兑换功能点"

Claude CLI 读取 progress.json（status=new）→ 加载 `planner.md` → 进入 **Planner 模式**。

Planner 会：
1. 读取 `.auto-memory/MEMORY.md`、`project-status.md`、`environment.md`
2. 读取 `docs/test-reports/user_report/`（用户反馈）+ `backlog.json`（需求池）—— 新项目都是空
3. 向你确认需求细节（可能问："积分有过期时间吗？"、"签到时机是每天 0 点还是用户首次访问？"）
4. 写 `docs/specs/checkin-points-spec.md`
5. 生成 `features.json`，大致长这样：
   ```json
   {
     "sprint": "checkin-points",
     "features": [
       {"id": "F01", "title": "数据库 schema：CheckinRecord 和 PointsBalance 表", "executor": "generator", ...},
       {"id": "F02", "title": "API：POST /api/checkin 签到", "executor": "generator", ...},
       {"id": "F03", "title": "API：GET /api/points/balance 查询积分", "executor": "generator", ...},
       {"id": "F04", "title": "连续签到逻辑 + 7 天奖励", "executor": "generator", ...},
       {"id": "F05", "title": "E2E 验收：签到 / 连续签到 / 积分查询全链路", "executor": "codex", ...}
     ]
   }
   ```
6. 把 status 改为 `building`，提示你重启 Claude CLI 或继续新会话

### Step 2：Generator 实现

在一个**新的** Claude CLI 会话里启动（上下文干净），Claude 读 progress.json 发现 status=building → 加载 `generator.md` → 进入 **Generator 模式**。

Generator 会：
1. 读 features.json，找第一条 `executor:generator` 且 status=pending 的 feature（F01）
2. 读 `docs/specs/checkin-points-spec.md` 了解实现约束
3. 实现 F01 的代码
4. 自测可运行
5. 更新 features.json（F01 → completed）+ progress.json（completed_features +1）
6. `git push origin main`
7. **`gh run list --limit 3 --branch main` 检查 CI** —— 红色立即停止，修复后再继续
8. 绿灯后继续 F02
9. 循环直到所有 `executor:generator` 完成 → status = `verifying`

**上下文管理：** 每完成一个功能后 Generator 会检查上下文，剩余 < 20% 就保存进度 + 让你重启。

### Step 3：Evaluator 验收

切换到 Codex（或在另一个独立 Claude 会话里以 Evaluator 身份）。Codex 读 progress.json 发现 status=verifying → 加载 `evaluator.md` → 进入 **Evaluator 模式**。

Evaluator 会：
1. 读 features.json + .auto-memory/
2. 设计测试用例 → 可选写 `docs/test-cases/checkin-points-cases.md`
3. 执行 F05（executor:codex）：跑 E2E 测试
4. 逐条验证 F01-F04 的 acceptance
5. 产出结果：

**场景 A：全 PASS**
- 写 `docs/test-reports/checkin-points-signoff-YYYY-MM-DD.md`
- progress.json：
  - status = `done`
  - docs.signoff 填入文件路径
- 交回 Planner

**场景 B：F04 FAIL（连续 7 天奖励逻辑错误）**
- progress.json：
  - status = `fixing`
  - evaluator_feedback 填入：
    ```json
    {
      "summary": "主体功能可用，F04 连续签到奖励逻辑有 bug",
      "pass_count": 3,
      "partial_count": 0,
      "fail_count": 1,
      "issues": [
        {
          "feature_id": "F04",
          "result": "FAIL",
          "description": "第 7 天签到后奖励计入了 50 分，但第 8 天起又重置了 streak，下次 7 天又奖励 50 → 用户可以无限刷",
          "steps_to_reproduce": "签到 7 天 → 签到 8 天 → 连续签到计数应保持 8，而不是重置"
        }
      ]
    }
    ```
- F04 的 status 改回 `pending`，等 Generator 修复

### Step 4：修复循环（如有问题）

Generator 读 progress.json（status=fixing）→ 加载 `generator.md` 的 fixing 模式：
1. 读 evaluator_feedback
2. 针对 F04 修复
3. **同 commit 补 regression test**（修复 critical/high 的铁律）
4. status = `reverifying`，fix_rounds +1

Evaluator 复验：
- 再次全 PASS → 写 signoff → status = `done`
- 仍有问题 → status = `fixing` 继续循环

### Step 5：Planner 收尾

status = `done` 时 Planner 被触发：
1. 校验 `.auto-memory/project-status.md` 是否反映批次完成
2. 处理 `framework/proposed-learnings.md`（有无新经验需要沉淀）
3. 清除 `role_assignments`
4. 问你："批次已归档，要开始下一批次吗？"

**至此完成一个完整批次。**

---

## 常见问题

### Q1：如果我只有 Claude CLI，没有 Codex 怎么办？

可以让 Claude CLI 在**独立会话**扮演 Evaluator（通过修改 `.agent-id` 的 `codex:` 行为临时名，切回来时恢复）。但这样失去了"独立工具视角"的优势，建议逐步接入 Codex 或其他 AI agent。

### Q2：为什么每个阶段要新开会话？同一会话不行吗？

技术上可以，但不推荐：
- 上下文累积会很快爆炸
- 角色混淆风险（在 Generator 身份下不小心跑了 Evaluator 的逻辑）
- 状态机的优势之一就是"每会话只关心一个阶段"，违背这点就失去价值

### Q3：如果 Generator 实现到一半上下文满了？

没问题，这是框架设计考虑到的：
1. Generator 完成最后一个功能就保存 progress.json，告诉你"上下文不足，请重启"
2. 你重启 Claude CLI
3. 新会话读 progress.json → 发现仍在 building → 读 features.json → 找到下一条 pending → 继续

### Q4：我不想用 features.json 这么严格，能简化吗？

短批次（1-2 个功能）可以把 features 写得宽松，但依然建议写出来。features.json 是 Evaluator 逐条验收的依据，缺了它 Evaluator 不知道验什么标准。

**极简版示例：**
```json
{
  "sprint": "add-dark-mode",
  "features": [
    {"id": "F01", "title": "加暗色模式切换", "priority": "high", "executor": "generator", "status": "pending", "acceptance": "右上角有月亮图标，点击切换，切换后保存偏好到 localStorage"}
  ]
}
```

### Q5：bug 修复批次也要写 spec 吗？

可以省略（`docs.spec` 填 null）。features.json 的 acceptance 标准就是 Generator 的实现依据。但如果修复涉及架构变更（超过 3 行代码），建议还是写个简短 spec，避免反复沟通。

### Q6：多台机器怎么同步？

- `.auto-memory/` 入 git，每次会话结束 commit + push
- `.agent-id` 不入 git（本机身份）
- `progress.json` / `features.json` / `backlog.json` 入 git
- 每个 agent 启动时 `git pull --ff-only origin main`
- 其他机器 `git pull` 后即可接续工作

### Q7：CI 红色可以先记录下来晚点修吗？

**不可以**，这是铁律。CI 红色继续开发会让错误层层叠加，越积越难修。每次 push 后必须 `gh run list` 检查，红色立即停止新功能。

### Q8：框架能和已有项目整合吗？

可以，但不推荐用 bootstrap.sh（会覆盖现有文件）。手动拷贝：
1. `git clone` 或 `degit` 到临时目录
2. 手动 cp 需要的文件到现有项目（避开已有 CLAUDE.md、.auto-memory 等）
3. 根据现有项目结构调整

### Q9：Evaluator 反馈后 Generator 觉得反馈错了怎么办？

在 progress.json 的 `session_notes.[Generator名]` 写下"我认为 F-X 的反馈有误，原因是..."，然后**将该 feature 从 fixing 中移出**，让 Planner 介入仲裁。不要 Generator 单方面拒绝反馈。

### Q10：BA 在哪里？需求都是开发自己写 spec 吗？

Triad Workflow 默认单人开发场景，用户 = 产品 + BA。如果有独立的产品/BA，他们可以把需求写到 `backlog.json`（或 `docs/test-reports/user_report/`），Planner 启动新批次时读取。

---

## 下一步

批次跑通后，建议：

- **第二批次**：尝试混合批次（generator + codex 功能并存）
- **第三批次**：尝试 Codex-only 批次（压测 / code review）
- **日常维护**：定期检查 `framework/proposed-learnings.md` 有无沉淀需要处理

---

## 参考

- [01 · 功能介绍](01-concepts.md) — 想了解设计原理
- [02 · 使用方法详解](02-usage.md) — 每个状态、每个角色、每个文件的深入说明
- [CHANGELOG](../CHANGELOG.md) — 版本演进历史
- [GitHub: harness-template](https://github.com/tripplemay/harness-template) — 模板 repo，degit 来源
