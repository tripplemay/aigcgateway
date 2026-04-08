# R2B — 用户侧页面还原：Balance + Usage + Settings

## 批次目标

将 `/balance`、`/usage`、`/settings` 三个页面从旧代码模式还原为 R1 设计系统，同时对齐 Stitch 设计稿的视觉和交互。

## 设计稿映射

| 页面路由 | 设计稿路径 | DESIGN.md |
|---|---|---|
| `/balance` | `design-draft/balance/` | 有 |
| Recharge Modal | `design-draft/balance-recharge-modal/` | 有 |
| `/usage` | `design-draft/usage/` | 有 |
| `/settings` | `design-draft/settings/` | 有 |

**开发前必读：** `design-draft/DESIGN-GLOBAL.md`（全局忽略项）+ 每个页面的 `DESIGN.md`（页面级忽略/部分支持标注）。

## 还原原则

与 R2A 一致：

1. **DS 组件替换**：useAsyncData、Table、Card、Dialog、Button、Input、Pagination 等
2. **视觉对齐设计稿**：使用 DS token，不硬编码颜色值
3. **功能范围 = DESIGN.md 中标注为 "Fully supported" 的功能**
4. **组件拆分**：大块独立 UI 抽为子组件
5. **i18n**：所有用户可见文本走 next-intl，中英双语。**R2A 经验教训：i18n 硬编码是主要修复源（卡了 3 轮），必须在 building 阶段彻底自检**

## 页面级需求

### /balance — 余额与交易

**数据源：**
- `GET /api/projects/:id/balance`（余额、最近充值、告警阈值）
- `GET /api/projects/:id/transactions`（交易历史，支持 type 筛选 + 分页）

**功能：**
- 余额卡片：当前余额、最近充值金额+日期
- 告警阈值显示（可读，PATCH /projects/:id 可写）
- 交易历史表格：时间、类型（RECHARGE/DEDUCTION/REFUND/ADJUSTMENT）、描述、金额、余额变化
- 交易类型筛选
- 分页（Pagination 组件）
- "Recharge" 按钮 → 弹出 RechargeDialog

**不做（见 DESIGN.md）：** "Estimated Expiry"、通知发送机制、导出

### Recharge Modal — 充值弹窗

**数据源：** `POST /api/projects/:id/recharge`

**功能：**
- 使用 Dialog 组件
- 预设金额快选（$10/$50/$100/$200/$500）
- 自定义金额输入
- 支付方式选择（Alipay / WeChat Pay）
- "Confirm & Pay" 提交 → 创建订单 → 返回 paymentUrl

### /usage — 使用分析

**数据源：**
- `GET /api/projects/:id/usage`（汇总：totalCalls, totalCost, totalTokens, avgLatencyMs, successRate, errorCount）
- `GET /api/projects/:id/usage/daily`（每日趋势）
- `GET /api/projects/:id/usage/by-model`（模型分布）

**功能：**
- KPI 卡片：总调用、总费用、总 Tokens、平均延迟（使用 Card 组件）
- 周期选择器（today / 7d / 30d）
- 每日趋势图（recharts BarChart，已有依赖）
- 模型分布饼图（recharts PieChart）
- 模型排名表格（Table 组件：模型名、调用数、Tokens、费用、平均延迟）

**不做（见 DESIGN.md）：** "% vs last week" 环比、导出

### /settings — 个人设置

**数据源：**
- `GET/PATCH /api/auth/profile`（姓名）
- `POST /api/auth/change-password`（旧密码+新密码）
- `GET /api/auth/login-history`（最近 20 条）

**功能：**
- 个人信息区：邮箱（只读）、显示名称（可编辑）、保存按钮
- 密码修改区：旧密码、新密码、确认新密码、提交按钮
- 登录历史表格：IP、User Agent、时间
- 退出登录按钮（客户端清除 JWT）

**不做（见 DESIGN.md）：** System Status 面板、通知偏好开关

## 技术约束

- 页面文件位于 `src/app/[locale]/(console)/` 下（注意：当前旧文件在 `src/app/(console)/`，可能需要确认实际路径）
- recharts 已在项目中（^3.8.1），直接使用
- 所有 API 调用使用 apiFetch
- 状态管理使用 useAsyncData hook
- 新组件放入 src/components/ 对应子目录（balance/、usage/、settings/）
- 不修改任何 API route / Prisma schema / 后端逻辑
- **i18n 自检清单**：building 完成前，Generator 必须对每个页面执行以下检查：
  1. 搜索所有 JSX 中的裸字符串（非 t() / useTranslations 调用的英文文本）
  2. 切换到 zh-CN 检查是否有未翻译文案
  3. 特别注意：placeholder、breadcrumb、状态标签、时间格式化文本、分页文案
