# AIGC Gateway — 待重构页面清单 + Stitch 功能约束

> 每个页面给 Stitch 设计时，用对应的功能约束部分作为 prompt 输入
> 约束原则：**仅改变视觉样式和布局，不新增或减少任何功能**

---

## 重构状态总览

| 页面 | 路由 | 规格书章节 | 重构状态 |
|------|------|----------|---------|
| API Keys | /keys | §2.2 | ✅ 已重构（Stitch 设计稿已实现） |
| API Key Settings | /keys/[id] | §2.2 | ✅ 已重构 |
| Models & Channels (Admin) | /admin/models | §4.2 | ✅ 已重构（三层折叠结构） |
| Models (Developer) | /models | §2.3 | ✅ 已重构（两层分组） |
| Dashboard | /dashboard | §2.1 | ⏳ 待重构 |
| Audit Logs | /logs | §2.4 | ⏳ 待重构 |
| Usage | /usage | §2.5 | ⏳ 待重构 |
| Balance | /balance | §2.6 | ⏳ 待重构 |
| Quick Start | /quickstart | §2.7 | ⏳ 待重构 |
| MCP Setup | /mcp-setup | MCP Developer Guide | ⏳ 待重构 |
| Login / Register | /login, /register | §3.1 | ⏳ 待重构 |
| Account Settings | /settings | §3.2 | ⏳ 待重构 |
| API Docs | /docs | §3.3 | ⏳ 待重构 |
| Providers (Admin) | /admin/providers | §4.1 | ⏳ 待重构 |
| Health (Admin) | /admin/health | §4.4 | ⏳ 待重构 |
| Logs (Admin) | /admin/logs | §4.5 | ⏳ 待重构 |
| Usage (Admin) | /admin/usage | §4.6 | ⏳ 待重构 |
| Users (Admin) | /admin/users | §4.7 | ⏳ 待重构 |

---

## 每个待重构页面的 Stitch Prompt 功能约束

### 1. Dashboard（/dashboard）— 规格书 §2.1

```
为 AIGC Gateway 的 Dashboard 页面重新设计 UI。

设计系统：使用项目已有的设计系统，与已重构的 API Keys 页面风格保持一致。

功能约束（必须严格遵守，不增不减）：

指标卡片（4个）：
- 今日调用次数（和昨日对比百分比）
- 今日费用（和昨日对比）
- 平均延迟（ms）
- 成功率（%）

图表区域（4个）：
- 调用趋势面积图（近7天，按天）
- 费用趋势柱状图（近7天）
- 调用时段分布（24小时热力/柱状）
- 模型调用占比环形图

最近调用表格：
- 显示最近5条调用记录
- 列：时间、模型、状态（badge）、延迟、费用
- 行可点击跳转到审计日志详情

交互：
- 无筛选条件（固定展示当前项目的数据）
- 图表无交互控件

API：GET /api/projects/:id/dashboard

禁止：不要新增任何功能、按钮或数据字段。不要移除任何上述功能。仅改变视觉样式和布局。
```

### 2. Audit Logs（/logs）— 规格书 §2.4

```
为 AIGC Gateway 的审计日志页面重新设计 UI。

设计系统：与已重构的 API Keys 页面风格保持一致。

功能约束（必须严格遵守，不增不减）：

顶部筛选区：
- 全文搜索框（搜索 prompt 和输出内容）
- 状态筛选按钮组：All / Success / Error / Timeout / Filtered
- 模型下拉选择
- 日期范围选择器（开始日期 - 结束日期）

日志表格：
- 列：时间、traceId（可复制）、模型、状态（badge颜色区分）、延迟(ms)、Token用量、费用
- 支持排序（按时间、延迟、费用）
- 分页（每页20条，显示总数和页码导航）

详情展开面板（点击某行展开）：
- Prompt 快照：完整 messages 数组，语法高亮
- AI 输出：完整 responseContent
- 请求参数：temperature、max_tokens 等
- 性能指标：latencyMs、ttftMs、tokensPerSecond
- 费用明细：promptTokens、completionTokens、sellPrice

交互：
- 行点击展开/折叠详情面板
- traceId 点击复制
- 筛选条件变更自动刷新
- URL 参数同步（分享链接可还原筛选状态）

API：GET /api/projects/:id/logs（分页、筛选、全文搜索）

禁止：不要新增任何功能。不要移除任何上述功能。仅改变视觉样式和布局。
```

### 3. Usage（/usage）— 规格书 §2.5

```
为 AIGC Gateway 的用量统计页面重新设计 UI。

设计系统：与已重构的 API Keys 页面风格保持一致。

功能约束（必须严格遵守，不增不减）：

时间范围选择：
- 快捷按钮：今天 / 7天 / 30天 / 自定义
- 自定义日期范围选择器

指标卡片（4个）：
- 总调用次数
- 总费用
- 总 Token 数
- 平均每次调用费用

图表区域：
- 调用量趋势图（按天，折线或面积）
- 费用趋势图（按天，柱状）

模型排行表格：
- 列：模型名、调用次数、总Token、总费用、占比
- 按费用降序排列

交互：
- 切换时间范围自动刷新所有指标和图表
- 无分页（模型数量有限）

API：GET /api/projects/:id/usage（时间范围参数）

禁止：不要新增任何功能。不要移除任何上述功能。仅改变视觉样式和布局。
```

### 4. Balance（/balance）— 规格书 §2.6

```
为 AIGC Gateway 的余额与充值页面重新设计 UI。

设计系统：与已重构的 API Keys 页面风格保持一致。

功能约束（必须严格遵守，不增不减）：

余额卡片：
- 当前余额（大字号突出）
- 余额不足时显示警告

充值区域：
- 充值按钮 → 打开充值对话框
- 充值对话框：
  - 预设档位（¥10 / ¥50 / ¥100 / ¥500）
  - 自定义金额输入
  - 支付方式选择（支付宝 / 微信支付）
  - 确认按钮 → 跳转支付

交易记录表格：
- 列：时间、类型（充值/扣费，badge区分）、金额、余额变动、关联traceId（扣费时）
- 分页
- 充值记录显示支付状态（成功/待支付/已关闭）

交互：
- 充值对话框的档位点击选中高亮
- 自定义金额输入校验（最小金额、正数）
- 交易记录分页

API：
- GET /api/projects/:id/balance
- POST /api/projects/:id/recharge
- GET /api/projects/:id/transactions（分页）

禁止：不要新增任何功能。不要移除任何上述功能。仅改变视觉样式和布局。
```

### 5. Quick Start（/quickstart）— 规格书 §2.7

```
为 AIGC Gateway 的快速开始页面重新设计 UI。

设计系统：与已重构的 API Keys 页面风格保持一致。

功能约束（必须严格遵守，不增不减）：

4步引导：
- Step 1: 安装 SDK（npm install @guangai/aigc-sdk）
- Step 2: 初始化（代码示例：import + new Gateway）
- Step 3: 文本生成（代码示例：gateway.chat 非流式 + 流式）
- Step 4: 图片生成（代码示例：gateway.image）

每步包含：
- 步骤编号和标题
- 代码块（语法高亮，带复制按钮）
- 简短说明文字

底部：
- "查看完整 API 文档" 链接

交互：
- 代码块复制按钮 → 复制到剪贴板 + toast 提示
- 无其他交互

禁止：不要新增任何功能。不要移除任何上述功能。仅改变视觉样式和布局。
```

### 6. Login / Register（/login, /register）— 规格书 §3.1

```
为 AIGC Gateway 的登录和注册页面重新设计 UI。

设计系统：与已重构的 API Keys 页面风格保持一致。

功能约束（必须严格遵守，不增不减）：

登录页：
- 居中卡片布局
- 邮箱输入框
- 密码输入框
- "登录" 按钮
- "还没有账号？注册" 链接

注册页：
- 居中卡片布局
- 名称输入框
- 邮箱输入框
- 密码输入框
- 确认密码输入框
- "注册" 按钮
- "已有账号？登录" 链接

表单校验规则：
- 邮箱：必填，合法格式
- 密码：必填，≥8位
- 确认密码：必须和密码一致
- 名称：必填，2-50字符

交互：
- 校验失败显示红色错误提示
- 提交时按钮 loading 状态
- 注册成功 → 跳转邮箱验证提示页
- 登录成功 → 跳转 /dashboard

禁止：不要新增任何功能（如第三方登录、手机号登录等）。仅改变视觉样式和布局。
```

### 7. Account Settings（/settings）— 规格书 §3.2

```
为 AIGC Gateway 的账号设置页面重新设计 UI。

设计系统：与已重构的 API Keys 页面风格保持一致。

功能约束（必须严格遵守，不增不减）：

个人信息区域：
- 显示名称（可编辑）
- 邮箱（只读）
- 保存按钮

修改密码区域：
- 当前密码输入框
- 新密码输入框
- 确认新密码输入框
- 修改密码按钮

通知设置区域：
- 余额告警阈值输入
- 邮件通知开关

交互：
- 保存成功 toast 提示
- 密码校验同注册页

API：
- GET /api/auth/me
- PATCH /api/auth/me
- POST /api/auth/change-password

禁止：不要新增任何功能。仅改变视觉样式和布局。
```

### 8. Providers (Admin)（/admin/providers）— 规格书 §4.1

```
为 AIGC Gateway 的服务商管理页面重新设计 UI。

设计系统：与已重构的 API Keys 和 Models & Channels 页面风格保持一致。

功能约束（必须严格遵守，不增不减）：

服务商列表表格：
- 列：名称、显示名、Base URL、状态（Active/Disabled）、通道数、操作
- 操作：编辑、配置覆盖

添加/编辑表单（对话框或侧边面板）：
- Name（唯一标识）
- Display Name
- Base URL
- Auth Config（JSON 编辑器或表单）
- Proxy URL（可选）
- Status 切换

配置覆盖编辑面板：
- Temperature 范围（min/max）
- Chat Endpoint 路径
- Image Endpoint 路径
- Image Via Chat 开关
- Supports Models API 开关
- Supports System Role 开关
- Currency 选择
- Quirks（JSON 编辑器）
- Doc URLs（文档页面URL列表，用于AI自动同步）

交互：
- 创建/编辑保存后刷新列表
- Status 切换需确认

API：
- GET /api/admin/providers
- POST /api/admin/providers
- PATCH /api/admin/providers/:id

禁止：不要新增任何功能。不要移除任何上述功能。仅改变视觉样式和布局。
```

### 9. Health (Admin)（/admin/health）— 规格书 §4.4

```
为 AIGC Gateway 的健康监控页面重新设计 UI。

设计系统：与已重构页面风格保持一致。

功能约束（必须严格遵守，不增不减）：

概览卡片（3个）：
- 健康通道数（绿色）
- 降级通道数（黄色）
- 禁用通道数（红色）

通道健康列表：
- 每个通道一张卡片
- 卡片内容：服务商名 + 模型名、状态灯（绿/黄/红）、L1/L2/L3 检查结果（勾/叉）、最近检查时间、延迟
- 手动检查按钮（每张卡片右上角）

检查历史（点击卡片展开）：
- 最近 10 次检查记录
- 每条：时间、级别、结果、延迟、错误信息

交互：
- 手动检查按钮 → 触发单通道检查 → 刷新结果
- 卡片点击展开/折叠历史

API：
- GET /api/admin/health
- POST /api/admin/health/:channelId/check

禁止：不要新增任何功能。不要移除任何上述功能。仅改变视觉样式和布局。
```

### 10. Logs (Admin)（/admin/logs）— 规格书 §4.5

```
为 AIGC Gateway 的全局审计日志页面重新设计 UI。

设计系统：与已重构页面风格保持一致。

功能约束（必须严格遵守，不增不减）：

和开发者审计日志页面相同，额外增加：
- 项目筛选下拉（可选择所有项目或某个项目）
- 表格额外列：channelId、costPrice（运营可见，开发者不可见）
- 全文搜索同样可用

其余功能同开发者 Audit Logs 页面。

禁止：不要新增任何功能。不要移除任何上述功能。仅改变视觉样式和布局。
```

### 11. Usage (Admin)（/admin/usage）— 规格书 §4.6

```
为 AIGC Gateway 的全局用量页面重新设计 UI。

设计系统：与已重构页面风格保持一致。

功能约束（必须严格遵守，不增不减）：

指标卡片（4个）：
- 总调用次数
- 总收入（sellPrice 汇总）
- 总成本（costPrice 汇总）
- 毛利（收入 - 成本）

图表区域：
- 收入 vs 成本趋势图（双线/双柱，按天）
- 按服务商分布饼图
- 按模型分布饼图

服务商费用明细表格：
- 列：服务商名、调用次数、总成本、总收入、毛利、毛利率
- 按收入降序排列

时间范围选择：今天 / 7天 / 30天 / 自定义

交互：
- 切换时间范围刷新
- 无分页

API：GET /api/admin/usage（时间范围参数）

禁止：不要新增任何功能。不要移除任何上述功能。仅改变视觉样式和布局。
```

### 12. Users (Admin)（/admin/users）— 规格书 §4.7

```
为 AIGC Gateway 的开发者管理页面重新设计 UI。

设计系统：与已重构页面风格保持一致。

功能约束（必须严格遵守，不增不减）：

开发者列表表格：
- 列：名称、邮箱、注册时间、项目数、总充值、总消费、状态
- 搜索（按名称/邮箱）
- 分页

详情页（/admin/users/:id）：
- 基本信息卡片（名称、邮箱、注册时间、角色）
- 项目列表（该用户的所有项目 + 余额）
- 手动充值功能（选择项目 → 输入金额 → 确认）
- 最近调用记录

交互：
- 列表行点击进入详情页
- 手动充值需确认对话框

API：
- GET /api/admin/users（分页、搜索）
- GET /api/admin/users/:id
- POST /api/admin/users/:id/recharge

禁止：不要新增任何功能。不要移除任何上述功能。仅改变视觉样式和布局。
```

### 13. MCP Setup（/mcp-setup）

```
为 AIGC Gateway 的 MCP 配置页面重新设计 UI。

设计系统：与已重构页面风格保持一致。

功能约束（必须严格遵守，不增不减）：

配置说明区域：
- MCP 是什么（简短说明）
- 支持的 AI 编辑器列表

配置示例（分 tab 展示）：
- Claude Code 配置（~/.claude/claude_code_config.json 代码块）
- Cursor 配置（.cursor/mcp.json 代码块）
- 通用配置（URL + 传输协议 + 认证信息表格）

每个代码块带复制按钮。

可用 Tools 列表：
- 7 个 Tools 名称 + 说明
- 标注哪些产生费用、哪些免费

交互：
- Tab 切换编辑器配置
- 代码块复制按钮

禁止：不要新增任何功能。仅改变视觉样式和布局。
```

### 14. API Docs（/docs）

```
为 AIGC Gateway 的 API 文档页面重新设计 UI。

设计系统：与已重构页面风格保持一致。

功能约束（必须严格遵守，不增不减）：

文档内容：
- 认证方式说明（Bearer Token）
- 端点列表：POST /v1/chat/completions、POST /v1/images/generations、GET /v1/models
- 每个端点：请求格式、响应格式、代码示例
- 错误码表格（401/402/404/429 等）
- 限流规则说明

交互：
- 侧边目录导航（锚点跳转）
- 代码块复制按钮

禁止：不要新增任何功能。仅改变视觉样式和布局。
```
