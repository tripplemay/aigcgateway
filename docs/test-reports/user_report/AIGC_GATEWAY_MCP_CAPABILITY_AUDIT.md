# AIGC Gateway MCP 能力审计报告（新开发者视角）

> 审计时间：2026-04-05
> 审计方式：以全新开发者身份，仅通过 MCP 工具提供的信息探索平台全部能力
> 审计范围：11 个 MCP 工具 + Server Instructions
> 审计结论：核心 chat/image 能力可用，但信息质量、能力完整性、可发现性存在显著问题

---

## 一、能力发现结果（11 个 MCP 工具）

| 能力类别 | 工具 | 能否正常使用 |
|---------|------|------------|
| **文本生成** | `chat` | 可用 |
| **图片生成** | `generate_image` | 可用（未实测） |
| **模型列表** | `list_models` | 可用，支持 text/image 过滤 |
| **Action 管理** | `list_actions` / `run_action` | 工具存在，但无法自行创建 |
| **Template 管理** | `list_templates` / `run_template` | 工具存在，但无法自行创建 |
| **日志查询** | `list_logs` / `get_log_detail` | 可用 |
| **用量统计** | `get_usage_summary` | 可用 |
| **余额查询** | `get_balance` | 可用 |

---

## 二、发现的问题

### 问题 1：Action 和 Template 只能"读"和"跑"，不能"建"（P0）

这是最大的能力断裂。MCP 提供了 `list_actions` / `run_action` / `list_templates` / `run_template`，但**没有** `create_action` / `create_template` / `update_action` / `delete_action` 等写入工具。

**新开发者的困惑路径：**

1. 看到 `run_action` → 很兴奋，平台支持 Prompt 模板化管理
2. 调用 `list_actions` → 返回空数组
3. 想创建一个 Action → **找不到任何创建工具**
4. 不知道该去哪里创建（Web 控制台？REST API？SDK？）
5. 结论：**Action/Template 功能对 MCP 用户来说形同虚设**，除非有人事先通过其他途径创建好

**建议：**

- 方案 A（推荐）：补全 `create_action` / `update_action` / `delete_action` / `create_template` / `update_template` / `delete_template` 等 MCP 工具
- 方案 B：在 `list_actions` 返回空结果时给出引导提示，例如：
  ```json
  {
    "data": [],
    "hint": "No actions found. Create actions at https://aigc.guangai.ai/dashboard/actions or via REST API POST /v1/actions"
  }
  ```

---

### 问题 2：模型列表信息质量参差不齐（P0）

对比有完整信息的模型和信息缺失的模型：

| 字段 | `openai/gpt-4.1`（好） | `siliconflow/deepseek-ai/DeepSeek-R1`（差） |
|------|----------------------|------------------------------------------|
| contextWindow | 1,000,000 | **null** |
| capabilities | tools, vision, streaming | **{}（空对象）** |
| price | $2.4 in / $9.6 out | $0.657 in / $2.63 out |

**统计数据：**

- ~120 个文本模型中，约 **80+ 个** `contextWindow` 为 `null`
- 约 **80+ 个** `capabilities` 为 `{}`（空对象）
- **大量模型价格为 `$0 in / $0 out`** — 新开发者无法判断是真免费还是未配置

**建议：**

1. `contextWindow: null` 应改为实际值，或至少标注为 `"unknown"`
2. `capabilities: {}` 不应该是空的 — 至少应有 `streaming: true/false` 的明确标注
3. 价格为 `$0` 的模型应明确标注是 "免费（free tier）" 还是 "价格未配置（pricing TBD）"

---

### 问题 3：同一模型存在大量重复/变体，无法区分（P0）

以 zhipu/GLM-4.7 为例，列表中出现了：

| 模型名 | displayName | 价格 |
|-------|------------|------|
| `zhipu/GLM-4.7` | GLM-4.7 | $0.329/$1.315 |
| `zhipu/glm-4.7` | GLM-4.7 | $0.658/$2.630 |
| `zhipu/GLM-4.7-Flash` | GLM-4.7-Flash | $0/$0 |
| `zhipu/GLM-4.7-FlashX` | GLM-4.7-FlashX | $0.082/$0.493 |
| `zhipu/glm-4.7-flashx` | GLM-4.7 FlashX | $0.105/$0.6 |

**`zhipu/GLM-4.7` 和 `zhipu/glm-4.7` 是同一个模型吗？大小写不同，价格也不同！** 新开发者根本无法判断该用哪个。

类似的重复还有：
- `zhipu/GLM-5` vs `zhipu/glm-5`
- `zhipu/GLM-4.5` vs `zhipu/glm-4.5`
- `zhipu/GLM-4.5-Air` vs `zhipu/glm-4.5-air`
- `openai/gpt-4o` vs `openrouter/gpt-4o` vs `openrouter/openai/gpt-4o-mini`

**建议：**

1. 去重或明确标注差异（如 "GLM-4.7 via ZhiPu direct" vs "GLM-4.7 via SiliconFlow"）
2. 统一大小写规范（建议全部小写或遵循上游官方命名）
3. 增加 `provider` 字段和 `deprecated` 标记
4. 增加 `recommended: true` 标记帮助新用户快速选择

---

### 问题 4：`chat` 工具参数缺失，无法使用模型声明的高级能力（P1）

对比模型声明的 `capabilities` 和 `chat` 工具实际支持的参数：

| 模型声明的能力 | chat 工具是否支持 | 说明 |
|--------------|----------------|------|
| `streaming: true` | 无 `stream` 参数 | 无法控制是否流式输出 |
| `vision: true` | `content` 只接受 string | 无法传入图片 URL 或 base64 |
| `tools: true` | 无 `tools` 参数 | 无法使用 function calling |
| templateId + variables | 无相关参数 | 需要用 `run_action` / `run_template` |

**结论：** 模型列表声明了 tools、vision、streaming 能力，但 MCP 的 `chat` 工具无法使用这些能力。这产生了虚假的期望。

**建议：**

- 方案 A：扩展 `chat` 工具参数，支持 `stream`、`tools`、多模态 `content`
- 方案 B：在模型 `capabilities` 中标注 "仅通过 REST API 可用"
- 方案 C：增加专门的工具如 `chat_with_vision`、`chat_with_tools`

---

### 问题 5：没有任何"入门引导"信息（P1）

MCP 服务器说明（Server Instructions）虽然列了工具用途，但：

- 没有提供 **入门示例**（如 "第一步：调用 list_models 查看可用模型"）
- 没有说明 **API Key 从哪里获取**
- 没有说明 **Web 控制台地址**
- 没有说明 **SDK 文档链接**（虽然提到了 `@guangai/aigc-sdk`，但没有 npm/文档链接）
- 没有说明 **Action/Template 在哪里创建**
- `baseUrl: https://aigc.guangai.ai/v1` 信息只在服务器说明文字中，不在任何工具返回值中

**建议：**

- 增加一个 `get_started` 或 `get_help` 工具，返回入门指引
- 或在 Server Instructions 中增加结构化的 Quick Start 信息：
  ```
  Quick Start:
  1. 查看可用模型：list_models
  2. 发送第一条消息：chat(model: "zhipu/glm-4.7-flash", messages: [...])
  3. 创建 Action/Template：https://aigc.guangai.ai/dashboard
  4. SDK 文档：https://docs.guangai.ai/sdk
  ```

---

### 问题 6：日志详情中的数据质量问题（P2）

`get_log_detail` 返回中：

| 字段 | 问题 |
|------|------|
| `ttft: null` | 首 Token 延迟未记录，对性能调优很重要 |
| `cost: "$0.0000"` | 免费模型显示 $0 正确，但未定价模型也显示 $0，无法区分 |
| `source: "api"` | 只有一种来源标识，未区分 MCP / SDK / REST |
| `finishReason: "STOP"` | 正常，但缺少对 `length`（截断）、`tool_calls` 等其他原因的文档说明 |

**建议：**

1. 记录 `ttft`（Time To First Token），这是开发者评估模型响应速度的关键指标
2. 区分 `source` 为 `mcp` / `sdk` / `rest-api` / `playground`
3. 成本为 $0 时增加 `costNote: "free tier"` 或 `costNote: "pricing not configured"` 区分

---

### 问题 7：`get_usage_summary` 缺乏细粒度（P2）

当前返回的数据：

```json
{
  "period": "30d",
  "totalCalls": 5,
  "totalCost": "$0.0000",
  "totalTokens": 7325,
  "avgLatency": "15.1s",
  "topModels": [{"model": "zhipu/glm-4.7-flash", "calls": 5, "cost": "$0.0000"}]
}
```

缺少的维度：

- 按日期的趋势数据（每日调用量/成本曲线）
- 按 Action/Template 的用量拆分
- 错误率 / 成功率统计
- P50/P95/P99 延迟分布（只有平均值 15.1s，无法判断是否有异常值）
- Token 使用的 input/output 拆分

**建议：** 增加 `breakdown` 参数：`by_date` / `by_action` / `by_status`，返回更细粒度的数据。

---

## 三、总结评分

| 维度 | 评分 | 说明 |
|------|------|------|
| **能力覆盖** | ⭐⭐⭐☆☆ | 核心 chat + image 可用，但 Action/Template CRUD 不完整 |
| **信息质量** | ⭐⭐☆☆☆ | 模型列表大量 null/空值，同模型多个变体无法区分 |
| **可发现性** | ⭐⭐☆☆☆ | 能力存在但不可达（能看到 run_action 但不能 create_action） |
| **入门体验** | ⭐☆☆☆☆ | 零引导，新开发者需要大量试错才能上手 |
| **数据一致性** | ⭐⭐☆☆☆ | 大小写不统一、价格不一致、capabilities 空白 |

---

## 四、优先修复建议

| 优先级 | 问题 | 修复成本 | 影响面 |
|-------|------|---------|-------|
| **P0** | 模型列表去重 + 统一命名规范 | 中 | 所有用户的模型选择体验 |
| **P0** | 补全 contextWindow 和 capabilities 字段 | 中 | 所有使用 list_models 的开发者 |
| **P0** | `$0` 价格标注是免费还是未定价 | 低 | 所有用户的成本预期 |
| **P1** | 补全 Action/Template CRUD 工具 | 高 | 所有想通过 MCP 管理 Prompt 的用户 |
| **P1** | chat 工具支持 streaming/vision/tools | 中 | 需要高级模型能力的开发者 |
| **P1** | 增加入门引导信息 | 低 | 所有新用户 |
| **P2** | 日志记录 ttft、区分 source | 低 | 性能调优场景 |
| **P2** | usage summary 增加细粒度维度 | 中 | 运营分析场景 |

---

## 五、与上一份报告（REST API/SDK 集成反馈）的交叉问题

本报告聚焦 MCP 工具的信息完整性和可发现性，与 `AIGC_GATEWAY_INTEGRATION_FEEDBACK.md` 中的问题互为补充：

1. **模板功能断裂**：上一份报告指出 REST API 和 SDK 静默忽略 template_id；本报告发现 MCP 端也无法创建 Action/Template。整条模板链路的开发者体验都是断裂的。
2. **SDK 类型问题**：上一份报告发现 SDK 的 `template_id` 类型定义与实现不一致；本报告发现 MCP 的 `chat` 工具同样缺失模型声明的高级能力参数。**类型/接口承诺与实际能力不匹配**是两份报告共同的核心问题。

两份报告合在一起，完整覆盖了 MCP、REST API、SDK 三条接入路径的开发者体验问题。
