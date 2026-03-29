# AIGC Gateway — 控制台页面交互规格

> 版本 1.0 · 2026年3月29日
> 配套文档：AIGC-Gateway-P1-PRD · AIGC-Gateway-API-Specification
> 技术栈：Next.js + shadcn/ui + Recharts + TanStack Table + Tailwind CSS

**关于占位符：** `${SITE_URL}` 代表控制台地址，`${API_BASE_URL}` 代表 API 网关地址，均通过环境变量配置。

---

## 1. 全局规范

### 1.1 布局结构

```
┌──────────────────────────────────────────────┐
│  侧边栏（固定 210px）  │     主内容区           │
│                        │                       │
│  Logo + 产品名          │  顶部栏               │
│  ─────────             │  ├ 页面标题            │
│  nav-section: project  │  ├ 项目名              │
│    Dashboard           │  └ 余额徽标            │
│    API keys            │  ─────────────         │
│    Models              │                       │
│  nav-section: observe  │  页面内容              │
│    Audit logs          │                       │
│    Usage               │                       │
│  nav-section: billing  │                       │
│    Balance             │                       │
│  nav-section: help     │                       │
│    Quick start         │                       │
│    API docs            │                       │
│  ─────────             │                       │
│  用户头像 + 名称        │                       │
└──────────────────────────────────────────────┘
```

- 侧边栏固定在左侧，不随页面滚动
- 主内容区可滚动
- 运营角色（admin）侧边栏额外显示"管理"分组（服务商 / 模型 / 通道 / 健康 / 全局审计 / 全局用量 / 开发者管理）

### 1.2 通用交互规范

| 规范 | 说明 |
|------|------|
| 表格分页 | 默认每页 20 条，可选 10/20/50/100 |
| 表格排序 | 点击列头切换升序/降序/默认，当前排序列显示箭头图标 |
| 加载状态 | 骨架屏（Skeleton），不使用全屏 Loading |
| 空状态 | 居中图标 + 文案 + 操作按钮（如"创建第一个项目"） |
| 错误状态 | 红色 Alert 组件，显示错误信息 + 重试按钮 |
| 操作确认 | 危险操作（删除、吊销）弹出确认对话框 |
| Toast 通知 | 右上角，操作成功/失败后自动消失（3秒） |
| 时间格式 | 列表中显示相对时间（"3分钟前"），hover 显示完整时间 |
| 金额格式 | 美元显示到小数点后 4 位（$0.0048），余额显示 2 位（$128.45） |
| 数字格式 | 千分位分隔（2,847），token 数显示到整数 |

### 1.3 权限矩阵

| 页面 | DEVELOPER | ADMIN |
|------|-----------|-------|
| Dashboard | 本项目数据 | 全局数据 |
| API keys | 本项目 Key | 所有项目 Key |
| Models | 查看 | 查看 + 编辑 |
| Audit logs | 本项目日志（无 channelId/costPrice） | 全局日志（含 channelId/costPrice） |
| Usage | 本项目用量 | 全局用量 + 毛利 |
| Balance | 本项目余额 + 充值 | 所有项目余额 + 手动充值 |
| Quick start | 查看 | 查看 |
| API docs | 查看 | 查看 |
| 服务商管理 | 不可见 | CRUD |
| 模型管理 | 不可见 | CRUD |
| 通道管理 | 不可见 | CRUD |
| 健康监控 | 不可见 | 查看 + 手动触发 |
| 全局审计 | 不可见 | 查看 + 搜索 |
| 全局用量 | 不可见 | 查看 |
| 开发者管理 | 不可见 | 查看 + 手动充值 |

---

## 2. 开发者页面（7页）

### 2.1 Dashboard

**数据接口：** `GET /api/projects/:id` + `GET /api/projects/:id/usage?period=today` + `GET /api/projects/:id/usage/daily?period=7d` + `GET /api/projects/:id/logs?pageSize=5`

**布局：**

```
[指标卡片 x4]                              ← grid 4列
[调用趋势(14天) 面积图] [成本趋势(14天) 柱状图]  ← grid 2列
[小时分布 柱状图]       [模型分布 环形图]        ← grid 2列
[最近调用 表格 5行]                            ← 全宽卡片
```

**指标卡片（4个）：**

| 卡片 | 主值 | 副信息 | 趋势 |
|------|------|--------|------|
| Today's calls | 当日调用总数 | vs yesterday | +/-百分比 |
| Today's cost | 当日总费用（sellPrice） | vs yesterday | +/-百分比 |
| Avg latency | 平均响应延迟 | TTFT 均值 | — |
| Success rate | 成功率百分比 | 当日错误数 | — |

**图表交互：**
- 面积图/柱状图：hover 显示 tooltip（日期 + 数值）
- 环形图：hover 高亮扇区 + 显示百分比
- 所有图表响应式，容器宽度变化时自适应

**最近调用表格：**

| 列 | 宽度 | 说明 |
|----|------|------|
| Trace | 110px | 单等宽字体，蓝色，可点击跳转到审计日志详情 |
| Model | 120px | 加粗 |
| Prompt | flex | 截断显示，tooltip 显示完整内容 |
| Status | 80px | 彩色 Badge |
| Cost | 70px | 等宽字体 |
| Latency | 70px | 等宽字体，灰色 |

点击"View all"跳转到审计日志页面。

---

### 2.2 API keys

**数据接口：** `GET /api/projects/:id/keys` + `POST /api/projects/:id/keys` + `DELETE /api/projects/:id/keys/:keyId`

**页面元素：**

```
[页面标题: API keys]  [+ 创建 Key 按钮]
[Key 列表表格]
```

**表格列：**

| 列 | 说明 |
|----|------|
| Key | 显示前缀 + 掩码：`pk_a1b2c...****` |
| Name | 用途标注 |
| Status | Active (绿) / Revoked (红) |
| Last used | 最后使用时间（相对时间） |
| Created | 创建时间 |
| Actions | 吊销按钮（红色文字按钮） |

**创建 Key 流程：**

1. 点击"创建 Key"→ 弹出对话框
2. 输入 Key 名称（可选，如"production"）
3. 确认后显示完整 Key 值 + 复制按钮 + 警告文案"此 Key 仅展示一次，请立即复制保存"
4. 关闭对话框后 Key 值不再可见

**吊销 Key 流程：**

1. 点击吊销 → 确认对话框："吊销后该 Key 将立即失效，使用此 Key 的所有请求都会返回 401。确认吊销？"
2. 确认后状态变为 Revoked，不可恢复

**校验规则：**
- Key 名称：可选，最长 50 字符
- 每个项目最多创建 20 个 Key

---

### 2.3 Models

**数据接口：** `GET /v1/models`

**页面元素：**

```
[搜索框]  [模态筛选: All / Text / Image]
[模型列表表格]
```

**表格列：**

| 列 | 说明 |
|----|------|
| Model | 平台统一名称，如 `openai/gpt-4o` |
| Type | Badge: text (蓝) / image (粉) |
| Price | 文本: `$0.28 / $0.42 /M`  图片: `$0.01/img`  免费: 绿色加粗 `Free` |
| Context | 上下文窗口：`128K` / `200K` / `1M` |
| Status | Badge: active (绿) |

**交互：**
- 搜索框实时过滤（按模型名匹配）
- 模态筛选按钮组（All / Text / Image）
- 表格只读，开发者不可编辑

---

### 2.4 Audit logs

**数据接口：** `GET /api/projects/:id/logs` + `GET /api/projects/:id/logs/:traceId` + `GET /api/projects/:id/logs/search`

**页面元素：**

```
[搜索框 (全文)]  [状态筛选: All/Success/Error/Filtered]  [日期范围选择器]
[调用详情展开面板]  ← 点击行时出现
[日志列表表格]
[分页器]
```

**搜索框：**
- placeholder: "Search prompts, models, trace IDs..."
- 输入后按回车或 300ms 防抖触发搜索
- 调用全文搜索接口 `/logs/search?q=xxx`

**状态筛选：**
- 按钮组：All / Success / Error / Filtered
- 选中状态用品牌色高亮
- 筛选与搜索可叠加

**日期范围选择器：**
- 预设选项：Today / Last 7 days / Last 30 days / Custom
- Custom 选择起止日期

**表格列：**

| 列 | 宽度 | 说明 |
|----|------|------|
| Time | 60px | HH:MM 格式，hover 显示完整时间 |
| Trace | 100px | 等宽字体，蓝色 |
| Model | 120px | 加粗 |
| Prompt | flex | 截断，tooltip 完整内容 |
| Status | 70px | 彩色 Badge |
| Tokens | 70px | 等宽字体，图片调用显示 `--` |
| Cost | 60px | 等宽字体，$格式 |
| Latency | 60px | 等宽字体，秒 |

**行点击展开详情面板：**

点击任意行，表格上方展开详情面板，包含：

```
[traceId + Badge + 时间]                     [关闭按钮 x]
[指标卡片: Model | Tokens | Cost | Latency]  ← grid 4列
[参数 | 吞吐量]                               ← grid 2列
[System prompt]                               ← 代码块，有滚动条
[User message]                                ← 代码块
[Response]                                    ← 代码块，错误时红色背景
```

- 再次点击同一行或点击关闭按钮收起面板
- 点击其他行切换到该行的详情
- 代码块使用等宽字体，保留换行，最大高度 120px 后滚动

---

### 2.5 Usage

**数据接口：** `GET /api/projects/:id/usage` + `GET /api/projects/:id/usage/daily` + `GET /api/projects/:id/usage/by-model`

**页面元素：**

```
[时间范围选择器: Today / 7d / 30d / Custom]
[指标卡片 x4: 总调用 | 总费用 | 总token | 平均延迟]
[每日调用量折线图 + 每日费用柱状图]            ← grid 2列
[按模型分布饼图 + 模型费用排行表格]            ← grid 2列
```

**模型费用排行表格：**

| 列 | 说明 |
|----|------|
| Model | 模型名 |
| Calls | 调用次数 |
| Tokens | 总 token 数 |
| Cost | 总费用（sellPrice） |
| Avg latency | 平均延迟 |

按 Cost 降序排列。

---

### 2.6 Balance

**数据接口：** `GET /api/projects/:id/balance` + `POST /api/projects/:id/recharge` + `GET /api/projects/:id/transactions`

**页面元素：**

```
[余额卡片: 当前余额 $128.45]  [充值按钮]  [告警阈值设置]
[交易记录表格]
[分页器]
```

**余额卡片：**
- 大字号显示当前余额
- 余额 < 告警阈值时卡片边框变为红色

**充值流程：**

1. 点击充值 → 弹出对话框
2. 选择金额档位（$10 / $50 / $100 / $500 / 自定义）
3. 选择支付方式（支付宝 / 微信）
4. 确认 → 生成支付二维码或跳转支付页面
5. 支付成功 → Toast 通知 + 刷新余额

**告警阈值设置：**
- 输入框设置告警金额（如 $5.00）
- 余额低于此值时通过邮件通知

**交易记录表格：**

| 列 | 说明 |
|----|------|
| Time | 交易时间 |
| Type | Badge: 充值(绿) / 扣费(灰) / 退款(蓝) / 调整(琥珀) |
| Amount | 正数绿色，负数灰色 |
| Balance after | 交易后余额 |
| Description | 扣费时显示模型名 + traceId |

**校验规则：**
- 充值最小金额：$1.00
- 充值最大金额：$10,000.00
- 自定义金额精确到小数点后 2 位

---

### 2.7 Quick start

**纯静态页面，无数据接口。**

```
[步骤 1: 安装 SDK]      ← 代码块 + 复制按钮
[步骤 2: 首次调用]      ← 代码块 + 复制按钮
[步骤 3: 流式响应]      ← 代码块 + 复制按钮
[步骤 4: 图片生成]      ← 代码块 + 复制按钮
```

- 每个步骤为一个卡片，标题 + 深色代码块
- 代码块右上角有复制按钮，点击后显示"Copied!"（1.5秒后恢复）
- 代码示例中的 API Key 用 `pk_...` 占位

---

## 3. 共用页面（3页）

### 3.1 注册 / 登录

**数据接口：** `POST /api/auth/register` + `POST /api/auth/login` + `POST /api/auth/verify-email`

**布局：** 居中卡片，无侧边栏。

**注册表单：**

| 字段 | 类型 | 校验规则 |
|------|------|---------|
| Email | email input | 必填，邮箱格式，唯一性（后端校验返回 409） |
| Password | password input | 必填，最少 8 位，含字母和数字 |
| Confirm password | password input | 必填，与 Password 一致 |
| Name | text input | 可选，最长 50 字符 |

- 注册成功 → 跳转到"请验证邮箱"提示页
- 已有账号 → 链接切换到登录

**登录表单：**

| 字段 | 类型 | 校验规则 |
|------|------|---------|
| Email | email input | 必填 |
| Password | password input | 必填 |

- 登录成功 → 跳转到 Dashboard
- 邮箱未验证 → 提示"请先验证邮箱" + 重发验证邮件按钮
- 密码错误 → 显示"邮箱或密码错误"（不区分哪个错）

### 3.2 账号设置

**页面元素：**

```
[个人信息卡片: 邮箱(只读) + 名称(可编辑)]
[修改密码卡片: 旧密码 + 新密码 + 确认新密码]
[通知设置卡片: 余额告警邮件开关]
```

### 3.3 API docs

- 内嵌 API 文档或链接到外部文档站点
- P1 可用 Markdown 渲染的静态页面，P2 考虑接入 Swagger UI

---

## 4. 运营页面（8页）

### 4.1 服务商管理

**数据接口：** `GET/POST/PATCH /api/admin/providers` + `GET/PATCH /api/admin/providers/:id/config`

**页面元素：**

```
[+ 添加服务商 按钮]
[服务商列表表格]
```

**表格列：**

| 列 | 说明 |
|----|------|
| Name | 显示名 |
| Base URL | 端点地址 |
| Adapter | 适配器类型 Badge |
| Channels | 通道数量 |
| Status | Active / Disabled 开关 |
| Actions | 编辑 / 配置覆盖 |

**添加/编辑服务商表单：**

| 字段 | 类型 | 校验规则 |
|------|------|---------|
| Provider name | text | 必填，唯一，英文小写 + 连字符 |
| Display name | text | 必填 |
| Base URL | url | 必填，以 https:// 开头 |
| Auth type | select | bearer / api-key / custom |
| API Key | password | 必填，加密存储 |
| Rate limit (RPM) | number | 可选 |
| Proxy URL | url | 可选 |
| Adapter type | select | openai-compat / volcengine / siliconflow / minimax / iflytek |

**配置覆盖编辑（独立面板）：**

| 字段 | 类型 | 说明 |
|------|------|------|
| Temperature min | number | 默认 0 |
| Temperature max | number | 默认 2 |
| Chat endpoint | text | 默认 /chat/completions |
| Image endpoint | text | 可为空 |
| Image via chat | switch | 默认关 |
| Supports /models | switch | 默认关 |
| Supports system role | switch | 默认开 |
| Currency | select | USD / CNY |
| Quirks | tag input | 可添加多个 quirk 标记 |

---

### 4.2 模型管理

**数据接口：** `GET/POST/PATCH /api/admin/models`

**表格列：**

| 列 | 说明 |
|----|------|
| Name | 平台统一名称 |
| Display name | 展示名 |
| Modality | text / image Badge |
| Context | 上下文窗口 |
| Channels | 关联通道数 |
| Actions | 编辑 |

**添加/编辑模型表单：**

| 字段 | 校验规则 |
|------|---------|
| Name | 必填，格式 `provider/model`，唯一 |
| Display name | 必填 |
| Modality | 必选：text / image / video / audio |
| Max tokens | 可选，正整数 |
| Context window | 可选，正整数 |
| Capabilities | 多选开关：vision / tools / streaming / json_mode |
| Description | 可选 |

---

### 4.3 通道管理

**数据接口：** `GET/POST/PATCH/DELETE /api/admin/channels`

**页面元素：**

```
[筛选: 按服务商 | 按模型 | 按状态]  [+ 添加通道]
[通道列表表格]
```

**表格列：**

| 列 | 说明 |
|----|------|
| Model | 平台模型名 |
| Provider | 服务商名 |
| Real model ID | 服务商真实模型标识 |
| Priority | 数字，可直接编辑 |
| Cost price | 成本价 |
| Sell price | 售价 |
| Status | Active / Degraded / Disabled，含状态切换 |
| Health | 最近一次检查结果图标（绿勾 / 红叉 / 灰问号） |
| Actions | 编辑 / 删除 |

**添加/编辑通道表单：**

| 字段 | 校验规则 |
|------|---------|
| Provider | 必选，下拉选择已注册的服务商 |
| Model | 必选，下拉选择已创建的模型 |
| Real model ID | 必填，服务商的真实模型标识 |
| Priority | 必填，正整数，默认 1 |
| Cost price - input per 1M | 数字（文本模型） |
| Cost price - output per 1M | 数字（文本模型） |
| Cost price - per call | 数字（图片模型） |
| Sell price（同上结构） | 数字，必须 >= cost price |
| Status | 选择：Active / Disabled |

**Priority 快捷编辑：**
- 直接在表格中点击 priority 数字可以内联编辑
- 修改后自动保存，Toast 提示"已更新"

---

### 4.4 健康监控

**数据接口：** `GET /api/admin/health` + `GET /api/admin/health/:channelId` + `POST /api/admin/health/:channelId/check`

**页面元素：**

```
[概览卡片: 健康通道数 / 降级数 / 禁用数]
[通道健康列表]
```

**列表项（卡片式）：**

```
┌─────────────────────────────────────────────┐
│ [状态灯] openai/gpt-4o via OpenAI           │
│ Provider: OpenAI  |  Priority: 1            │
│ Last check: 2分钟前  |  Latency: 320ms      │
│ L1:✓  L2:✓  L3:✓                           │
│ [查看历史]  [手动检查]                        │
└─────────────────────────────────────────────┘
```

- 状态灯：绿色(Active) / 黄色(Degraded) / 红色(Disabled)
- L1/L2/L3 显示最近一次三级验证的结果
- 点击"查看历史" → 展开最近 20 条检查记录
- 点击"手动检查" → 立即触发一次完整三级检查，显示结果

---

### 4.5 全局审计

与开发者审计日志页面结构相同，区别：

- 数据范围：跨所有项目
- 额外筛选：按项目筛选下拉框
- 额外列：Project（项目名）、Channel（通道信息）
- 详情面板额外显示：channelId、costPrice、真实模型ID、利润（sellPrice - costPrice）

---

### 4.6 全局用量

**数据接口：** `GET /api/admin/usage` + `GET /api/admin/usage/by-provider` + `GET /api/admin/usage/by-model` + `GET /api/admin/finance`

**页面元素：**

```
[时间范围选择器]
[指标卡片 x4: 总调用 | 总收入(sellPrice) | 总成本(costPrice) | 毛利]
[收入vs成本趋势图]                              ← 双线折线图
[按服务商分布 环形图]  [按模型分布 环形图]         ← grid 2列
[服务商费用明细表格]
```

**服务商费用明细表格：**

| 列 | 说明 |
|----|------|
| Provider | 服务商名 |
| Calls | 调用次数 |
| Cost | 成本总计 |
| Revenue | 收入总计 |
| Margin | 毛利 |
| Margin % | 毛利率 |

---

### 4.7 开发者管理

**数据接口：** `GET /api/admin/users` + `GET /api/admin/users/:id` + `POST /api/admin/users/:userId/projects/:projectId/recharge`

**表格列：**

| 列 | 说明 |
|----|------|
| Name | 开发者名称 |
| Email | 邮箱 |
| Projects | 项目数 |
| Total balance | 所有项目余额总计 |
| Total calls | 总调用次数 |
| Registered | 注册时间 |
| Actions | 查看详情 |

**详情页面（点击后展开或跳转）：**

```
[开发者信息卡片]
[项目列表]
  ├ 项目名 | 余额 | 调用数 | [手动充值按钮]
  └ ...
```

**手动充值：**
- 点击按钮 → 输入充值金额 + 备注
- 确认后直接增加余额，生成 type=ADJUSTMENT 的交易记录

---

### 4.8 配置覆盖（集成在服务商管理页面中）

不独立成页，作为服务商管理的子面板。点击服务商列表中的"配置覆盖"按钮展开右侧面板或跳转到配置页。

---

## 5. 响应式适配

P1 阶段控制台主要面向桌面端，最小支持宽度 1024px。

| 断点 | 处理 |
|------|------|
| >= 1280px | 标准布局，侧边栏 + 主内容 |
| 1024-1279px | 侧边栏收窄为图标模式（60px），hover 展开 |
| < 1024px | 提示"请使用桌面浏览器访问控制台" |

---

## 6. 页面路由设计

```
/                          → 重定向到 /dashboard
/login                     → 登录页
/register                  → 注册页
/verify-email              → 邮箱验证
/dashboard                 → Dashboard
/keys                      → API keys
/models                    → Models
/logs                      → Audit logs
/logs/:traceId             → 审计日志详情（深链接）
/usage                     → Usage
/balance                   → Balance
/quickstart                → Quick start
/docs                      → API docs
/settings                  → 账号设置
/admin/providers           → 服务商管理
/admin/models              → 模型管理
/admin/channels            → 通道管理
/admin/health              → 健康监控
/admin/logs                → 全局审计
/admin/usage               → 全局用量
/admin/users               → 开发者管理
/admin/users/:id           → 开发者详情
```

非 admin 用户访问 `/admin/*` 路由 → 重定向到 `/dashboard`。
未登录用户访问任何页面 → 重定向到 `/login`。
