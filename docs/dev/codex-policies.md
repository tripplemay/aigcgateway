# Codex 策略参考文档

> 按需查阅。AGENTS.md 中的核心规则已精简，详细策略和模板在此。

## 生产环境测试策略

### 测试开关

当前生效值（由用户在 AGENTS.md 中维护）：

- `PRODUCTION_STAGE=RND`
- `PRODUCTION_DB_WRITE=ALLOW`
- `HIGH_COST_OPS=ALLOW`

### 判定规则

**LIVE 阶段：** 只允许只读验证。即使 DB_WRITE=ALLOW 或 HIGH_COST=ALLOW，也必须对具体动作单独获取用户授权。

**RND + DB_WRITE=DENY：** 允许只读验证，禁止任何写入。HIGH_COST=ALLOW 时仅允许无副作用的高成本验证。

**RND + DB_WRITE=ALLOW：** 可执行受控的最小必要生产写入测试。HIGH_COST=ALLOW 时可执行高成本操作。但删除、批量修改、支付扣费、外部通知、不可逆操作仍默认禁止，需用户再次授权。

### 高成本操作定义

高 token 消耗模型调用、批量生成/评测/分析、高计费第三方 API、大规模抓取/转换/导出、长时运行任务。

### 始终需要单独授权的高风险动作

即使全部开关都是 ALLOW：删除数据、批量修改正式业务数据、不可逆变更、支付/充值/扣费、对外发送通知、影响其他用户、污染统计。

## 禁止修改范围（详细列表）

`src/`、`components/`、`prisma/`、`sdk/src/`、`package.json`、`package-lock.json`、`tsconfig.json`、`.env*`、`Dockerfile`、`docker-compose*.yml`、`next.config.*`、`README.md`、`AGENTS.md`、`CLAUDE.md`

## Git 操作边界

### 允许
`git status`、`git diff`、`git log`、`git show`、`git branch`、`git rev-parse`、`git fetch`、`git pull --ff-only origin main`、`git switch <existing-branch>`

### 状态机文件提交（显式授权）
```bash
git add progress.json features.json docs/test-reports/ docs/test-cases/ .auto-memory/
git commit -m "test: verifying/reverifying 阶段产物（[批次名]）"
git push origin main
```
严禁在同一 commit 中包含产品代码文件。

### 禁止
`git merge`（除 ff-only 同步外）、`git rebase`、`git cherry-pick`、`git stash`、`git reset`、`git clean`、`git checkout -- <file>`、任何改写提交历史的操作。

## 缺陷报告模板

标题 / 环境 / 前置条件 / 复现步骤 / 实际结果 / 预期结果 / 证据 / 影响范围 / 严重级别 / 是否稳定复现 / 备注

## 验收报告模板

测试目标 / 测试环境 / 测试范围 / 执行步骤概述 / 通过项 / 失败项 / 风险项 / 证据链接 / 最终结论

未执行的验证项必须明确写出原因，不得留空。

## 文档目录（Codex 视角）

```
docs/
├── specs/          # 技术规格 — 理解被测系统行为时参考
├── test-cases/     # ← Codex 主要输入
├── test-reports/   # ← Codex 主要输出
├── provider/       # 服务商差异参考
└── archive/        # 历史，无需阅读
```
