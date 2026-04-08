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

## 核心能力：质量智能 + 决策审计链 + 人类决策点

> 来源：2026-04-08~09 讨论，优先级排序后确认的三项核心差异化能力

### 三者关系

```
审计链（底层）— 所有事件记录在这里
  ↓
质量智能（分析层）— 从审计链中提取模式、生成洞察、注入检查项
  ↓
人类决策点（交互层）— 带着质量洞察通知用户，用户决策后写入审计链
```

### 决策审计链

不可变事件流，只增不改。

**数据模型：**

```sql
CREATE TABLE audit_events (
  id          SERIAL PRIMARY KEY,
  batch_id    TEXT NOT NULL,
  timestamp   TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_type  TEXT NOT NULL,  -- 'agent' | 'human' | 'system'
  actor_id    TEXT NOT NULL,
  event_type  TEXT NOT NULL,
  payload     JSONB NOT NULL
);
```

**事件类型：**

| event_type | actor | payload |
|---|---|---|
| `batch.created` | human | {goal, features_count} |
| `batch.transition` | system | {from, to} |
| `feature.claimed` | agent | {feature_id, agent_id} |
| `feature.completed` | agent | {feature_id, files_changed} |
| `review.submitted` | agent/human | {round, pass_count, fail_count, issues} |
| `fix.submitted` | agent | {round, fixes} |
| `batch.approved` | human | {comment} |
| `batch.done` | system | {total_rounds, duration_hours} |

**API：**

```
GET /api/batches/:id/audit?actor=X&event_type=review.*&from=T
```

### 质量智能

**数据采集 — 验收时结构化记录失败原因：**

Evaluator（agent 或人类）提交 FAIL 时必须带分类：

| category | 含义 |
|---|---|
| `i18n` | 国际化问题 |
| `missing_feature` | 功能缺失 |
| `visual_mismatch` | 视觉不一致 |
| `api_error` | API 调用错误 |
| `type_error` | 类型/编译错误 |
| `regression` | 回归 bug |

| root_cause | 含义 |
|---|---|
| `hardcoded_string` | 硬编码文本 |
| `spec_misread` | 误读规格 |
| `design_ignored` | 未看 DESIGN.md |
| `edge_case` | 边界情况遗漏 |
| `dependency_issue` | 依赖问题 |

**分析输出 — agent 质量报告：**

```
=== Generator "Johnsong" 质量报告 ===
参与批次: 8 | 平均修复轮次: 2.1 | 首轮通过率: 38%
Top 失败原因: i18n/hardcoded_string (45%), missing_feature/spec_misread (26%)
趋势: i18n 失败率从 batch 5 起下降（加入自检清单后）
```

**前置注入 — 发任务时自动增强 acceptance：**

服务端检查历史失败模式，自动追加检查项到 feature：

```json
{
  "auto_injected_checks": [
    "⚠️ 历史高频失败项：确认所有 placeholder/breadcrumb/状态标签走 i18n（来源：R2A 连续 3 轮 FAIL）"
  ]
}
```

### 人类决策点

**在 workflow 中声明式定义：**

```json
{
  "planning": {
    "on_complete": {
      "human_gate": {
        "required": true,
        "action": "approve_spec",
        "prompt": "请确认 spec 和 features 拆分是否合理",
        "timeout_hours": 24,
        "notify_via": ["webhook"]
      }
    }
  },
  "building": {
    "on_complete": { "auto_transition": "verifying" }
  },
  "done": {
    "on_complete": {
      "human_gate": {
        "required": true,
        "action": "confirm_next_batch",
        "prompt": "R2A 已完成（9/9 PASS，4 轮修复）。是否启动 R2B？",
        "options": ["start_next", "pause", "custom"],
        "notify_via": ["webhook", "email"]
      }
    }
  }
}
```

**通知内容带质量洞察：**

```json
{
  "type": "human_gate_reached",
  "batch_id": "R2A",
  "context": {
    "result": "9/9 PASS",
    "fix_rounds": 4,
    "quality_insights": ["i18n 硬编码导致 3 轮额外修复，建议下批次前置自检"]
  },
  "actions": [
    {"id": "start_next", "label": "启动下一批"},
    {"id": "pause", "label": "暂停"}
  ],
  "respond_url": "https://api.orchestrator.io/batches/R2A/human-decision"
}
```

### 其他能力（中优先级）

| 能力 | 说明 |
|---|---|
| **Artifact 管理** | Batch → Spec → Features → Artifacts（设计稿、测试报告、签收报告），每个 artifact 有来源和关联 |
| **成本可见性** | 每个 agent 每次运行消耗的 token，按批次/轮次聚合。量化"减少一轮修复能省多少钱" |
| **Agent 能力画像** | 历史表现统计（首轮通过率、擅长/薄弱领域），支持 Planner 智能分配 |

## 人类参与者支持

> 来源：2026-04-09 讨论，解决"人类 Evaluator 加入是否影响链路可靠性"

### 核心问题

Agent 和人类的工作方式有本质差异：

| | Agent Evaluator | 人类 Evaluator |
|---|---|---|
| 输出格式 | 结构化 JSON | 自然语言、截图、口头反馈 |
| 粒度 | 逐条 acceptance 机械检查 | 整体感觉，可能跳过项 |
| 一致性 | 每次同样标准 | 受主观因素影响 |
| 强项 | 功能正确性、i18n、API | 视觉、体验、"这里不对劲" |

### 解决方案：翻译层 + 混合验收

**原则：不要求人类适应系统，让系统适应人类。**

**1. 翻译层 — 人类自由反馈 → 结构化数据**

```
人类输入: "balance 页面充值弹窗的金额按钮间距太大了，settings 密码修改成功没提示"

翻译层输出:
[
  { feature_id: "F-R2B-02", result: "FAIL", category: "visual_mismatch", confidence: 0.9 },
  { feature_id: "F-R2B-04", result: "FAIL", category: "missing_feature", confidence: 0.85 }
]
→ 回给人类确认后提交到状态机
```

**2. 混合验收 — agent 和人类各管各的 scope**

```yaml
verifying:
  evaluators:
    - agent: "Reviewer"
      scope: ["functional", "i18n", "api_correctness"]
    - human: true
      scope: ["visual", "ux", "business_logic"]
      timeout_hours: 48
  merge_strategy: "all_must_pass"
```

**3. 可靠性保障机制：**

| 风险 | 应对 |
|---|---|
| 人类反馈不完整 → 修后又冒新问题 | 引导式 checklist 审查（设计稿 vs 实际截图逐项对比） |
| 人类标准不一致 → 同类问题时 PASS 时 FAIL | 审计链检测历史不一致，提醒确认 |
| 人类响应慢 → 链路阻塞 | timeout + 升级通知；可先按 agent 结果流转，人类异步补充 |

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
