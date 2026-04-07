# AIGC Gateway MCP 新用户视角评估报告

> 评估日期：2026-04-05
> 评估视角：全新 AIGC 应用开发者，首次通过 MCP 工具探索 AIGC Gateway 的能力
> 评估方法：仅通过 MCP 工具提供的信息判断服务能力，不依赖外部文档

---

## 一、网关能力概览

网关提供 **10 个 MCP 工具**，覆盖以下能力域：

| 能力域 | 工具 | 评价 |
|--------|------|------|
| 账户 | `get_balance` | 清晰，支持查交易记录 |
| 模型发现 | `list_models` | 有模型名、价格、capabilities |
| 文本生成 | `chat` | 标准 chat completion |
| 图片生成 | `generate_image` | 支持 DALL-E 3, Seedream, CogView 等 |
| 预设工作流 | `list_actions` / `run_action` | 原子执行单元 |
| 编排工作流 | `list_templates` / `run_template` | 多步编排（串行 + Fan-out） |
| 日志调试 | `list_logs` / `get_log_detail` | 可搜索、可看完整 prompt/response |
| 用量统计 | `get_usage_summary` | 多维度筛选和分组 |

---

## 二、指引与提示清晰度

### 做得好的地方

1. **Server Instructions 质量高** — MCP 服务器自带的说明文档结构清晰：Quick Start → 各功能模块 → SDK 推荐，层次分明
2. **工具描述自解释** — 每个工具的 `description` 写得足够好，不看文档也知道怎么用
3. **空结果有引导** — Actions/Templates 为空时返回 `"No Actions found. Create your first Action in the console at https://aigc.guangai.ai/actions"`，不会让新用户迷路
4. **模型信息结构完整** — 每个模型都有 modality、contextWindow、price、capabilities，基本选型信息足够

---

## 三、发现的问题

### 问题 1：模型列表噪音太大（严重）

返回了 **75 个模型**，其中大量是 `$0 in / $0 out`、`contextWindow: null`、`capabilities: {}` 的模型。

**典型噪音模型示例：**
- `openai/gpt-4o-ca` — $0, null context, 空 capabilities
- `openai/gpt-4o-2024-05-13` — $0, null context, 空 capabilities
- `openai/o4-mini-2025-04-16` — $0, null context, 空 capabilities
- `openai/gpt-4o-mini-audio-preview-2024-12-17` — $0, null context, 空 capabilities

作为新用户，完全不知道 `$0` 价格意味着什么——免费？未配置？内部测试？无法判断。

**建议：**
- 给模型标注状态（`beta` / `internal` / `free-tier` / `active`）
- 默认不返回未完全配置的模型
- 增加 `status` 过滤参数

---

### 问题 2：同模型多渠道，缺乏选型指引（严重）

同一个基础模型出现在多个渠道，例如 DeepSeek V3：

| 渠道 | 模型名 | 输入价格 | 输出价格 | capabilities |
|------|--------|---------|---------|-------------|
| deepseek | `deepseek/v3` | $0.336 | $0.504 | streaming ✅, tools ✅ |
| openrouter | `openrouter/deepseek/deepseek-chat-v3-0324` | $0.24 | $0.924 | 空 |
| siliconflow | `siliconflow/deepseek-v3` | $0.3288 | $1.3152 | streaming ✅ |
| volcengine | `volcengine/deepseek-v3-ark` | $0.3288 | $1.3152 | 空 |

价格不同，capabilities 不同，但**没有任何说明告诉开发者该选哪个**。

**建议：**
- 增加 `recommended: true` 标记
- 支持 `deduplicate=true` 参数，只返回每个模型的推荐渠道
- 或提供 `list_models(tier="recommended")` 筛选

---

### 问题 3：capabilities 字段不一致（严重）

| 模型 | 实际能力 | capabilities 返回 |
|------|---------|------------------|
| `openai/gpt-4o` | tools, vision, streaming | `{tools: true, vision: true, streaming: true}` ✅ |
| `openai/o3` | tools, streaming | `{}` ❌ |
| `openrouter/google/gemini-2.5-pro` | tools, vision, streaming | `{}` ❌ |
| 所有 `openrouter/` 模型 | 各有不同 | 几乎都是 `{}` ❌ |

**开发者无法信任此字段做能力判断。**

**建议：**
- 确保 capabilities 完整且准确
- 或在文档中明确说明"仅直连渠道提供 capabilities 信息，openrouter 渠道暂缺"

---

### 问题 4：chat 工具缺少关键能力（严重）

chat 工具当前支持的参数：
- ✅ `model`, `messages`, `max_tokens`, `temperature`, `stream`, `response_format`

缺少的常用参数：
- ❌ `tools` / `tool_choice` — 无法做 function calling
- ❌ `top_p` — 无法精细控制采样
- ❌ `frequency_penalty` / `presence_penalty` — 无法控制重复度
- ❌ `stop` — 无法设置停止序列

**关键矛盾：** 模型 capabilities 标了 `tools: true`，但 chat 接口不支持传 `tools` 参数。这会让开发者产生困惑——"模型支持 function calling，但我该怎么用？"

**建议：**
- 如果网关支持 function calling，chat 接口应暴露 `tools` 参数
- 如果不支持，capabilities 中不应标 `tools: true`

---

### 问题 5：generate_image 缺少参数说明（中等）

- `size` 参数只说了 `"e.g. 1024x1024"`，但不同模型支持的尺寸不同（DALL-E 3: 1024x1024/1792x1024/1024x1792，Seedream 可能不同）
- 没有 `quality`、`style` 等 DALL-E 3 支持的参数
- 没有 `negative_prompt` 等 Seedream/CogView 可能支持的参数

**建议：**
- 在模型信息中增加 `supportedSizes` 字段
- generate_image 增加模型级可选参数

---

### 问题 6：Action/Template 的 MCP 能力不完整（中等）

MCP 接口只能 list 和 run，**没有详情查看能力**：
- 没有 `get_action_detail(action_id)` — 无法查看 Action 绑定的模型、prompt 模板、变量定义
- 没有 `get_template_detail(template_id)` — 无法查看 Template 的步骤编排

开发者在 MCP 侧无法了解 Action 的具体内容就要盲目执行，体验断裂。

创建/编辑需在控制台操作（文档已说明），这可以理解。但至少应该能**查看**。

**建议：**
- 增加 `get_action_detail(action_id)` 和 `get_template_detail(template_id)`

---

### 问题 7：错误场景体验（待验证）

以下场景的错误返回尚未测试：
- 余额不足时调用 chat
- 使用不存在的模型名
- 参数类型错误
- rate limit

好的 DX 应有清晰的错误码和修复建议。

---

## 四、实际需求模拟

### 场景：用 AI 生成一篇关于 React 19 的技术博客（中文，1500 字）

**使用路径：**
1. `list_models(modality="text")` → 选性价比高的模型，如 `deepseek/v3`
2. `chat(model="deepseek/v3", messages=[...])` → 传入 system prompt + user prompt
3. `list_logs` → 检查调用是否成功
4. `get_usage_summary` → 确认花费

**结论：基础路径是通的，基本功能没问题。**

### 进阶需求能否满足？

| 需求 | 能否满足 | 原因 |
|------|---------|------|
| 先生成大纲，再按章节展开，最后合并 | ⚠️ 部分 | 需要 Template（串行模式），但必须先去控制台创建 |
| 调用 AI 并让它搜索最新资料 | ❌ 不能 | 需要 function calling（tools），chat 接口不支持 |
| 生成图文并茂的文章 | ⚠️ 手动 | 需 text + image 分两次调用手动拼接 |
| 对比多个模型的输出质量 | ✅ 可以 | 同一 prompt 分别调用不同模型即可 |
| 查看历史调用复盘 prompt 质量 | ✅ 可以 | list_logs + get_log_detail 支持 |
| 批量处理（如翻译 100 段文本） | ❌ 不能 | 没有 batch API，只能逐条调用 |
| 多轮对话管理 | ⚠️ 客户端 | 网关无会话管理，开发者自行维护 messages 数组 |

---

## 五、评分总结

| 维度 | 评分 (1-5) | 说明 |
|------|-----------|------|
| 上手引导 | ★★★★☆ | Server Instructions 写得好，Quick Start 清晰 |
| 工具设计 | ★★★☆☆ | 基础功能全，但 chat 缺 tools 参数是硬伤 |
| 模型信息 | ★★☆☆☆ | 噪音大、capabilities 不一致、缺选型指引 |
| 错误处理 | 待验证 | 尚未触发错误场景 |
| 工作流能力 | ★★★☆☆ | Action/Template 设计思路好，但 MCP 侧只能 run 不能查看详情 |
| 可观测性 | ★★★★☆ | 日志 + 用量统计做得不错 |

---

## 六、改进建议（按优先级）

### P0 — 必须修复

1. **chat 接口支持 `tools` 参数**（或移除 capabilities 中的 `tools: true` 标记，消除矛盾）
2. **清理模型列表**，隐藏未完全配置的模型（`$0` 价格、`null` contextWindow、空 capabilities 且无 displayName）

### P1 — 强烈建议

3. **统一补全 capabilities 信息**，确保所有模型的能力标注准确
4. **增加模型选型推荐机制**（`recommended` 标记 / 按场景筛选 / 去重选项）

### P2 — 体验优化

5. **MCP 侧增加 `get_action_detail` / `get_template_detail`**，让开发者在 MCP 内查看完整定义
6. **generate_image 增加模型级参数说明**（支持的尺寸、质量、风格等）
7. **chat 接口增加 `top_p`、`frequency_penalty` 等常用参数**
8. **考虑增加 batch API** 支持批量调用场景

---

## 附录：与上一份评估报告的关系

本报告聚焦于 **MCP 工具层面的新用户体验**，关注指引清晰度、能力发现、选型决策。

上一份报告 `AIGC_GATEWAY_INTEGRATION_FEEDBACK.md` 聚焦于 **实际集成过程中遇到的技术问题**（SDK 类型不一致、REST API 静默忽略字段、MCP 端点健康检查等）。

两份报告互补，建议一起阅读。
