# Stitch 重设计 Prompt — AIGC Gateway 待重构页面

> 使用方式：在 Stitch 项目 "AIGC Gateway"（projects/13523510089051052358）中，
> 对每个页面使用下方 prompt 生成新屏幕。设计系统 "The Algorithmic Atelier" 已配置。

---

## 1. Dashboard (`/dashboard`)

为 AIGC Gateway 的 Dashboard 页面重新设计 UI。

设计系统：使用项目已有的 Algorithmic Atelier 设计系统。

功能约束（必须严格遵守，不增不减）：

数据展示：
- 4 张 Summary Cards：Total Calls、Total Cost、Average Latency (ms)、Success Rate (%)
- 余额信息卡：当前余额、上次充值金额和时间
- 低余额警告条（余额低于阈值时显示，含"立即充值"链接）
- 4 张图表：
  - 14 天调用趋势（面积图）
  - 14 天成本趋势（柱状图）
  - 24 小时分布（柱状图）
  - 模型分布（饼图 + 图例，显示各模型百分比）
- 最近调用表（5 行）：Trace ID、Model、Prompt 预览、Status 徽章、Cost、Latency

交互：
- 表格标题 "View All" 链接跳转到 /logs
- 低余额警告 "Recharge Now" 链接跳转到 /balance

禁止：不要新增任何功能、按钮或数据字段。不要移除任何现有功能。仅改变视觉样式和布局。

---

## 2. Models (`/models`)

为 AIGC Gateway 的 Models 页面重新设计 UI。

设计系统：使用项目已有的 Algorithmic Atelier 设计系统。

功能约束（必须严格遵守，不增不减）：

数据展示：
- 按服务商分组的可折叠模型列表
- 每个服务商头部：彩色徽章 + 服务商名 + 模型数量
- 每个模型行：Model ID（等宽字体）、Modality 标签（text/image）、Context Window、Pricing
- 搜索框 + Modality 筛选按钮（All / Text / Image）

交互：
- 搜索框：实时过滤模型（按 ID 匹配）
- Modality 按钮：切换 All / Text / Image
- 服务商头部点击：展开/折叠模型列表
- "Show All" 按钮：展开超过 20 个模型的完整列表

禁止：不要新增任何功能、按钮或数据字段。不要移除任何现有功能。仅改变视觉样式和布局。

---

## 3. Logs (`/logs`)

为 AIGC Gateway 的 Audit Logs 页面重新设计 UI。

设计系统：使用项目已有的 Algorithmic Atelier 设计系统。

功能约束（必须严格遵守，不增不减）：

数据展示：
- 筛选栏：搜索框、日期范围（开始/结束）、状态按钮（All / SUCCESS / ERROR / FILTERED）
- 日志表（每页 20 行）：Time（相对时间）、Trace ID（前 12 位）、Model、Prompt 预览、Status 徽章、Tokens（prompt/completion/total）、Cost、Latency
- 行内展开详情面板：
  - Trace ID + Status + 完整时间戳
  - 指标网格：Model、Tokens、Cost、Latency
  - Request Parameters（JSON）
  - Throughput（tokens/sec）
  - Prompt Messages（按 role 分块显示）
  - Response Content
  - Error Message（红色背景，仅错误时显示）
- 分页：Prev / Next 按钮

交互：
- 搜索框：300ms 防抖后搜索
- 日期筛选：开始/结束日期输入
- 状态按钮：筛选日志状态
- 表格行点击：展开/折叠详情面板（互斥，同时只开一个）
- 详情面板关闭按钮

禁止：不要新增任何功能、按钮或数据字段。不要移除任何现有功能。仅改变视觉样式和布局。

---

## 4. Usage (`/usage`)

为 AIGC Gateway 的 Usage 统计页面重新设计 UI。

设计系统：使用项目已有的 Algorithmic Atelier 设计系统。

功能约束（必须严格遵守，不增不减）：

数据展示：
- 时间段选择器：today / 7d / 30d 按钮
- 4 张 Summary Cards：Total Calls、Total Cost、Total Tokens、Average Latency
- 4 张图表：
  - Daily Calls（面积图）
  - Daily Cost（柱状图）
  - Model Distribution（饼图 + 图例）
  - Model Ranking 表：Model、Calls、Tokens、Cost、Avg Latency

交互：
- 时间段按钮：切换 today / 7d / 30d

禁止：不要新增任何功能、按钮或数据字段。不要移除任何现有功能。仅改变视觉样式和布局。

---

## 5. Balance (`/balance`)

为 AIGC Gateway 的 Balance / 充值页面重新设计 UI。

设计系统：使用项目已有的 Algorithmic Atelier 设计系统。

功能约束（必须严格遵守，不增不减）：

数据展示：
- 余额卡：大字余额金额（余额低时红色）、上次充值信息、充值按钮
- 告警阈值卡：金额输入框 + 保存按钮
- 交易记录表（每页 20 行）：Time、Type 徽章（RECHARGE / DEDUCTION / REFUND / ADJUSTMENT）、Amount（正绿负灰）、Balance After、Description
- 分页：Prev / Next

交互：
- 充值按钮：打开充值弹窗
- 充值弹窗：快捷金额按钮（$10 / $50 / $100 / $500）、自定义金额输入、支付方式切换（支付宝 / 微信）、确认 / 取消按钮
- 告警阈值：输入 + 保存

禁止：不要新增任何功能、按钮或数据字段。不要移除任何现有功能。仅改变视觉样式和布局。

---

## 6. Quick Start (`/quickstart`)

为 AIGC Gateway 的 Quick Start 页面重新设计 UI。

设计系统：使用项目已有的 Algorithmic Atelier 设计系统。

功能约束（必须严格遵守，不增不减）：

数据展示：
- 4 个步骤卡片，每个含标题 + 代码块（深色主题语法高亮）：
  1. NPM install 命令
  2. Basic chat 示例（SDK 初始化 + 调用）
  3. Streaming chat 示例
  4. Image generation 示例

交互：
- 每个代码块的复制按钮（点击后图标切换为 ✓，1.5 秒后恢复）

禁止：不要新增任何功能、按钮或数据字段。不要移除任何现有功能。仅改变视觉样式和布局。

---

## 7. MCP Setup (`/mcp-setup`)

为 AIGC Gateway 的 MCP 配置页面重新设计 UI。

设计系统：使用项目已有的 Algorithmic Atelier 设计系统。

功能约束（必须严格遵守，不增不减）：

数据展示：
- Step 1 — API Key 选择：下拉框列出 ACTIVE 状态的 API Key（显示 prefix + name），无 Key 时显示提示 + 链接到 /keys
- Step 2 — Config 代码块：3 个 Tab（Claude / Cursor / Generic），每个 Tab 显示对应的 JSON 配置 + 配置文件路径提示 + 复制按钮
- Step 3 — Tools 列表：7 个 Tool 徽章 + 描述（list_models / chat / generate_image / list_logs / get_log_detail / get_balance / get_usage_summary）

交互：
- API Key 下拉框选择
- Tab 切换（Claude / Cursor / Generic）
- 复制按钮复制 JSON 配置

禁止：不要新增任何功能、按钮或数据字段。不要移除任何现有功能。仅改变视觉样式和布局。

---

## 8. Settings (`/settings`)

为 AIGC Gateway 的 Settings 页面重新设计 UI。

设计系统：使用项目已有的 Algorithmic Atelier 设计系统。

功能约束（必须严格遵守，不增不减）：

数据展示：
- Profile 卡：Email（只读）、Name（可编辑）、保存按钮
- Change Password 卡：旧密码、新密码（8 位最小）、确认新密码、修改按钮
- Notifications 卡：低余额提醒开关 + 描述文字
- Sign Out 卡：退出按钮（红色危险样式）+ 描述

交互：
- Name 输入 + Save 按钮
- 密码输入（3 个字段）+ Change Password 按钮
- 通知开关 toggle
- Sign Out 按钮（清空 localStorage 跳转到 /login）

禁止：不要新增任何功能、按钮或数据字段。不要移除任何现有功能。仅改变视觉样式和布局。

---

## 9. Admin: Providers (`/admin/providers`)

为 AIGC Gateway 的服务商管理页面重新设计 UI。

设计系统：使用项目已有的 Algorithmic Atelier 设计系统。

功能约束（必须严格遵守，不增不减）：

数据展示：
- 服务商表：Name、Base URL、Adapter Type 徽章、Channel Count、Status 徽章（ACTIVE / DISABLED）、Actions 列
- 新建/编辑弹窗：Name、Display Name、Base URL、API Key（密码输入）、Adapter Type 下拉（openai-compat / volcengine / siliconflow）
- Config Override 弹窗：Temperature Min/Max、Chat Endpoint、Image Endpoint、Image via Chat 开关、Supports Models API 开关、Supports System Role 开关、Currency 下拉（USD / CNY）、Quirks 文本框

交互：
- Add Provider 按钮：打开新建弹窗
- 每行 Edit 按钮：打开编辑弹窗（预填数据）
- 每行 Config 按钮：打开 Config Override 弹窗
- Status 徽章点击：切换 ACTIVE ↔ DISABLED

禁止：不要新增任何功能、按钮或数据字段。不要移除任何现有功能。仅改变视觉样式和布局。

---

## 10. Admin: Health (`/admin/health`)

为 AIGC Gateway 的健康监控页面重新设计 UI。

设计系统：使用项目已有的 Algorithmic Atelier 设计系统。

功能约束（必须严格遵守，不增不减）：

数据展示：
- 3 张 Summary Cards：Active 数、Degraded 数、Disabled 数（对应绿/黄/红色）
- 健康检查卡片网格，每张卡片：
  - 状态圆点（绿/黄/红）
  - Model 名 + Provider 名
  - Priority + Modality
  - 上次检查时间（相对时间）+ Latency
  - 三级检查结果（L1 Connectivity / L2 Format / L3 Quality）：Pass ✓ / Fail ✗ / Unknown ?
  - Check 按钮

交互：
- Check 按钮：触发手动健康检查（按钮变为 loading "..." 状态）

禁止：不要新增任何功能、按钮或数据字段。不要移除任何现有功能。仅改变视觉样式和布局。

---

## 11. Admin: Logs (`/admin/logs`)

为 AIGC Gateway 的管理员审计日志页面重新设计 UI。

设计系统：使用项目已有的 Algorithmic Atelier 设计系统。

功能约束（必须严格遵守，不增不减）：

数据展示：
- 筛选栏：搜索框、状态按钮（All / SUCCESS / ERROR / FILTERED）
- 日志表（每页 20 行）：Time、Trace ID（前 12 位）、Project Name、Model、Channel（provider/model）、Status 徽章、Tokens（prompt/completion）、Cost（成本价）、Sell（售价）、Latency
- 分页：Prev / Next

交互：
- 搜索框 + Enter 键或搜索按钮触发搜索
- 状态按钮：即时筛选

禁止：不要新增任何功能、按钮或数据字段。不要移除任何现有功能。仅改变视觉样式和布局。

---

## 12. Admin: Usage (`/admin/usage`)

为 AIGC Gateway 的管理员用量统计页面重新设计 UI。

设计系统：使用项目已有的 Algorithmic Atelier 设计系统。

功能约束（必须严格遵守，不增不减）：

数据展示：
- 时间段选择器：today / 7d / 30d
- 4 张 Summary Cards：Total Calls、Revenue、Cost、Margin（含利润率百分比）
- 2 张图表：
  - Revenue by Provider（饼图 + 图例）
  - Calls by Model（水平柱状图，Top 8 模型）
- Provider Cost 表：Provider、Calls、Cost、Revenue、Margin、Margin %

交互：
- 时间段按钮：切换 today / 7d / 30d

禁止：不要新增任何功能、按钮或数据字段。不要移除任何现有功能。仅改变视觉样式和布局。

---

## 13. Admin: Users (`/admin/users`)

为 AIGC Gateway 的用户管理页面重新设计 UI。

设计系统：使用项目已有的 Algorithmic Atelier 设计系统。

功能约束（必须严格遵守，不增不减）：

数据展示：
- 用户表：Name（无名显示 "—"）、Email、Project Count、Total Balance、Total Calls（千分位格式）、Registered（相对时间 + 完整时间戳 tooltip）、Detail 按钮

交互：
- Detail 按钮：链接到 /admin/users/{userId} 详情页

禁止：不要新增任何功能、按钮或数据字段。不要移除任何现有功能。仅改变视觉样式和布局。
