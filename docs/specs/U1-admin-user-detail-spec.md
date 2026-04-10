# U1 — Admin 用户详情页功能完善 规格文档

> 批次名：U1-admin-user-detail
> 创建日期：2026-04-10
> 状态：planning
> 关联 backlog：BL-078
> 前置条件：K1（API Key 用户级迁移）已完成

---

## 1. 目标

Admin 用户详情页当前存在崩溃 bug 和多处未实现功能。本批次全部真实实现，适配 K1 后的用户级余额模型。

## 2. 现状问题

| # | 问题 | 严重程度 |
|---|------|---------|
| 1 | API 未返回 balance，页面崩溃 | 崩溃 |
| 2 | 余额展示仍按项目拆分，与用户级余额矛盾 | 逻辑错误 |
| 3 | 充值路径仍含 projectId，K1 后已删除 | 接口不存在 |
| 4 | 余额历史表格写死空状态 | 未实现 |
| 5 | lastActive 写死 "—" | 未实现 |
| 6 | Suspend / Delete 按钮 disabled | 未实现 |

## 3. 页面布局（K1 后）

```
┌─ Breadcrumb: 用户 > {用户名} ─────────────────────────┐
│                                                        │
│ ┌─ Profile Card (4col) ─┐  ┌─ Stats (8col) ──────────┐│
│ │ 头像 / 名称 / 邮箱     │  │ ┌余额────┐ ┌调用数──┐  ││
│ │ 角色标签               │  │ │$50.00  │ │1,234  │  ││
│ │ 注册日期 / 最后活跃     │  │ │充值按钮 │ │       │  ││
│ │                       │  │ └────────┘ └───────┘  ││
│ └───────────────────────┘  │ ┌项目数──┐ ┌API Key─┐  ││
│                            │ │  02   │ │  03   │  ││
│                            │ └───────┘ └───────┘  ││
│                            └──────────────────────┘│
│                                                        │
│ ┌─ Projects (7col) ─────┐  ┌─ 余额历史 (5col) ───────┐│
│ │ Project A  调用/Key数  │  │ Date | Type | Amount    ││
│ │ Project B  调用/Key数  │  │ 04/10 RECHARGE +$50    ││
│ └───────────────────────┘  │ 04/09 DEDUCTION -$0.02  ││
│                            │ 04/09 DEDUCTION -$0.01  ││
│                            └─────────────────────────┘│
│                                                        │
│ ┌─ Danger Zone ──────────────────────────────────────┐│
│ │ Suspend Account (暂停)    Delete Profile (删除)     ││
│ └────────────────────────────────────────────────────┘│
└────────────────────────────────────────────────────────┘
```

### 与旧版的区别

| 区域 | 旧版 | 新版 |
|------|------|------|
| 余额统计卡 | 从 project.balance 求和 | 直接显示 User.balance |
| 项目卡片 | 显示项目余额 + 项目级充值按钮 | 只显示调用数/Key 数，无项目余额 |
| 充值按钮 | 在每个项目卡片上 | 在余额统计卡上，充值对象是用户 |
| 余额历史 | 写死空 | 接真实 Transaction 数据 |
| lastActive | 写死 "—" | 取最近 CallLog 时间 |
| Danger Zone | disabled | 可用 |

## 4. API 变更

### 4.1 GET /api/admin/users/:id（详情）

K1 后 User 上已有 balance，直接返回：

```json
{
  "id": "cuid",
  "name": "张三",
  "email": "zhang@example.com",
  "role": "DEVELOPER",
  "balance": 50.00,
  "lastActive": "2026-04-09T14:42:51.183Z",
  "createdAt": "2026-04-01T...",
  "projects": [
    {
      "id": "cuid",
      "name": "My Project",
      "callCount": 47,
      "keyCount": 2
    }
  ]
}
```

变更：
- 新增 `balance`：直接 `Number(user.balance)`
- 新增 `lastActive`：查 `CallLog` 最近一条的 `createdAt`（跨所有项目）
- 项目移除 `balance`（已不存在）

### 4.2 GET /api/admin/users/:id/transactions（新增）

返回用户的交易记录，支持分页：

```
GET /api/admin/users/:id/transactions?page=1&pageSize=10
```

Response：
```json
{
  "data": [
    {
      "id": "cuid",
      "type": "DEDUCTION",
      "amount": -0.02,
      "balanceAfter": 49.98,
      "description": "Chat completion: gpt-4o",
      "createdAt": "2026-04-09T..."
    }
  ],
  "pagination": { "page": 1, "pageSize": 10, "total": 127 }
}
```

### 4.3 POST /api/admin/users/:id/recharge（已在 K1 实现）

K1 已将充值 API 简化为用户级，此处直接复用。

### 4.4 POST /api/admin/users/:id/suspend（新增）

暂停用户账号：
- 将用户所有 API Key 状态设为 `SUSPENDED`
- 用户无法登录（JWT 校验时检查）
- 可逆操作

```json
// Request
{ "suspended": true }  // true=暂停, false=恢复

// Response
{ "success": true, "keysAffected": 3 }
```

实现：
- User 表需新增 `suspended` 字段（Boolean, default false）
- 鉴权中间件检查 `user.suspended`，为 true 返回 403
- JWT 登录检查 `user.suspended`，为 true 返回 403

### 4.5 DELETE /api/admin/users/:id（新增）

删除用户（硬删除或软删除）：

**建议软删除**（设 `deletedAt` 时间戳）：
- 保留审计数据（CallLog、Transaction）
- 吊销所有 API Key
- 用户无法登录
- 不可逆（UI 上二次确认）

```json
// Response
{ "success": true, "message": "User account deleted" }
```

实现：
- User 表新增 `deletedAt` 字段（DateTime?, default null）
- 鉴权中间件检查 `user.deletedAt`，非空返回 403
- 用户列表 API 过滤 `deletedAt IS NULL`

## 5. Schema 变更

```prisma
model User {
  // ... existing fields ...
  suspended  Boolean   @default(false)    // 新增：暂停标记
  deletedAt  DateTime?                     // 新增：软删除时间
}
```

一个 migration：`add_user_suspend_delete`

## 6. 前端变更

### 6.1 Stats 区域

- 余额卡：显示 `user.balance`，右下角"充值"按钮
- 新增 API Key 数统计卡（从 projects 汇总 keyCount）
- lastActive 显示真实时间（相对时间格式）

### 6.2 项目列表

- 移除项目级余额和充值按钮
- 每个项目卡片只显示：项目名、调用数、Key 数

### 6.3 充值弹窗

- 移除项目选择（原来要选给哪个项目充值）
- 直接调用 `POST /api/admin/users/:id/recharge`
- 输入金额 + 原因，确认即可

### 6.4 余额历史

- 调用 `GET /api/admin/users/:id/transactions`
- 表格显示：日期、类型徽章（RECHARGE 绿 / DEDUCTION 灰 / ADJUSTMENT 蓝）、金额（正绿负灰）、描述
- 分页

### 6.5 Danger Zone

两个按钮改为可用：

**Suspend Account：**
- 点击弹出确认弹窗："确定暂停该用户？暂停后用户无法登录和调用 API"
- 已暂停状态下按钮变为"恢复账号"
- 调用 `POST /api/admin/users/:id/suspend`

**Delete Profile：**
- 点击弹出危险确认弹窗（需输入用户邮箱确认）
- 调用 `DELETE /api/admin/users/:id`
- 成功后跳转回用户列表

## 7. 用户列表页适配

`GET /api/admin/users` 的 `totalBalance` 改为直接读 `User.balance`（K1 后 Project.balance 已删除）。

## 8. 设计稿

复用现有设计稿 `design-draft/admin-user-detail/code.html`（R4 已还原）。布局结构不变，调整数据来源。

## 9. 验收标准

### F-U1-01 Schema + API 变更
1. User 新增 suspended / deletedAt 字段
2. GET /api/admin/users/:id 返回 balance + lastActive
3. GET /api/admin/users/:id/transactions 分页返回交易记录
4. POST /api/admin/users/:id/suspend 暂停/恢复用户
5. DELETE /api/admin/users/:id 软删除用户
6. 鉴权中间件检查 suspended + deletedAt
7. migrate dev + tsc 通过

### F-U1-02 用户列表 API 适配
1. totalBalance 直接读 User.balance
2. 已删除用户不出现在列表
3. tsc 通过

### F-U1-03 前端 — 余额 + 充值 + 历史
1. 余额统计卡显示 User.balance
2. 充值弹窗无项目选择，直接充值到用户
3. 余额历史接真实 Transaction 数据，分页正常
4. tsc 通过

### F-U1-04 前端 — lastActive + 项目卡片
1. lastActive 显示真实最后活跃时间
2. 项目卡片不显示余额，只显示调用数/Key 数
3. tsc 通过

### F-U1-05 前端 — Danger Zone
1. Suspend 按钮可用，暂停/恢复切换
2. Delete 按钮可用，需输入邮箱确认
3. 暂停后用户无法登录/调用 API
4. 删除后用户从列表消失
5. tsc 通过

### F-U1-06 i18n
1. en.json + zh-CN.json 同步更新
2. 无硬编码字符串

### F-U1-07 全量验收（executor: codex）
1. Admin 查看用户详情：余额、lastActive、项目、交易记录正确
2. Admin 充值：余额增加，交易记录新增
3. Admin 暂停用户：用户无法登录/调用 API；恢复后正常
4. Admin 删除用户：用户从列表消失，无法登录
5. 签收报告生成
