# My Harness v2 — 三 Agent 自动编码框架

## 与 v1 的区别
Harness 核心规则独立存放在 `harness-rules.md`，`CLAUDE.md` 通过 `@` 引用它。
这样即使使用 `/init` 命令更新了 `CLAUDE.md`，Harness 状态机规则也不会丢失。

## 开箱即用

### 前置：安装 Claude Code（只需一次）
```bash
npm install -g @anthropic-ai/claude-code
```

### 启动
```bash
cd my-harness-v2
claude
```
启动后直接说你想做什么即可。

## 安全使用 /init
项目开发中途可以放心运行 `/init`：
- Claude Code 会在 `CLAUDE.md` 下方追加项目信息（构建命令、目录结构等）
- `@harness-rules.md` 那一行会保留，Harness 规则不受影响
- 如果追加内容太多，手动清理 `CLAUDE.md` 下半部分即可，上方引用行不要动

## 文件说明

| 文件 | 作用 | 可被 /init 修改？ |
|------|------|-----------------|
| `harness-rules.md` | Harness 状态机核心，永不修改 | 否（/init 不会碰它）|
| `CLAUDE.md` | 入口，引用 harness-rules.md | 可以，但引用行会保留 |
| `planner.md` | Planner 角色指令 | 否 |
| `generator.md` | Generator 角色指令 | 否 |
| `evaluator.md` | Evaluator 角色指令 | 否 |
| `progress.json` | 跨会话记忆 | 否（由 Agent 自动维护）|
| `features.json` | 功能任务清单 | 否（由 Planner 生成）|
| `src/` | 项目代码 | 是（Generator 在这里写代码）|

## 三个 Agent 的触发条件

| Agent | progress.json status | 职责 |
|-------|----------------------|------|
| Planner | `new` | 理解需求，拆解功能列表 |
| Generator | `planning` 或 `reviewing` | 逐条实现功能 |
| Evaluator | `building` | 独立质检，发现问题回退 |

## 重置项目
```bash
# 恢复 progress.json
echo '{"status":"new","user_goal":"","total_features":0,"completed_features":0,"current_sprint":null,"last_updated":"","evaluator_feedback":null}' > progress.json

# 清空功能列表
echo '{"features":[]}' > features.json

# 清空代码
rm -rf src/* && touch src/.gitkeep
```
