# AIGC Gateway — 数据库设计文档

> 版本 1.0 · 2026年3月29日
> 配套文档：AIGC-Gateway-P1-PRD

---

## 1. 实体关系总览

```
User (1) ──→ (N) Project (1) ──→ (N) ApiKey
  │                 │
  │ balance         ├──→ (N) CallLog ──→ Channel
  │                 │
  │                 ├──→ (N) Transaction (充值/扣费记录)
  │                 │
  │                 └──→ (N) BalanceAlert
  │
  └──→ (N) RechargeOrder

Provider (1) ──→ (N) Channel (N) ←── (1) Model
                                          │
ModelAlias (1) ──→ (N) AliasModelLink ←── (1) Model

Channel (1) ──→ (N) HealthCheck
Channel (1) ──→ (N) CallLog

ProviderConfig ──→ Provider (配置覆盖层)
SystemLog (独立，记录运维操作)
```

**核心关系说明：**

- User → Project：一个开发者账号可创建多个项目
- User.balance：用户级余额（所有项目共享），非项目级
- ApiKey：用户级管理，关联 Project
- Provider ↔ Model：通过 Channel 关联（M:N），同一模型可有多个通道
- **ModelAlias ↔ Model：通过 AliasModelLink 关联（M:N）**。用户通过别名（如 `gpt-4o`）访问模型，别名可关联多个 Provider 的模型（路由降级）。别名持有 sellPrice（面向用户的定价）和 capabilities。
- CallLog 关联 Project + Channel：审计日志按项目隔离，同时记录走了哪条通道
- SystemLog：记录运维操作（Sync / LLM 推断 / 健康检查状态变更 / 自动恢复）

---

## 2. 枚举定义

```prisma
enum UserRole {
  ADMIN       // 平台运营
  DEVELOPER   // 开发者
}

enum ProviderStatus {
  ACTIVE
  DISABLED
}

enum ModelModality {
  TEXT
  IMAGE
  VIDEO
  AUDIO
}

enum ChannelStatus {
  ACTIVE      // 正常
  DEGRADED    // 降级（健康检查偶发失败）
  DISABLED    // 禁用（连续失败或手动禁用）
}

enum ApiKeyStatus {
  ACTIVE
  REVOKED
}

enum CallStatus {
  SUCCESS
  ERROR
  TIMEOUT
  FILTERED    // 内容审核拦截
}

enum FinishReason {
  STOP
  LENGTH
  CONTENT_FILTER
  ERROR
  TIMEOUT
}

enum TransactionType {
  RECHARGE    // 充值
  DEDUCTION   // 调用扣费
  REFUND      // 退款
  ADJUSTMENT  // 手动调整
}

enum TransactionStatus {
  PENDING     // 支付中
  COMPLETED   // 完成
  FAILED      // 失败
}

enum HealthCheckLevel {
  CONNECTIVITY    // Level 1: 连通性
  FORMAT          // Level 2: 格式一致性
  QUALITY         // Level 3: 响应质量
}

enum HealthCheckResult {
  PASS
  FAIL
}

enum Currency {
  USD
  CNY
}
```

---

## 3. Prisma Schema

```prisma
// ============================================================
// 用户与项目
// ============================================================

model User {
  id            String    @id @default(cuid())
  email         String    @unique
  passwordHash  String
  name          String?
  role          UserRole  @default(DEVELOPER)
  emailVerified Boolean   @default(false)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  projects      Project[]

  @@index([email])
  @@map("users")
}

model Project {
  id            String    @id @default(cuid())
  userId        String
  name          String
  description   String?
  balance       Decimal   @default(0) @db.Decimal(12, 6)  // 余额（USD）
  alertThreshold Decimal? @db.Decimal(12, 6)               // 低余额告警阈值
  rateLimit     Json?     // { rpm: 100, tpm: 100000 }
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  user          User      @relation(fields: [userId], references: [id])
  apiKeys       ApiKey[]
  callLogs      CallLog[]
  transactions  Transaction[]

  @@index([userId])
  @@map("projects")
}

model ApiKey {
  id            String       @id @default(cuid())
  projectId     String
  keyHash       String       @unique    // 存储 hash，不存原文
  keyPrefix     String                  // 前8位，用于展示 "pk_a1b2...***"
  name          String?                 // 用途标注，如 "production" / "staging"
  status        ApiKeyStatus @default(ACTIVE)
  lastUsedAt    DateTime?
  createdAt     DateTime     @default(now())

  project       Project      @relation(fields: [projectId], references: [id])

  @@index([keyHash])
  @@index([projectId])
  @@map("api_keys")
}

// ============================================================
// 服务商、模型、通道
// ============================================================

model Provider {
  id            String         @id @default(cuid())
  name          String         @unique   // 如 "openai", "deepseek", "zhipu"
  displayName   String                    // 如 "OpenAI", "DeepSeek", "智谱 AI"
  baseUrl       String                    // 如 "https://api.openai.com/v1"
  authType      String         @default("bearer") // bearer / api-key / custom
  authConfig    Json                      // 加密存储: { apiKey: "sk-..." }
  rateLimit     Json?                     // { rpm: 500, tpm: 100000 }
  proxyUrl      String?                   // 国内访问海外服务商的代理
  status        ProviderStatus @default(ACTIVE)
  adapterType   String         @default("openai-compat") // openai-compat / volcengine / siliconflow / minimax / iflytek
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt

  channels      Channel[]
  config        ProviderConfig?

  @@map("providers")
}

model ProviderConfig {
  id              String   @id @default(cuid())
  providerId      String   @unique
  temperatureMin  Float?   @default(0)
  temperatureMax  Float?   @default(2)
  chatEndpoint    String?  @default("/chat/completions")
  imageEndpoint   String?  @default("/images/generations")
  imageViaChat    Boolean  @default(false)  // 如火山引擎，图片优先走 chat 接口
  supportsModelsApi Boolean @default(false)  // 是否支持 /models 端点
  supportsSystemRole Boolean @default(true) // 如讯飞 Lite/Pro 不支持
  currency        Currency @default(USD)     // 价格单位
  quirks          Json?    // 其他特殊行为: ["no_models_api", "image_response_format_diff"]
  updatedAt       DateTime @updatedAt

  provider        Provider @relation(fields: [providerId], references: [id])

  @@map("provider_configs")
}

model Model {
  id            String        @id @default(cuid())
  name          String        @unique  // 统一命名: "openai/gpt-4o", "deepseek/v3"
  displayName   String                 // 展示名: "GPT-4o", "DeepSeek V3"
  modality      ModelModality          // TEXT / IMAGE / VIDEO / AUDIO
  maxTokens     Int?                   // 最大输出 token
  contextWindow Int?                   // 上下文窗口大小
  capabilities  Json?                  // { vision: true, tools: true, streaming: true }
  description   String?
  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt

  channels      Channel[]

  @@index([modality])
  @@map("models")
}

model Channel {
  id            String        @id @default(cuid())
  providerId    String
  modelId       String
  realModelId   String        // 服务商的真实模型ID: "deepseek-chat", "glm-4.7"
  priority      Int           @default(1)   // 数字越小优先级越高
  costPrice     Json          // 成本价: { inputPer1M: 0.28, outputPer1M: 0.42 } 或 { perCall: 0.01 }
  sellPrice     Json          // 售价: 同结构
  status        ChannelStatus @default(ACTIVE)
  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt

  provider      Provider      @relation(fields: [providerId], references: [id])
  model         Model         @relation(fields: [modelId], references: [id])
  callLogs      CallLog[]
  healthChecks  HealthCheck[]

  @@unique([providerId, modelId, realModelId])  // 同一服务商+模型+真实ID不重复
  @@index([modelId, status, priority])          // 路由查询: 按模型找活跃通道
  @@index([providerId])
  @@map("channels")
}

// ============================================================
// 调用日志（审计核心）
// ============================================================

model CallLog {
  id                String       @id @default(cuid())
  traceId           String       @unique @default(cuid())  // 返回给开发者的追踪ID
  projectId         String
  channelId         String
  modelName         String       // 开发者传入的模型名: "openai/gpt-4o"

  // --- Prompt 快照 ---
  promptSnapshot    Json         // 完整 messages 数组（结构化存储）
  requestParams     Json?        // { temperature: 0.7, max_tokens: 4096, ... }

  // --- 输出 ---
  responseContent   String?      @db.Text  // 模型完整输出
  finishReason      FinishReason?
  status            CallStatus

  // --- Token 用量 ---
  promptTokens      Int?
  completionTokens  Int?
  totalTokens       Int?

  // --- 成本 ---
  costPrice         Decimal?     @db.Decimal(12, 8)  // 平台成本（USD）
  sellPrice         Decimal?     @db.Decimal(12, 8)  // 向开发者收取（USD）
  currency          Currency     @default(USD)

  // --- 性能 ---
  latencyMs         Int?         // 总请求耗时（毫秒）
  ttftMs            Int?         // 首 token 延迟（毫秒）
  tokensPerSecond   Float?       // 输出速度

  // --- 错误 ---
  errorMessage      String?      @db.Text
  errorCode         String?      // 服务商返回的原始错误码

  // --- P2 预留字段 ---
  templateId        String?      // P2: 使用的模板ID
  templateVariables Json?        // P2: 变量替换映射
  qualityScore      Float?       // P2: 质量评分

  // --- 时间 ---
  createdAt         DateTime     @default(now())

  // --- 全文搜索 ---
  // 注意: tsvector 列通过原生 SQL 迁移创建，见下方

  project           Project      @relation(fields: [projectId], references: [id])
  channel           Channel      @relation(fields: [channelId], references: [id])

  @@index([traceId])
  @@index([projectId, createdAt(sort: Desc)])            // 按项目+时间查询
  @@index([projectId, modelName, createdAt(sort: Desc)]) // 按项目+模型查询
  @@index([projectId, status])                           // 按项目+状态筛选
  @@index([channelId, createdAt(sort: Desc)])             // 运营按通道查询
  @@index([createdAt(sort: Desc)])                        // 全局时间排序
  @@map("call_logs")
}

// ============================================================
// 计费
// ============================================================

model Transaction {
  id            String            @id @default(cuid())
  projectId     String
  type          TransactionType
  amount        Decimal           @db.Decimal(12, 6)  // 正数=充值，负数=扣费
  balanceAfter  Decimal           @db.Decimal(12, 6)  // 交易后余额
  status        TransactionStatus @default(COMPLETED)

  // --- 充值相关 ---
  paymentMethod String?           // alipay / wechat
  paymentOrderId String?          // 第三方支付订单号
  paymentRaw    Json?             // 支付回调原始数据

  // --- 扣费相关 ---
  callLogId     String?           // 关联的调用日志（扣费时）

  // --- 备注 ---
  description   String?
  createdAt     DateTime          @default(now())

  project       Project           @relation(fields: [projectId], references: [id])

  @@index([projectId, createdAt(sort: Desc)])
  @@index([projectId, type])
  @@index([paymentOrderId])
  @@map("transactions")
}

// ============================================================
// 健康检查
// ============================================================

model HealthCheck {
  id            String             @id @default(cuid())
  channelId     String
  level         HealthCheckLevel   // CONNECTIVITY / FORMAT / QUALITY
  result        HealthCheckResult  // PASS / FAIL
  latencyMs     Int?               // 检查请求耗时
  errorMessage  String?            @db.Text
  responseBody  String?            @db.Text  // 检查响应（用于排查）
  createdAt     DateTime           @default(now())

  channel       Channel            @relation(fields: [channelId], references: [id])

  @@index([channelId, createdAt(sort: Desc)])
  @@index([channelId, result])
  @@map("health_checks")
}
```

---

## 4. 原生 SQL 补充

Prisma Schema 无法直接定义的部分，通过原生 SQL 迁移补充。

### 4.1 全文搜索索引

```sql
-- 添加 tsvector 列（自动生成，基于 prompt 和 response）
ALTER TABLE call_logs ADD COLUMN search_vector tsvector;

-- 创建 GIN 索引
CREATE INDEX idx_call_logs_search ON call_logs USING GIN(search_vector);

-- 创建触发器自动更新 tsvector
-- 注意：需要安装中文分词插件（zhparser 或 pg_jieba）
CREATE OR REPLACE FUNCTION call_logs_search_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('simple', COALESCE(NEW."modelName", '')), 'A') ||
    setweight(to_tsvector('simple', COALESCE(NEW."responseContent", '')), 'B') ||
    setweight(to_tsvector('simple', COALESCE(
      (SELECT string_agg(msg->>'content', ' ')
       FROM jsonb_array_elements(NEW."promptSnapshot"::jsonb) AS msg), '')), 'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER call_logs_search_trigger
  BEFORE INSERT OR UPDATE OF "promptSnapshot", "responseContent", "modelName"
  ON call_logs
  FOR EACH ROW
  EXECUTE FUNCTION call_logs_search_update();
```

### 4.2 余额扣费函数（并发安全）

```sql
-- 原子扣费函数，使用 SELECT ... FOR UPDATE 防止并发超扣
CREATE OR REPLACE FUNCTION deduct_balance(
  p_project_id TEXT,
  p_amount DECIMAL(12,6),
  p_call_log_id TEXT,
  p_description TEXT DEFAULT NULL
) RETURNS TABLE(success BOOLEAN, new_balance DECIMAL, transaction_id TEXT) AS $$
DECLARE
  v_balance DECIMAL(12,6);
  v_new_balance DECIMAL(12,6);
  v_txn_id TEXT;
BEGIN
  -- 锁定项目行，防止并发
  SELECT balance INTO v_balance
  FROM projects
  WHERE id = p_project_id
  FOR UPDATE;

  IF v_balance IS NULL THEN
    RETURN QUERY SELECT FALSE, 0::DECIMAL, NULL::TEXT;
    RETURN;
  END IF;

  -- 检查余额是否充足
  IF v_balance < p_amount THEN
    RETURN QUERY SELECT FALSE, v_balance, NULL::TEXT;
    RETURN;
  END IF;

  -- 扣减余额
  v_new_balance := v_balance - p_amount;
  UPDATE projects SET balance = v_new_balance, "updatedAt" = NOW()
  WHERE id = p_project_id;

  -- 写入交易记录
  v_txn_id := gen_random_uuid()::TEXT;
  INSERT INTO transactions (id, "projectId", type, amount, "balanceAfter", status, "callLogId", description, "createdAt")
  VALUES (v_txn_id, p_project_id, 'DEDUCTION', -p_amount, v_new_balance, 'COMPLETED', p_call_log_id, p_description, NOW());

  RETURN QUERY SELECT TRUE, v_new_balance, v_txn_id;
END;
$$ LANGUAGE plpgsql;
```

### 4.3 余额检查函数（API 网关中间件用）

```sql
-- 快速检查余额是否大于零（不锁行，用于中间件预检）
CREATE OR REPLACE FUNCTION check_balance(p_project_id TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM projects WHERE id = p_project_id AND balance > 0
  );
END;
$$ LANGUAGE plpgsql;
```

---

## 5. 索引策略说明

| 表 | 索引 | 用途 |
|---|------|------|
| `users` | `email` (unique) | 登录查询 |
| `api_keys` | `keyHash` (unique) | 鉴权：每次 API 请求通过 Key hash 找到项目 |
| `api_keys` | `projectId` | 展示项目下的 Key 列表 |
| `channels` | `modelId + status + priority` | **路由核心索引**：按模型找活跃通道并排序 |
| `channels` | `providerId` | 按服务商查通道 |
| `call_logs` | `traceId` (unique) | 开发者通过 traceId 查单条 |
| `call_logs` | `projectId + createdAt DESC` | 开发者查自己的调用历史 |
| `call_logs` | `projectId + modelName + createdAt DESC` | 按模型筛选 |
| `call_logs` | `projectId + status` | 按状态筛选（如只看 error） |
| `call_logs` | `channelId + createdAt DESC` | 运营按通道查调用 |
| `call_logs` | `search_vector` (GIN) | 全文搜索 |
| `transactions` | `projectId + createdAt DESC` | 账单查询 |
| `transactions` | `paymentOrderId` | 支付回调对账 |
| `health_checks` | `channelId + createdAt DESC` | 查通道的检查历史 |
| `health_checks` | `channelId + result` | 统计通过/失败率 |

---

## 6. 关键设计决策说明

### 6.1 API Key 存储安全

API Key 只在创建时展示一次原文给开发者，数据库只存 hash 值：

```
创建时：
  rawKey = "pk_" + crypto.randomBytes(32).toString('hex')  // pk_a1b2c3...
  keyHash = sha256(rawKey)
  keyPrefix = rawKey.slice(0, 8)  // "pk_a1b2c"
  → 返回 rawKey 给开发者（仅此一次）
  → 存储 keyHash + keyPrefix 到 DB

鉴权时：
  收到 Header: Authorization: Bearer pk_a1b2c3...
  → sha256(收到的key) → 查 api_keys.keyHash → 找到 projectId
```

### 6.2 余额精度

- 使用 `Decimal(12, 6)` 存储，支持到微美元精度
- 单次调用成本可能低至 $0.000001（如免费模型的极少量 token）
- costPrice 和 sellPrice 用 `Decimal(12, 8)` 存储，精度更高

### 6.3 costPrice / sellPrice 结构

按模态区分两种定价结构：

```typescript
// 文本模型 — 按 token 计价
{
  inputPer1M: 2.50,     // USD/百万输入token
  outputPer1M: 10.00,   // USD/百万输出token
  unit: "token"
}

// 图片模型 — 按张计价
{
  perCall: 0.04,        // USD/次
  unit: "call"
}
```

### 6.4 promptSnapshot 结构

结构化存储完整 messages 数组，不是扁平字符串：

```json
[
  { "role": "system", "content": "You are an expert..." },
  { "role": "user", "content": "Design a curriculum..." }
]
```

P2 模板治理需要解析 system message 内容与模板做 diff 对比，扁平字符串无法支持。

### 6.5 健康检查记录保留

HealthCheck 表会快速增长（每10分钟 × 活跃通道数），建议：
- P1：保留最近 7 天，定时任务清理
- P2：根据需要调整保留周期

### 6.6 软删除

P1 所有实体不做软删除（简化逻辑）。Provider / Channel / Model 通过 status 字段控制启用/禁用。Project 和 User 不允许删除（有关联的交易和日志记录）。

---

## 7. 数据量估算与容量规划

假设平台运营 6 个月后：

| 表 | 估算行数 | 单行大小 | 总大小估算 |
|---|---------|---------|----------|
| `users` | 1,000 | 0.5 KB | 0.5 MB |
| `projects` | 2,000 | 0.5 KB | 1 MB |
| `api_keys` | 5,000 | 0.3 KB | 1.5 MB |
| `providers` | 20 | 1 KB | 0.02 MB |
| `models` | 100 | 0.5 KB | 0.05 MB |
| `channels` | 200 | 0.5 KB | 0.1 MB |
| `call_logs` | **10,000,000** | **3 KB** | **30 GB** |
| `transactions` | 10,050,000 | 0.5 KB | 5 GB |
| `health_checks` | 500,000 | 0.5 KB | 250 MB |

`call_logs` 是核心增长点（prompt + response 大字段），永久保留下需要关注：
- P1：监控表大小增长速度
- P2：实施表分区（按月）或冷热分离

---

## 附录：M1 别名架构新增表（2026-04 追加）

### ModelAlias（模型别名）

用户通过别名访问模型，别名是面向用户的唯一标识。

```prisma
model ModelAlias {
  id               String        @id @default(cuid())
  alias            String        @unique    // 如 "gpt-4o", "deepseek-v3"
  brand            String?                  // 品牌名，如 "OpenAI", "DeepSeek"
  modality         ModelModality @default(TEXT)
  enabled          Boolean       @default(false)
  contextWindow    Int?
  maxTokens        Int?
  capabilities     Json?         // { streaming, json_mode, function_calling, vision, reasoning, search, system_prompt }
  description      String?
  sellPrice        Json?         // { unit: "token"|"call", inputPer1M, outputPer1M, perCall } (USD)
  openRouterModelId String?      // OpenRouter 参考定价映射
  models           AliasModelLink[]
}
```

### AliasModelLink（别名-模型映射）

M:N 关联，一个别名可关联多个 Provider 的模型（路由降级），一个模型可属于多个别名。

```prisma
model AliasModelLink {
  id      String     @id @default(cuid())
  aliasId String
  modelId String
  alias   ModelAlias @relation(...)
  model   Model      @relation(...)
  @@unique([aliasId, modelId])
}
```

### SystemLog（系统日志，2026-04 ADMIN-OPS+ 追加）

记录运维操作日志。

```prisma
model SystemLog {
  id        String   @id @default(cuid())
  type      String   // "SYNC" | "INFERENCE" | "HEALTH_STATUS_CHANGE" | "AUTO_RECOVERY"
  level     String   // "INFO" | "WARNING" | "ERROR"
  message   String
  metadata  Json?
  createdAt DateTime @default(now())
}
```

### HealthCheckLevel 枚举更新

```prisma
enum HealthCheckLevel {
  API_REACHABILITY  // 仅 /models 端点探测（零成本）
  CONNECTIVITY      // 发真实 chat 请求验证（有成本）
  FORMAT            // 响应格式一致性
  QUALITY           // 响应内容质量
}
```
