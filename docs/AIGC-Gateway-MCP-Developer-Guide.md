# AIGC Gateway — MCP 接入指南

> 通过 MCP（Model Context Protocol）在 AI 编辑器中直接使用 AIGC Gateway 的全部能力。无需编写代码，无需查阅 API 文档。

---

## 什么是 MCP 接入

AIGC Gateway 提供了一个 MCP 服务器，让你的 AI 编辑器（Claude Code、Cursor、Windsurf 等）直接与平台对接。连接后，AI 编辑器可以：

- 查看可用的 AI 模型和价格
- 调用文本和图片生成
- 查看调用日志和审计记录
- 查看项目余额和用量
- 自动生成对接代码

你只需要配置一次，之后在 AI 编辑器中用自然语言就能完成所有操作。

---

## 快速开始

### 前提条件

1. 已注册 AIGC Gateway 账号（[aigc.guangai.ai](https://aigc.guangai.ai)）
2. 已创建项目并获得 API Key

### 配置 Claude Code

编辑 `~/.claude/claude_code_config.json`：

```json
{
  "mcpServers": {
    "aigc-gateway": {
      "type": "streamable-http",
      "url": "https://aigc.guangai.ai/mcp",
      "headers": {
        "Authorization": "Bearer pk_your_api_key_here"
      }
    }
  }
}
```

### 配置 Cursor

在项目根目录创建 `.cursor/mcp.json`：

```json
{
  "mcpServers": {
    "aigc-gateway": {
      "url": "https://aigc.guangai.ai/mcp",
      "headers": {
        "Authorization": "Bearer pk_your_api_key_here"
      }
    }
  }
}
```

### 通用配置

其他支持 MCP 的 AI 编辑器，使用以下信息配置：

| 配置项 | 值 |
|--------|-----|
| URL | `https://aigc.guangai.ai/mcp` |
| 传输协议 | Streamable HTTP |
| 认证 | Bearer Token（使用你的 API Key） |

配置完成后重启 AI 编辑器，即可开始使用。

---

## 使用场景

### 场景一：快速生成对接代码

你对 AI 编辑器说：

> "帮我写一个接口，调用 AIGC Gateway 的 deepseek/v3 模型，生成旅行计划"

AI 编辑器会自动：
1. 调用 `list_models` 确认 deepseek/v3 可用及其价格
2. 为你安装 `@guangai/aigc-sdk`
3. 生成完整的对接代码

```typescript
// AI 编辑器自动生成的代码
import { Gateway } from '@guangai/aigc-sdk'

const gateway = new Gateway({ apiKey: process.env.AIGC_API_KEY })

app.post('/api/plan-trip', async (req, res) => {
  const { destinations, days } = req.body

  const result = await gateway.chat({
    model: 'deepseek/v3',
    messages: [
      { role: 'system', content: '你是一个专业的旅行规划师...' },
      { role: 'user', content: `请规划旅行：${destinations.join('、')}，${days}天` }
    ]
  })

  res.json(JSON.parse(result.choices[0].message.content))
})
```

你不需要手动查模型名、不需要看 SDK 文档——AI 编辑器通过 MCP 已经获取了这些信息。

### 场景二：直接对话生成内容

> "用 openai/gpt-4o 帮我写一段产品介绍，面向企业用户"

AI 编辑器直接通过 MCP 调用平台的 `chat` 工具，把 AI 生成的结果返回给你。费用自动从项目余额扣除，调用记录自动写入审计日志。

### 场景三：调试和排查

> "帮我看一下最近几次调用的记录，有没有异常"

AI 编辑器调用 `list_logs` 获取最近的调用记录，分析状态、延迟和费用，直接告诉你结论。

如果需要看具体某次调用的详情：

> "帮我看一下 trc_8f3a2b7e 这次调用的完整 prompt"

AI 编辑器调用 `get_log_detail` 返回完整的 prompt、AI 输出和性能指标。

### 场景四：费用管理

> "我的余额还有多少？最近花了多少钱？"

AI 编辑器调用 `get_balance` 和 `get_usage_summary`，告诉你当前余额、最近 7 天的总费用、以及哪个模型花费最多。

### 场景五：用自然语言创建 Prompt 模板 `即将推出`

你不需要手写 system prompt。直接告诉 AI 编辑器你要做什么：

> "帮我在 AIGC Gateway 上创建一个旅行规划的模板，用户会输入目的地和天数，需要按天生成详细行程，考虑地理位置合理安排路线，预估花费，支持设置预算上限"

AI 编辑器通过 MCP 调用 `create_template`，自动：
1. 将你的自然语言描述转化为结构化的 system prompt
2. 提取变量定义（`destinations`、`days`、`currency`、`budget`）
3. 在平台上创建模板并生效

创建完成后，你可以在控制台中查看、编辑和测试这个模板。

### 场景六：使用模板生成内容 `即将推出`

模板创建好之后，调用变得更简单——你不需要写 prompt，只需要传变量值：

> "用 travel_planner 模板帮我规划一个 5 天的东京+京都旅行，预算 8000 元"

AI 编辑器调用 `chat_with_template`，传入模板 ID 和变量，平台服务端完成 prompt 组装、AI 调用、审计记录，返回结果。

你也可以让 AI 编辑器帮你生成对接代码：

> "帮我写一个旅行规划的 API 接口，用 AIGC Gateway 的 travel_planner 模板"

AI 编辑器先调用 `get_template('travel_planner')` 获取模板的变量定义，然后生成代码：

```typescript
// AI 编辑器自动生成的代码
import { Gateway } from '@guangai/aigc-sdk'

const gateway = new Gateway({ apiKey: process.env.AIGC_API_KEY })

app.post('/api/plan-trip', async (req, res) => {
  const { destinations, days, budget } = req.body

  const result = await gateway.chat({
    model: 'openai/gpt-4o',
    templateId: 'travel_planner',
    templateVariables: {
      currency: 'CNY',
      budget: budget || undefined
    },
    messages: [
      {
        role: 'user',
        content: `请帮我规划旅行。目的地：${destinations.join('、')}，时长：${days}天`
      }
    ]
  })

  res.json(JSON.parse(result.choices[0].message.content))
})
```

开发者全程不需要写 system prompt，不需要查模板变量名——AI 编辑器通过 MCP 自动获取了这些信息。

### 场景七：模板迭代优化 `即将推出`

上线后用户反馈"行程太紧凑"，你对 AI 编辑器说：

> "帮我看一下 travel_planner 模板的内容"

AI 编辑器调用 `get_template`，展示当前模板的 system prompt 和变量定义。你说：

> "在要求里加一条'每天最多安排 3 个景点，留出休息时间'"

你去控制台修改模板，发布为 v2 版本。**不需要改任何业务代码**——下一次 API 调用自动使用新版本。如果 v2 效果不好，在控制台一键回滚到 v1。

之后你可以对比两个版本的效果：

> "travel_planner 模板 v1 和 v2 的调用质量对比怎么样？"

AI 编辑器调用 `list_logs` 按模板版本筛选，分析成功率、延迟和用户反馈趋势。

---

## 可用工具（25 个）

MCP 服务器提供以下工具（Tools），AI 编辑器会根据你的需求自动选择调用：

### 查询类（5，不产生费用）

| 工具 | 说明 |
|------|------|
| `list_models` | 查看可用模型、价格和能力。支持按模态（text/image）筛选 |
| `list_logs` | 查看最近的调用记录。支持按模型、状态筛选，支持全文搜索 prompt 内容 |
| `get_log_detail` | 查看单次调用的完整详情：prompt、AI 输出、参数、tokens、费用、延迟 |
| `get_balance` | 查看用户余额，可选查看最近交易记录 |
| `get_usage_summary` | 查看用量汇总：总调用次数、总费用、总 token 数、按模型排行 |

### AI 调用类（2，按实际用量扣费）

| 工具 | 说明 |
|------|------|
| `chat` | 文本生成。指定模型和消息，返回 AI 生成的文本 + traceId + 费用 |
| `generate_image` | 图片生成。指定模型和描述，返回图片 URL + traceId + 费用 |

### Action 管理（8，原子执行单元）

| 工具 | 说明 |
|------|------|
| `create_action` | 创建 Action = 模型 + 提示词模板 + 变量定义，自动生成 v1 |
| `get_action_detail` | 查看 Action 详情（活跃版本 messages/variables、版本历史） |
| `list_actions` | 分页列出项目内所有 Action |
| `update_action` | 更新 Action 元数据（name/description/model） |
| `delete_action` | 删除 Action（被 Template 引用时阻止） |
| `create_action_version` | 创建新版本（版本号自增），可控是否设为活跃 |
| `activate_version` | 切换活跃版本（版本回滚/升级） |
| `run_action` | 执行 Action：注入变量渲染模板后调用模型；支持 dry_run 预览 |

### Template 管理（8，多步编排工作流 + 公共模板）

| 工具 | 说明 |
|------|------|
| `create_template` | 创建 Template：由多个 Action 按串行或扇出模式组合 |
| `get_template_detail` | 查看 Template 详情（执行模式、步骤列表、保留变量） |
| `list_templates` | 分页列出所有 Template |
| `update_template` | 更新 Template（steps 全量替换） |
| `delete_template` | 删除 Template（级联删除步骤） |
| `run_template` | 执行 Template 工作流，返回每步的 output/usage/latency 明细 |
| `list_public_templates` | 浏览管理员发布的公共模板库 |
| `fork_public_template` | 将公共模板 fork 到自己的项目中 |

### 账户管理（2）

| 工具 | 说明 |
|------|------|
| `manage_api_keys` | 管理用户级 API Key（创建/列出/删除） |
| `manage_projects` | 管理项目（创建/列出/切换/删除） |

所有 AI 调用都会记录在审计日志中，和通过 API/SDK 的调用一样。

---

## 认证与安全

- MCP 使用和 API 调用相同的 API Key 认证，不需要额外的凭证
- API Key 通过 HTTP Header 传输，不出现在 URL 中
- 所有数据限定在你的项目范围内，无法跨项目访问
- MCP 调用和 API 调用共享同一套限流配额

---

## 计费说明

- 查询类工具（list_models / list_logs / get_balance 等）不产生费用
- AI 调用类工具（chat / generate_image）按实际 token 用量或图片数量计费，和 API 调用完全一致
- 费用从项目余额中扣除
- 所有调用可在控制台的审计日志中查看，MCP 调用会标记来源为 `mcp`

---

## 和 API / SDK 的关系

MCP 不替代 API 和 SDK，三者各有适用场景：

| 接入方式 | 适用场景 | 说明 |
|---------|---------|------|
| **MCP** | 开发阶段 | 在 AI 编辑器中快速实验、调试、生成代码 |
| **SDK** | 运行时（推荐） | 生产环境的后端服务，封装了流式解析、重试、类型安全 |
| **HTTP API** | 运行时（通用） | 任何语言都能用，不依赖 SDK |

典型的工作流是：通过 MCP 在 AI 编辑器中实验和生成代码 → 代码中使用 SDK 调用平台 → 部署到生产环境运行。

三种方式走同一条链路，审计日志和计费统一。

---

## 常见问题

**Q：连接失败怎么办？**

检查以下几点：
1. API Key 是否正确（以 `pk_` 开头）
2. URL 是否为 `https://aigc.guangai.ai/mcp`
3. AI 编辑器是否支持 Streamable HTTP 传输协议
4. 重启 AI 编辑器后重试

**Q：MCP 调用会产生费用吗？**

查询类工具不收费。`chat` 和 `generate_image` 按实际用量收费，和 API 调用计费标准完全一致。

**Q：在控制台能看到 MCP 的调用记录吗？**

可以。MCP 的 AI 调用会出现在审计日志中，来源标记为 `mcp`，和 API/SDK 的调用记录在同一个列表里。

**Q：我可以同时用 MCP 和 SDK 吗？**

可以。它们用同一个 API Key，共享余额和限流配额，互不冲突。

**Q：支持哪些 AI 编辑器？**

任何支持 MCP Streamable HTTP 协议的 AI 编辑器都可以接入，包括 Claude Code、Cursor、Windsurf、Cline 等。

**Q：通过 MCP 创建的模板会立即生效吗？** `即将推出`

会。通过 `create_template` 创建的模板立即可用，版本记录为 v1。后续通过 `update_template` 修改会自动创建新版本，所有版本保留可回滚。删除模板需要在控制台操作，MCP 不支持删除——防止 AI 编辑器误删生产模板。

**Q：使用模板后，我还需要写 system prompt 吗？**  `即将推出`

不需要。使用 `chat_with_template` 时，你只传模板 ID 和变量值，平台服务端负责组装完整的 prompt。你的代码中不会出现任何 prompt 内容。模板的创建和修改在控制台中完成，不需要改代码、不需要重新部署。
