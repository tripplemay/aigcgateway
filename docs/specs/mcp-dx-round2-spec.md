# MCP 开发者体验第二轮 — 规格文档

**批次名称：** mcp-dx-round2
**创建日期：** 2026-04-06
**来源：** 第二轮 MCP 新用户评估报告（AIGC_GATEWAY_NEW_USER_EVALUATION.md）逐项讨论确认

---

## 1. 背景与目标

mcp-capability-enhancement 批次上线后，进行了第二轮新用户视角评估。评估发现 7 个问题，逐项讨论后确认 5 项需要开发改动（问题 4 合并到问题 3，问题 7 交给 Codex 验证）。

**核心目标：** 减少模型列表噪音、消除开发者选型困惑、补全 Action/Template 详情查看能力。

---

## 2. 功能范围

### 2.1 白名单收紧至 28 个精选模型（问题 1）

**目标：** 从"我们已接入什么"转变为"开发者需要什么"，精选 28 个市场主流模型。

**确认的 28 个模型列表：**

#### 通用对话（旗舰，8 个）
| 模型 | 厂商 | 定位 |
|---|---|---|
| GPT-4o | OpenAI | 综合最强 |
| Claude Sonnet 4 | Anthropic | 长文写作 |
| Gemini 2.5 Pro | Google | 长上下文、多模态 |
| DeepSeek V3 | DeepSeek | 中文性价比 |
| Grok 3 | xAI | 实时信息+创意 |
| Qwen Plus | 阿里 | 中文综合 |
| GLM-4 Plus | 智谱 | 中文专业写作 |
| Kimi | 月之暗面 | 长上下文中文 |

#### 轻量/高速（7 个）
| 模型 | 厂商 |
|---|---|
| GPT-4o Mini | OpenAI |
| Gemini 2.5 Flash | Google |
| Gemini 2.0 Flash | Google |
| Claude Haiku 3.5 | Anthropic |
| Grok 3 Mini | xAI |
| GLM-4 Flash | 智谱 |
| MiniMax | MiniMax |

#### 长上下文特化（2 个）
| 模型 | 厂商 |
|---|---|
| Gemini 1.5 Pro | Google（100 万 token）|
| Doubao Pro 256K | 字节 |

#### 推理（3 个）
| 模型 | 厂商 |
|---|---|
| o3 | OpenAI |
| o4-mini | OpenAI |
| DeepSeek R1 | DeepSeek |

#### 搜索增强（2 个）
| 模型 | 厂商 |
|---|---|
| Perplexity Sonar | Perplexity |
| Perplexity Sonar Pro | Perplexity |

#### 阿里旗舰（1 个）
| 模型 | 厂商 |
|---|---|
| Qwen Max | 阿里 |

#### 多模态视觉（1 个）
| 模型 | 厂商 |
|---|---|
| Doubao Vision Pro | 字节 |

#### 图片生成（4 个）
| 模型 | 厂商 |
|---|---|
| GPT Image 1 | OpenAI |
| DALL-E 3 | OpenAI |
| 通义万相（Wanx）| 阿里 |
| Seedream 4.5 | 字节 |

**实现要点：**
- `model-whitelist.ts` 重写为 28 个模型
- OpenAI 改精确匹配（废弃 `isOpenAIModelWhitelisted` 的 `startsWith` 前缀匹配逻辑）
- 部分模型当前无直连 adapter（Kimi、MiniMax、Perplexity、Gemini 等），白名单中先占位，通过 OpenRouter 代理接入
- 白名单外模型同步时物理删除（延续现有逻辑）

### 2.2 list_models 默认去重（问题 2）

**目标：** 同一基础模型通过不同渠道接入后，list_models 只展示一条（canonical name），路由层自动选最优渠道。

**方案：**
- list_models 查询时按 canonical name 聚合
- 同名模型取优先级最高的渠道的信息（价格、capabilities）
- 路由层（router.ts）已有 priority 机制，无需改动
- 可选参数 `show_all_channels=true` 展示全量（供调试用）

**canonical name 规则：**
- 白名单中的模型名即为 canonical name
- 已通过 resolveModelName() + CROSS_PROVIDER_MAP 做了映射

### 2.3 capabilities 补全 + 去掉 tools 标记（问题 3 + 4）

**目标：** 对照 28 个白名单模型，确保 `model-capabilities-fallback.ts` 覆盖完整且准确。

**规则：**
- capabilities 只标当前 MCP 实际支持的能力：`streaming`、`vision`、`json_mode`
- **去掉 `tools: true` 标记**——当前 MCP chat 不支持传 tools 参数，标了会误导开发者
- 未来加了 tools 参数后再标回来
- 确保所有 28 个模型的 capabilities 都有准确标注，不再出现空 `{}`

### 2.4 generate_image 文档补充（问题 5）

**目标：** 补充图片模型差异说明，不加新参数。

**改动：**
- `generate_image` tool description 中增加各图片模型支持的尺寸说明
- SERVER_INSTRUCTIONS 中补充图片模型选型指引

### 2.5 新增 get_action_detail / get_template_detail MCP 工具（问题 6）

**新增两个查询类工具（不写日志不扣费）：**

#### get_action_detail(action_id)
返回：
- Action 基本信息（id, name, description, model）
- 激活版本详情（versionNumber, messages, variables）
- 版本列表（id, versionNumber, createdAt）

#### get_template_detail(template_id)
返回：
- Template 基本信息（id, name, description）
- 执行模式（single / sequential / fan-out）
- 步骤列表（order, role, actionName, model, actionId）
- 每步的 Action 简要信息

**同步更新：**
- `server.ts` 注册新工具
- SERVER_INSTRUCTIONS 补充新工具说明
- MCP 设置页 TOOLS 数组补充（如有前端展示）
- i18n 补充（如有新 key）

---

## 3. 不在范围内

- chat 工具的 tools/function_calling 参数（暂不做）
- generate_image 新增 quality/style/negative_prompt 参数（暂不做）
- 错误场景优化（现有处理已足够，Codex 验证覆盖）
- batch API（暂不做）
- 多轮对话管理（客户端职责）

---

## 4. 依赖关系

```
F-DX2-01 (白名单收紧) → F-DX2-02 (list_models 去重)
F-DX2-03 (capabilities 补全) — 依赖 F-DX2-01 确认的 28 个模型列表
F-DX2-04 (generate_image 文档) — 独立
F-DX2-05~06 (get_action_detail / get_template_detail) — 独立
F-DX2-07 (SERVER_INSTRUCTIONS 更新) — 需了解所有改动后最后写
```

**建议实现顺序：** 01 → 02 → 03 → 04 → 05 → 06 → 07 → 08 → 09 → 10
