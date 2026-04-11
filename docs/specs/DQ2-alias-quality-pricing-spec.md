# DQ2 — 别名数据质量二期 + 定价体系 Spec

## 背景与目标

1. **别名数据质量（BL-102）：** capabilities 字段不统一（image_input 与 vision 重复，缺少 reasoning/search），IMAGE 别名缺少 supportedSizes。
2. **定价体系（BL-107）：** 别名定价依赖手动输入或 LLM 推断，效率低且不准确。全站金额显示为 USD，但目标用户群体为国内用户，应显示人民币。

## 功能范围

### Part A — capabilities 统一（BL-102）

**当前状态：**
- capabilities 包含：streaming / json_mode / function_calling / vision / image_input / system_prompt
- image_input 与 vision 语义重复
- 缺少 reasoning（推理/思维链）和 search（联网搜索）

**目标状态：**
- capabilities 统一为：streaming / json_mode / function_calling / vision / reasoning / search / system_prompt
- 去掉 image_input（合并到 vision）
- LLM 推断 prompt 更新，新增 reasoning 和 search 的判断逻辑

**supportedSizes 补充：**
- IMAGE 模态别名需要 supportedSizes 字段（如 `["1024x1024", "512x512"]`）
- 优先从关联 Model 继承，null 的通过 LLM 补充

**一次性修正：**
- 提供脚本/运维入口，对所有现有别名重跑推断，补充 reasoning/search/supportedSizes

### Part B — 参考定价（BL-107-A）

**业务流程：**

1. 管理员在别名管理页点击「参考定价」按钮
2. 若该别名已有 openRouterModelId 映射 → 直接查 OpenRouter 最新价格 → 回填（跳到第 5 步）
3. 若无映射 → 后端实时请求 OpenRouter 公开 API `GET https://openrouter.ai/api/v1/models`
4. 按别名 ID 模糊搜索，返回 3-5 个候选模型（含定价），前端展示下拉选择框，支持手动搜索输入
5. 管理员选择正确模型，系统将 USD 定价 × 汇率换算为 CNY 后回填到输入框
6. 管理员 review / 调整 → 保存
7. 后端保存：ModelAlias.sellPrice（÷ 汇率存 USD）+ ModelAlias.openRouterModelId（映射关系）

**重新绑定：** 提供入口清除 openRouterModelId，回到首次选择流程。

**Schema 变更：**
- ModelAlias 新增 `openRouterModelId String?` 字段

### Part C — 全站人民币显示（BL-107-B）

**核心原则：** 数据库仍存 USD，全站展示层统一换算为 CNY。

**汇率配置：**
- 硬编码默认值 7.3
- 管理员可在 Settings 页面修改（存到系统配置表或环境变量）
- 提供一个 API 端点读取当前汇率

**覆盖范围（7 个区域）：**

| 区域 | 页面 | 改动 |
|---|---|---|
| 1. 别名定价 | /admin/model-aliases | 输入框显示/编辑 CNY，保存时 ÷ 汇率存 USD |
| 2. 余额显示 | /balance | 余额数字 × 汇率，标签 USD → ¥ |
| 3. 充值弹窗 | /balance RechargeDialog | 预设金额和自定义输入为 CNY，后端 ÷ 汇率存 USD |
| 4. 交易记录 | /balance transactions | amount 和 balanceAfter × 汇率显示 |
| 5. 调用日志 | /logs, /admin/logs | costPrice/sellPrice × 汇率显示 |
| 6. Models 页 | /models | 定价 × 汇率显示 |
| 7. Admin 页面 | /admin/providers, /admin/models | 定价相关字段 × 汇率显示 |

**工具函数：**
- 提供统一的 `formatCNY(usdValue)` 工具函数，所有页面调用此函数展示金额
- 函数内部读取汇率配置，× 汇率后格式化为 ¥ 前缀

## 关键设计决策

1. capabilities 去掉 image_input，合并到 vision
2. 新增 reasoning（推理/思维链）和 search（联网搜索）
3. 参考定价不做全自动，管理员保持最终控制权
4. 实时调 OpenRouter 公开 API，不依赖本地渠道数据
5. 数据库存储仍为 USD，前端全站统一 CNY
6. 充值金额输入为 CNY，后端 ÷ 汇率存 USD
7. 汇率硬编码默认 7.3，管理员可改，不做实时汇率 API
