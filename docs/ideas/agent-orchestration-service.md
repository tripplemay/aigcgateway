# Agent Orchestration Service — 产品构想

> 来源：2026-04-08 Richard 与用户的项目管理讨论
> 状态：构想阶段，尚未立项

---

## 背景

AIGC Gateway 项目在开发过程中，逐步建立了一套基于 Planner-Generator-Evaluator 模式的多 agent 协作机制（harness）。这套机制经过十几个批次的实战验证，从 v0.1 演进到 v0.5，已经能够：

- 跨工具协作（Claude CLI + Codex）
- 跨机器运行（通过 git 同步状态）
- 状态机驱动流转（7 状态：new → planning → building → verifying → fixing ⟷ reverifying → done）
- 角色隔离（Generator 和 Evaluator 使用不同工具，保证对抗性验收）

但当前机制的瓶颈在于：每一步状态流转都需要人工启动对应 agent。用户希望实现"只提需求，其他全自动流转"。

## 核心问题

**如何让多个异构 AI agent（不同工具、不同机器）按照预定义的状态机规则自动协作完成软件开发任务？**

## 演进路径讨论

### 方案 1：git 轮询（最简单）

每台机器跑守护进程，定期 git pull 检查状态，轮到自己就启动。

- 优点：零基础设施
- 缺点：延迟高、git 做消息总线脆弱、无并发控制

### 方案 2：公网状态机服务（讨论选定方向）

一个中心化的状态机服务，提供 API，所有 agent 接入受它调度。

- 优点：实时通知、中心化状态（无冲突）、正式的并发控制、可跨项目复用
- 缺点：需要构建和运维一个服务

## 产品定位

**一个 agent-agnostic 的开发项目编排服务。**

- 不是框架（不需要写代码定义流程）
- 不是给人用的 Jira（不需要人拖卡片）
- 是一个托管服务：注册项目、定义状态机规则、接入 agent，agent 通过 API 领任务/提交结果/触发流转

### 与现有产品的区别

| | LangGraph/CrewAI/AutoGen | Jira/Linear | 这个产品 |
|---|---|---|---|
| 性质 | 开发框架 | 人用的项目管理 | agent 用的编排服务 |
| 使用者 | 程序员（写代码定义流程） | 人类项目经理 | AI agent（调 API） |
| agent 绑定 | 绑定自己的 agent 实现 | 不涉及 | agent-agnostic |
| 任务分配 | 代码定义 | 人指派 | 状态机自动派发 |
| 质量控制 | 同一 LLM 多次调用 | 人 review | 跨工具对抗式验收 |

### 独特价值

1. **工具级对抗隔离** — Generator 和 Evaluator 是不同工具/产品，天然防止自我确认偏差
2. **异构 agent 协作** — 不绑定单一 agent 框架，Claude CLI、Codex、未来的任何 AI coding tool 都能接入
3. **声明式状态机** — 规则声明式定义，不需要写编排代码
4. **实战验证** — 模式来自十几个批次的生产实践，不是理论设计

## 核心 API 草案

```
# 项目管理
POST   /api/projects                    — 创建项目
POST   /api/projects/:id/workflows      — 定义状态机规则

# 批次管理
POST   /api/batches                     — Planner 创建批次
GET    /api/batches/:id                 — 获取批次状态
POST   /api/batches/:id/features        — 添加功能项
POST   /api/batches/:id/transition      — 状态流转（服务端校验合法性）

# Agent 协作
POST   /api/agents/register             — agent 注册（声明工具类型、能力）
POST   /api/agents/heartbeat            — 心跳
POST   /api/batches/:id/claim           — 领取任务（带锁）
POST   /api/batches/:id/submit          — 提交结果（handoff / feedback）

# 通知
POST   /api/webhooks                    — 注册 webhook（状态变化时推送）
GET    /api/agents/:id/poll             — 长轮询（备选方案）
```

## 状态机核心规则

来自 harness-rules.md 的实战沉淀：

```
普通批次：
  new → planning → building → verifying → fixing ⟷ reverifying → done

Codex-only 批次（全部 executor:codex）：
  new → planning → verifying → fixing ⟷ reverifying → done
```

- Generator 和 Evaluator 不得为同一 agent
- 状态流转由服务端强制执行，agent 不能跳状态
- 每个功能项有 executor 字段（generator / codex），决定由谁执行
- 任务领取带锁，防止多 agent 重复领取

## 市场调研

截至 2026-04-08，未发现完全对标产品：

- **LangGraph / CrewAI / AutoGen** — 多 agent 编排框架，需写代码，绑定自身 agent 实现
- **Zapier AI / Epicflow** — AI 辅助的人类项目管理工具
- **Anthropic Harness Pattern** — 模式描述（博客文章），非产品
- **Swarms** — 有 issue 要实现 PGE 模式，但尚未落地

**空白点：一个 agent-agnostic 的托管编排服务，支持异构 AI 工具按状态机规则自动协作。**

## 待讨论

- MVP 范围：先支持哪些状态机模式？
- 技术栈：独立服务 vs AIGC Gateway 模块？
- agent 接入协议：REST API vs WebSocket vs 两者都有？
- 身份与权限：agent 如何认证？如何防止伪造身份？
- 多项目支持：一个 agent 能否参与多个项目？
- 可观测性：批次进度、agent 状态、流转历史的可视化
- 计费模式：按项目？按批次？按 agent 数量？

## 参考资料

- [Anthropic - Harness design for long-running application development](https://www.anthropic.com/engineering/harness-design-long-running-apps)
- [MindStudio - Planner-Generator-Evaluator Pattern](https://www.mindstudio.ai/blog/planner-generator-evaluator-pattern-gan-inspired-ai-coding)
- [Swarms - Implement PGE Harness (GitHub Issue)](https://github.com/kyegomez/swarms/issues/1500)
- [Microsoft - AI Agent Orchestration Patterns](https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/ai-agent-design-patterns)
