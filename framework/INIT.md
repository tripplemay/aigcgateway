# INIT — Triad Workflow 项目初始化引导（给 Claude CLI）

> 这是给 Claude CLI 的一次性初始化指令。用户已运行过 `bootstrap.sh`，文件骨架就位但含占位符。
> 你的任务：通过提问收集信息 → 展示填充计划 → 用户确认 → 执行填充 → 首次 commit → 删除本文件。

---

## 步骤 1：向用户收集 6 项信息（按顺序问，不要一次性全问）

1. **项目名称 + 一句话描述**
   例：`AIGC Gateway — AI 服务商聚合与管理中台`

2. **技术栈**
   例：`Next.js 14 (App Router) + TypeScript + PostgreSQL + Prisma + Redis`

3. **常用命令 4 条**
   - 开发启动（如 `npm run dev`）
   - 构建（如 `npm run build`）
   - Lint（如 `npm run lint`）
   - 类型检查（如 `npx tsc --noEmit`）
   - 可选：测试、数据库迁移等额外命令

4. **生产环境信息**（可选，无则填 `TBD`）
   - 控制台 URL
   - API URL
   - 生产服务器 SSH 登录方式（如 `ssh user@ip`）
   - 部署路径、启动方式（PM2 / systemd / docker）
   - 测试账号（Admin / Developer 的 email + 密码，API Key）

5. **当前 agent 身份**
   - 本机 Claude CLI 的 agent 名（例：`Kimi` / `Mark` / `Richard`）
   - 本机 Codex 的 agent 名（例：`Reviewer` / `Sammi`；如暂不使用 Codex 则填 `null`）

6. **用户偏好**
   - 沟通语言（中文 / 英文）
   - 技术背景简述（后端 10 年 / 前端 3 年 / 独立开发者 等）
   - 回复偏好（简洁直接 / 详细解释 等）

---

## 步骤 2：展示填充计划（必须等用户确认再执行）

向用户展示"我将修改以下文件"：

| 文件 | 将写入 |
|---|---|
| `CLAUDE.md` | 项目名、Tech Stack、Commands（基于用户提供的 4 条命令） |
| `AGENTS.md` | 如用户无 Codex，标注"本项目暂不使用 Codex"；有则保留默认 |
| `.auto-memory/project-status.md` | 初始化：尚未开始首批次，已知 gap 为空 |
| `.auto-memory/environment.md` | 生产地址、服务器、测试账号（无则填 TBD） |
| `.auto-memory/user-role.md` | 用户信息（技术栈、沟通语言、偏好） |
| `.agent-id`（新建） | `cli: <CLI 名>\ncodex: <Codex 名或 null>` |

用户确认后再进入步骤 3。

---

## 步骤 3：执行填充

用 **Edit** 工具精确替换占位符，不要整体覆盖文件（保留文件结构，只改占位符部分）。

**关键点：**

- **`.agent-id`** 新建文件，格式严格如下（注意冒号后有空格，按工具类型分行）：
  ```
  cli: <CLI agent 名>
  codex: <Codex agent 名>
  ```
  如果用户无 Codex，codex 行仍保留但留空（不写 `null` 字符串）。

- **`CLAUDE.md` 的 Commands 章节**：
  把用户提供的 4 条命令完整贴入。如果用户技术栈不是 Next.js（如 Python/Go），**删除模板中的 Next.js 特定说明**（如 `rm -rf .next`）。

- **`AGENTS.md` 的生产测试开关**（§4）：
  - `PRODUCTION_STAGE=` 默认填 `RND`
  - `PRODUCTION_DB_WRITE=` 默认填 `DENY`
  - `HIGH_COST_OPS=` 默认填 `DENY`
  - 用户明确说允许才改成 `ALLOW` / `LIVE`

- **`.auto-memory/project-status.md`** 初始模板：
  ```
  ## 当前批次
  - 尚未开始首批次

  ## 已知 gap（非阻塞）
  - （暂无）
  ```

- **`.auto-memory/environment.md`**：保留模板结构，按用户提供的内容填。无则保留占位符或填 `TBD`。

- **`.auto-memory/user-role.md`**：按用户描述填充，用 1-2 句描述用户身份 + 3-5 条偏好 bullets。

---

## 步骤 4：首次 commit

```bash
git init
git add .
git commit -m "chore: init project with Triad Workflow v0.7.x"
```

如果用户指定了 GitHub remote，可以提示：
```bash
git remote add origin git@github.com:USERNAME/REPO.git
git push -u origin main
```
但**不要**未经用户确认就 push。

---

## 步骤 5：清理一次性工件

```bash
rm INIT.md
# bootstrap.sh 已由 bootstrap 自身移到 framework/，可选：rm framework/bootstrap.sh
```

---

## 步骤 6：告知用户下一步

告诉用户：

- ✓ 项目骨架已就绪，进入 Harness 状态机管理
- 如还没连 GitHub remote，提醒：`git remote add origin <URL>`
- 接下来开启第一个批次：
  - 说"根据 harness 规则，我要开发 [第一个需求]"
  - Claude CLI 会读取 `progress.json`（status=new）→ 加载 `planner.md` → 进入 Planner 模式
  - 你也可以先把需求暂存到 `backlog.json`，等熟悉流程后再开工

---

## 重要原则

- **不擅自编造信息**：用户没提供的（尤其是生产 URL / 测试账号 / 密码），宁可留 `TBD` 也不要编
- **用 Edit 精确替换**：只改占位符部分，不重写整个文件
- **技术栈差异处理**：如果用户是 Python / Go / Rust / Swift 项目，把 `CLAUDE.md` / `AGENTS.md` 中 Next.js 特定内容（`.next/`、`npx prisma` 等）删除或替换为对应命令
- **先计划再执行**：步骤 2 必须等用户确认，避免填错回滚
- **保持节奏**：6 个问题顺序问，不要一次塞给用户过多
