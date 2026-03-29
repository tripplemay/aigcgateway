# AIGC Gateway — 支付集成方案

> 版本 1.0 · 2026年3月29日
> 配套文档：AIGC-Gateway-P1-PRD · AIGC-Gateway-Database-Design

---

## 1. 支付模式

**预充值模式：** 开发者先充值到项目余额，调用 API 时实时从余额扣费。余额为零时拒绝请求（HTTP 402）。

---

## 2. 支付流程

### 2.1 充值流程

```
开发者                  平台                    支付渠道
  │                      │                       │
  ├─ 选择金额+支付方式 ──→│                       │
  │                      ├─ 创建充值订单 ────────→│
  │                      │  (status=PENDING)      │
  │                      │←─ 返回支付链接/二维码 ──┤
  │←─ 展示支付页面 ───────┤                       │
  │                      │                       │
  ├─ 完成支付 ──────────────────────────────────→│
  │                      │                       │
  │                      │←─ 异步回调通知 ────────┤
  │                      ├─ 验签                  │
  │                      ├─ 更新订单 COMPLETED     │
  │                      ├─ 增加项目余额           │
  │                      ├─ 写入 Transaction       │
  │                      │                       │
  │←─ 通知充值成功 ───────┤                       │
```

### 2.2 核心原则

- **回调驱动：** 余额增加仅在收到支付渠道回调并验签通过后执行，不依赖前端轮询结果
- **幂等处理：** 同一个 paymentOrderId 的回调只处理一次，重复回调直接返回成功
- **先写订单再增余额：** 在同一个数据库事务中更新订单状态 + 增加余额 + 写入 Transaction 记录

---

## 3. 订单状态机

```
PENDING ──→ COMPLETED    （支付成功回调）
   │
   ├─────→ FAILED        （支付失败回调 / 超时关闭）
   │
   └─────→ EXPIRED       （30分钟内未支付，定时任务关闭）
```

| 状态 | 说明 | 余额操作 |
|------|------|---------|
| PENDING | 已创建订单，等待支付 | 不操作 |
| COMPLETED | 支付成功 | 增加余额 |
| FAILED | 支付失败 | 不操作 |
| EXPIRED | 超时未支付 | 不操作 |

**状态流转约束：**
- PENDING → COMPLETED / FAILED / EXPIRED（单向，不可逆）
- COMPLETED / FAILED / EXPIRED 为终态，不可变更

---

## 4. 数据模型补充

在 Database Design 的 Transaction 模型基础上，新增 RechargeOrder 模型：

```prisma
model RechargeOrder {
  id              String        @id @default(cuid())
  projectId       String
  amount          Decimal       @db.Decimal(12, 2)   // 充值金额（USD）
  paymentMethod   String        // alipay / wechat
  paymentOrderId  String?       @unique               // 支付渠道订单号
  paymentUrl      String?       // 支付链接或二维码内容
  paymentRaw      Json?         // 支付渠道回调原始数据
  status          OrderStatus   @default(PENDING)
  transactionId   String?       @unique               // 关联的 Transaction 记录
  expiresAt       DateTime      // 订单过期时间（创建后30分钟）
  paidAt          DateTime?     // 实际支付时间
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  project         Project       @relation(fields: [projectId], references: [id])

  @@index([projectId, createdAt(sort: Desc)])
  @@index([paymentOrderId])
  @@index([status, expiresAt])      // 定时任务查询过期订单
  @@map("recharge_orders")
}

enum OrderStatus {
  PENDING
  COMPLETED
  FAILED
  EXPIRED
}
```

**Transaction 表与 RechargeOrder 的关系：**
- 充值成功时，创建一条 type=RECHARGE 的 Transaction 记录
- RechargeOrder.transactionId 指向该 Transaction
- Transaction 是所有资金变动的统一流水表，RechargeOrder 是充值场景的业务单据

---

## 5. 支付渠道对接

### 5.1 支付宝（Alipay）

**接入方式：** 支付宝开放平台，当面付（扫码支付）或电脑网站支付

**核心接口：**

| 接口 | 用途 |
|------|------|
| `alipay.trade.precreate` | 预创建订单，获取二维码链接（当面付） |
| `alipay.trade.page.pay` | 电脑网站支付，跳转支付宝页面 |
| `alipay.trade.query` | 主动查询订单状态 |
| `alipay.trade.close` | 关闭未支付订单 |

**回调处理：**

```
POST ${API_BASE_URL}/api/webhooks/alipay

1. 验证签名（RSA2 / 支付宝公钥）
2. 检查 trade_status：
   - TRADE_SUCCESS → 处理成功
   - TRADE_CLOSED → 标记失败
   - 其他 → 忽略
3. 检查 out_trade_no 对应的 RechargeOrder 是否为 PENDING
4. 事务内：
   - 更新 RechargeOrder.status = COMPLETED
   - 增加 Project.balance
   - 创建 Transaction (type=RECHARGE)
5. 返回 "success"（支付宝要求）
```

### 5.2 微信支付（WeChat Pay）

**接入方式：** 微信支付 V3 API，Native 支付（扫码）

**核心接口：**

| 接口 | 用途 |
|------|------|
| `POST /v3/pay/transactions/native` | 创建 Native 支付订单，获取二维码链接 |
| `GET /v3/pay/transactions/out-trade-no/{id}` | 查询订单状态 |
| `POST /v3/pay/transactions/out-trade-no/{id}/close` | 关闭订单 |

**回调处理：**

```
POST ${API_BASE_URL}/api/webhooks/wechat

1. 验证签名（WECHATPAY2-SHA256-RSA2048）
2. 解密通知数据（AES-256-GCM）
3. 检查 trade_state：
   - SUCCESS → 处理成功
   - CLOSED / REVOKED / PAYERROR → 标记失败
   - 其他 → 忽略
4. 事务处理（同支付宝）
5. 返回 HTTP 200 + { "code": "SUCCESS" }
```

### 5.3 回调安全

| 安全措施 | 说明 |
|---------|------|
| 签名验证 | 每个回调必须验签，拒绝伪造通知 |
| 幂等控制 | 用 paymentOrderId 做幂等键，同一订单只处理一次 |
| IP 白名单 | 可选，限制回调来源 IP 为支付渠道的服务器 IP |
| HTTPS | 回调地址必须是 HTTPS |
| 超时保护 | 回调处理超过 5 秒主动返回成功，异步完成后续逻辑 |

---

## 6. 充值金额设计

### 6.1 档位

| 档位 | 金额（USD） | 说明 |
|------|-----------|------|
| 体验 | $5 | 新用户试用 |
| 基础 | $20 | — |
| 标准 | $50 | — |
| 进阶 | $100 | — |
| 专业 | $500 | — |
| 自定义 | $1 - $10,000 | 任意金额，精确到 $0.01 |

### 6.2 货币处理

- 平台内部统一使用 USD 计价
- 支付宝/微信支付使用 CNY
- 充值时按实时汇率（或固定汇率）将 CNY 支付金额转换为 USD 余额
- 汇率来源：P1 使用管理员手动配置的固定汇率，P2 考虑接入实时汇率 API
- 汇率配置存储在系统配置表中：`exchange_rate_cny_to_usd = 0.137`

### 6.3 充值前端交互

```
┌──────────────────────────────────────┐
│         充值                    [x]  │
│                                      │
│  选择金额                            │
│  [$5] [$20] [$50] [$100] [$500]     │
│  [自定义: $______ ]                  │
│                                      │
│  实际支付（参考）                     │
│  ¥365.00（汇率 1 USD = 7.30 CNY）    │
│                                      │
│  支付方式                            │
│  (●) 支付宝  ( ) 微信支付            │
│                                      │
│  [确认充值]                          │
└──────────────────────────────────────┘
```

---

## 7. 扣费逻辑

### 7.1 扣费时机

每次 AI 调用完成后（收到服务商响应、提取 usage 数据后），异步执行扣费。

**不在请求前预扣费。** 原因：
- 文本调用的费用取决于实际输出 token 数，请求前无法精确预估
- 预扣会导致余额"虚占"，影响并发请求

**请求前只做余额检查（中间件）：** 余额 > 0 即放行，不锁行。极端情况下可能出现微量"超扣"（余额扣成负数），这是可接受的——金额极小（通常 < $0.01），可在下次充值时抵扣。

### 7.2 扣费计算

```typescript
// 文本模型
const cost = (usage.promptTokens * sellPrice.inputPer1M / 1_000_000)
           + (usage.completionTokens * sellPrice.outputPer1M / 1_000_000)

// 图片模型
const cost = sellPrice.perCall * n  // n = 生成的图片数

// 失败调用
// status = ERROR 或 TIMEOUT → 不扣费（costPrice 和 sellPrice 记为 0）
// status = FILTERED → 扣输入 token 费用（服务商已收费）
```

### 7.3 扣费事务

```sql
-- 使用 deduct_balance 函数（见 Database Design 文档）
SELECT * FROM deduct_balance(
  p_project_id := 'proj_xxx',
  p_amount := 0.0048,
  p_call_log_id := 'log_xxx',
  p_description := 'openai/gpt-4o: 156 in + 2048 out tokens'
);
```

---

## 8. 对账策略

### 8.1 每日对账

每天凌晨执行自动对账任务：

```
1. 汇总当日所有 COMPLETED 的 RechargeOrder → 总充值金额
2. 汇总当日所有 DEDUCTION 的 Transaction → 总扣费金额
3. 计算当日余额变动 = 充值 - 扣费
4. 检查所有项目的 balance 是否等于 初始余额 + 充值 - 扣费
5. 差异超过阈值（$0.01）→ 告警
```

### 8.2 与支付渠道对账

- 每日下载支付宝/微信的对账文件
- 比对平台的 RechargeOrder 记录与渠道的交易记录
- 标记差异项（有支付记录但平台未入账 / 平台已入账但渠道无记录）
- 差异项人工核查处理

### 8.3 与服务商对账

- 定期（每周/每月）比对平台的 costPrice 汇总与各服务商的账单
- 差异可能来源：汇率波动、缓存折扣、服务商定价调整
- P1 以平台记录的 costPrice 为准，P2 考虑自动化对账

---

## 9. 退款规则

### 9.1 P1 退款策略

P1 阶段不提供自助退款功能。退款场景：

| 场景 | 处理方式 |
|------|---------|
| 平台故障导致误扣费 | 运营手动通过"余额调整"补回（type=ADJUSTMENT） |
| 开发者申请退余额 | 运营审核后通过支付渠道原路退款 + 扣减余额 |

### 9.2 退款数据记录

```prisma
// 退款使用 Transaction，type = REFUND
{
  type: "REFUND",
  amount: 50.00,        // 正数
  balanceAfter: 0,
  description: "用户申请退款 - 工单 #1234"
}
```

---

## 10. 发票需求

P1 阶段：
- 不提供自动开票功能
- 开发者如需发票，通过客服人工处理
- 平台记录所有 Transaction 作为开票依据

P2 考虑：
- 接入电子发票服务
- 控制台自助申请发票
- 按月自动生成账单

---

## 11. 安全措施

| 措施 | 说明 |
|------|------|
| 支付回调验签 | 必须验证支付渠道的签名，防止伪造 |
| 余额操作用数据库函数 | deduct_balance 使用 FOR UPDATE 行锁，防止并发超扣 |
| 交易记录不可修改 | Transaction 表只增不改不删 |
| 敏感信息脱敏 | 支付回调原始数据中的敏感字段（如银行卡号）脱敏后存储 |
| 金额精度 | 使用 Decimal 类型，避免浮点数精度丢失 |
| 充值上限 | 单笔最高 $10,000，防止异常大额交易 |
