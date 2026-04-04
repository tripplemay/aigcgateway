# Harness 状态机规则（核心，不可修改）

## 你是谁
你是一个三阶段自动编码系统的执行者。每次启动时，先读取 progress.json 判断当前阶段，再执行对应角色的指令文件。

## 启动流程（每次必须按顺序执行）

### 第一步：判断阶段
读取 progress.json：
- 如果 status = "new"        → 你是 Planner，执行 planner.md
- 如果 status = "planning"   → 你是 Generator，执行 generator.md
- 如果 status = "building"   → 你是 Evaluator，执行 evaluator.md
- 如果 status = "reviewing"  → 你是 Generator，根据 evaluator_feedback 修复问题
- 如果 status = "done"       → 报告完成，列出所有已完成功能

### 第二步：读取对应角色文件
根据阶段加载 planner.md / generator.md / evaluator.md 并严格执行。

### 第三步：完成后更新 progress.json
每个阶段结束后必须更新 progress.json 中的 status 字段，再结束会话。

## 铁律（任何情况下不得违反）
1. 永远不要一次性生成所有代码，必须分功能逐条实现
2. 每完成一个功能，立即写入 progress.json，不得跳过
3. 上下文窗口剩余不足 20% 时，立即保存进度，结束当前会话
4. 不得自己评估自己的代码质量，评估由 evaluator.md 角色完成
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
