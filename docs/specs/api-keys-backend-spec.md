# API Keys 后端扩展规格书 v2

> v2 修订：整合产品审阅反馈 7 项，修正权限判断逻辑、MCP 映射、过期处理、IP 获取、状态机、RPM 策略、实施顺序。

## 概述

扩展 API Keys 后端能力，支持原型中的完整功能：Key 粒度权限控制、过期策略、速率限制、IP 白名单、详情编辑。

## 当前状态

### 数据库 Schema (`prisma/schema.prisma` — ApiKey 模型)

```prisma
model ApiKey {
  id         String       @id @default(cuid())
  projectId  String
  keyHash    String       @unique
  keyPrefix  String
  name       String?
  status     ApiKeyStatus @default(ACTIVE)
  lastUsedAt DateTime?
  createdAt  DateTime     @default(now())
  project    Project      @relation(fields: [projectId], references: [id])
}

enum ApiKeyStatus {
  ACTIVE
  REVOKED
}
```

### 现有 API 路由

| 路由 | 方法 | 功能 |
|------|------|------|
| `/api/projects/:id/keys` | GET | 列出项目下所有 Key |
| `/api/projects/:id/keys` | POST | 创建 Key（仅接受 name） |
| `/api/projects/:id/keys/:keyId` | DELETE | 撤销 Key（ACTIVE → REVOKED） |

---

## 变更 1: Schema 扩展

### 新增字段

```prisma
model ApiKey {
  id          String       @id @default(cuid())
  projectId   String
  keyHash     String       @unique
  keyPrefix   String
  name        String?
  description String?                        // 新增: Key 用途描述
  status      ApiKeyStatus @default(ACTIVE)
  permissions Json         @default("{}")     // 新增: 权限控制
  expiresAt   DateTime?                       // 新增: 过期时间
  rateLimit   Int?                            // 新增: RPM 限制 (null = 使用项目级默认)
  ipWhitelist Json?                           // 新增: IP 白名单数组
  lastUsedAt  DateTime?
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt         // 新增: 编辑时间戳
  project     Project      @relation(fields: [projectId], references: [id])
}
```

### permissions 字段结构

```typescript
interface ApiKeyPermissions {
  chatCompletion?: boolean;   // 对应 /v1/chat/completions + MCP chat Tool
  imageGeneration?: boolean;  // 对应 /v1/images/generations + MCP generate_image Tool
  logAccess?: boolean;        // 对应 MCP list_logs / get_log_detail Tools
  projectInfo?: boolean;      // 对应 /v1/models + MCP list_models / get_balance / get_usage_summary Tools
}
```

### ⚠️ 关键设计决策：`{}` = 全权限（宽松默认）

默认值 `{}` 意味着**所有字段不存在**。鉴权层必须用 **严格等于 false** 判断拒绝：

```typescript
// ✅ 正确：字段不存在或为 true → 放行；仅 === false → 拒绝
if (permissions.chatCompletion === false) { return 403; }

// ❌ 错误：falsy 判断会导致 {} 拒绝所有请求
if (!permissions.chatCompletion) { return 403; }  // 线上所有 Key 立即失效！
```

**`{}` 和 `{ chatCompletion: true, imageGeneration: true, logAccess: true, projectInfo: true }` 行为必须完全一致——都是全权限。**

所有现有 Key 的 permissions 都是 `{}`，如果写反了会导致线上所有 API Key 立即失效。

### ipWhitelist 字段结构

```typescript
// null = 不限制; 空数组 = 拒绝所有; ["1.2.3.4", "10.0.0.0/8"] = 白名单
type IpWhitelist = string[] | null;
```

### Migration

```bash
npx prisma migrate dev --name add-apikey-permissions-and-settings
```

迁移 SQL 要点:
- `description` 默认 NULL
- `permissions` 默认 `'{}'::jsonb`
- `expiresAt` 默认 NULL (永不过期)
- `rateLimit` 默认 NULL
- `ipWhitelist` 默认 NULL
- `updatedAt` 默认 `now()`
- 全部为 nullable 或有默认值，对现有数据零影响

---

## 变更 2: API 路由扩展

### 2.1 POST `/api/projects/:id/keys` — 扩展创建

**当前接受:**
```json
{ "name": "optional string" }
```

**扩展为:**
```json
{
  "name": "optional string",
  "description": "optional string",
  "expiresAt": "optional ISO8601 datetime | null",
  "permissions": {
    "chatCompletion": true,
    "imageGeneration": true,
    "logAccess": false,
    "projectInfo": true
  }
}
```

向后兼容: 所有新字段 optional，不传则用默认值（`permissions` 默认 `{}`）。

**响应不变:**
```json
{
  "id": "...",
  "name": "...",
  "key": "pk_xxxxx (完整 key, 仅此一次)",
  "prefix": "pk_xxx",
  "status": "ACTIVE",
  "createdAt": "..."
}
```

### 2.2 GET `/api/projects/:id/keys` — 扩展列表

**新增查询参数:**
- `?page=1&limit=10` — 分页 (默认 page=1, limit=20)
- `?search=keyword` — 按 name 模糊搜索

**响应扩展:**
```json
{
  "data": [
    {
      "id": "...",
      "keyPrefix": "pk_xxx",
      "maskedKey": "pk_xxx...****",
      "name": "Production-Gateway-01",
      "description": "Primary key for prod",
      "status": "ACTIVE",
      "permissions": { "chatCompletion": true, ... },
      "expiresAt": null,
      "lastUsedAt": "2026-04-01T12:00:00Z",
      "createdAt": "2026-03-01T00:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 8
  }
}
```

向后兼容: 不传分页参数则返回全部（与现有行为一致）。

### 2.3 GET `/api/projects/:id/keys/:keyId` — 新建详情

**响应:**
```json
{
  "data": {
    "id": "...",
    "keyPrefix": "pk_xxx",
    "maskedKey": "pk_xxx...****",
    "name": "Production-Gateway-01",
    "description": "Primary key for prod",
    "status": "ACTIVE",
    "permissions": {
      "chatCompletion": true,
      "imageGeneration": true,
      "logAccess": false,
      "projectInfo": true
    },
    "expiresAt": null,
    "rateLimit": 1000,
    "ipWhitelist": ["142.250.190.46", "172.217.14.206"],
    "lastUsedAt": "2026-04-01T12:00:00Z",
    "createdAt": "2026-03-01T00:00:00Z",
    "updatedAt": "2026-04-01T10:00:00Z"
  }
}
```

**鉴权:** JWT + 项目归属校验

### 2.4 PATCH `/api/projects/:id/keys/:keyId` — 新建编辑

**请求 body (所有字段 optional):**
```json
{
  "name": "new name",
  "description": "new description",
  "permissions": { "chatCompletion": true, ... },
  "expiresAt": "ISO8601 | null",
  "rateLimit": 500,
  "ipWhitelist": ["1.2.3.4"]
}
```

**校验规则:**
- ~~`status` 仅允许 ACTIVE→REVOKED 或 REVOKED→ACTIVE（双向 toggle）~~ **PATCH 不接受 status 字段。** 撤销通过 DELETE 路由，不可逆（见变更 3.5）。
- `rateLimit` 必须 > 0 或 null
- `ipWhitelist` 每项必须是合法 IPv4/IPv6 或 CIDR
- `permissions` 合并更新（不传的字段保持原值）
- `expiresAt` 传 null 表示永不过期，传 ISO8601 必须是未来时间

**响应:** 返回更新后的完整 Key 对象（同 GET 详情格式）

### 2.5 DELETE `/api/projects/:id/keys/:keyId` — 保持不变（单向不可逆）

当前行为: 将 status 设为 REVOKED。**不允许从 REVOKED 恢复为 ACTIVE。**

理由：防止泄露的 Key 被重新启用。吊销是安全操作，必须不可逆。如需恢复访问，应创建新 Key。

---

## 变更 3: 鉴权层权限执行

### 3.1 权限检查 — API 路由层 (`src/lib/api/auth-middleware.ts`)

在现有 API Key 鉴权流程中增加权限检查。**必须用 `=== false` 判断：**

```typescript
// 现有逻辑: sha256(apiKey) → 查 keyHash → 得到 project
// 新增逻辑:
const permissions = (apiKey.permissions ?? {}) as Partial<ApiKeyPermissions>;
const endpoint = detectEndpoint(request); // 'chat' | 'image' | 'log' | 'model'

// ⚠️ 严格等于 false 才拒绝，undefined/true 都放行
if (endpoint === 'chat' && permissions.chatCompletion === false) {
  return { status: 403, error: 'API key lacks chatCompletion permission' };
}
if (endpoint === 'image' && permissions.imageGeneration === false) {
  return { status: 403, error: 'API key lacks imageGeneration permission' };
}
if (endpoint === 'log' && permissions.logAccess === false) {
  return { status: 403, error: 'API key lacks logAccess permission' };
}
if (endpoint === 'model' && permissions.projectInfo === false) {
  return { status: 403, error: 'API key lacks projectInfo permission' };
}
```

endpoint 检测映射：
| 路径模式 | endpoint | 权限字段 |
|----------|----------|---------|
| `/v1/chat/completions` | `chat` | `chatCompletion` |
| `/v1/images/generations` | `image` | `imageGeneration` |
| `/v1/models` | `model` | `projectInfo` |

### 3.2 权限检查 — MCP 层 (`src/lib/mcp/tools/`)

MCP 的 7 个 Tools 也走 API Key 鉴权，**必须同样检查权限：**

| MCP Tool | 权限字段 | 检查点 |
|----------|---------|--------|
| `chat` | `chatCompletion` | `tools/chat.ts` 执行前 |
| `generate_image` | `imageGeneration` | `tools/generate-image.ts` 执行前 |
| `list_logs` | `logAccess` | `tools/list-logs.ts` 执行前 |
| `get_log_detail` | `logAccess` | `tools/get-log-detail.ts` 执行前 |
| `list_models` | `projectInfo` | `tools/list-models.ts` 执行前 |
| `get_balance` | `projectInfo` | `tools/get-balance.ts` 执行前 |
| `get_usage_summary` | `projectInfo` | `tools/get-usage-summary.ts` 执行前 |

实现方式：在 MCP auth 层（`src/lib/mcp/auth.ts`）返回的 context 中携带 permissions，各 Tool 内部做 `=== false` 检查，不满足则返回 `isError: true` 的 MCP 响应（而非协议级错误，让 AI 编辑器可自纠）。

### 3.3 过期检查 — 定时任务自动关闭

**不在运行时检查过期**。改用定时任务方式：

在 `src/instrumentation.ts`（Next.js instrumentation hook，已用于 health check 定时器）中新增定时扫描：

```typescript
// 每小时执行一次
setInterval(async () => {
  const result = await prisma.apiKey.updateMany({
    where: {
      status: 'ACTIVE',
      expiresAt: { lt: new Date() },
    },
    data: { status: 'REVOKED' },
  });
  if (result.count > 0) {
    console.log(`[key-expiry] Auto-revoked ${result.count} expired keys`);
  }
}, 60 * 60 * 1000); // 1 hour
```

优点：
- 前端不需要特殊处理 "ACTIVE 但已过期" 的中间状态
- status 字段是唯一的真实状态来源
- 与过期订单关闭的模式一致

**运行时仍保留过期检查作为兜底（防止定时任务未及时执行）：**

```typescript
if (apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date()) {
  // 兜底：同时更新 status
  await prisma.apiKey.update({ where: { id: apiKey.id }, data: { status: 'REVOKED' } });
  return { status: 401, error: 'API key has expired' };
}
```

### 3.4 IP 白名单 — 通过 X-Forwarded-For 获取真实 IP

部署架构：Nginx → PM2 Node.js。**不能用 `request.socket.remoteAddress`**（返回 `127.0.0.1`）。

```typescript
function getClientIp(request: Request): string {
  // X-Forwarded-For: client, proxy1, proxy2 — 取最左边（第一个）
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();

  // 备选：Nginx 设置的 X-Real-IP
  const xri = request.headers.get('x-real-ip');
  if (xri) return xri.trim();

  // 最后兜底
  return '0.0.0.0';
}
```

**前置条件：** 确认 Nginx 配置包含：
```nginx
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Real-IP $remote_addr;
```

白名单检查：
```typescript
if (apiKey.ipWhitelist && (apiKey.ipWhitelist as string[]).length > 0) {
  const clientIp = getClientIp(request);
  const whitelist = apiKey.ipWhitelist as string[];
  if (!whitelist.some(ip => matchesIpOrCidr(clientIp, ip))) {
    return { status: 403, error: `Request IP ${clientIp} not in whitelist` };
  }
}
```

### 3.5 状态机设计（单向不可逆）

```
ACTIVE ──(DELETE)──→ REVOKED (终态，不可恢复)
ACTIVE ──(定时任务/过期)──→ REVOKED
```

**不支持 REVOKED → ACTIVE。** 理由：
- 防止泄露的 Key 被重新启用
- 大多数平台（AWS、GCP、Stripe）均采用此模式
- 如需恢复访问，创建新 Key

### 3.6 速率限制 — Key 级别只能收紧

```typescript
const projectRpm = project.rpmLimit ?? DEFAULT_RPM;
const keyRpm = apiKey.rateLimit;

// Key 级别只能 ≤ 项目级，不能绕过限制
const effectiveRpm = keyRpm !== null && keyRpm !== undefined
  ? Math.min(keyRpm, projectRpm)
  : projectRpm;
```

**Key 级别 RPM 不能高于项目级 RPM。** 如果用户设置 `apiKey.rateLimit = 10000` 但项目级 RPM 是 60，实际生效的是 60。

---

## 变更 4: 实施顺序

### P0 — Schema + 路由（一次性做完，不拆分）

**不分 P0/P1/P2，一次性实施 Schema、路由、鉴权层。** 理由：如果 P1（Schema + 路由）和 P2（鉴权）之间有时间差，前端显示了 permissions toggle 用户可以设置，但鉴权层不检查——设置了也不生效。前端已标注 Coming Soon，后端应整体交付。

| 项 | 工作量 |
|----|--------|
| Schema: 新增 6 个字段 | 10 min |
| Migration | 5 min |
| POST 扩展: 接受 description/expiresAt/permissions | 15 min |
| GET 列表: 返回新字段 + 分页 | 15 min |
| GET 详情路由 (新建) | 20 min |
| PATCH 编辑路由 + 校验 (新建) | 30 min |
| auth-middleware: permissions 检查 (`=== false`) | 20 min |
| auth-middleware: 过期兜底检查 | 10 min |
| auth-middleware: IP 白名单 + getClientIp | 20 min |
| rate-limit: Key 级别 RPM (Math.min) | 10 min |
| MCP auth: permissions 检查 (7 Tools) | 20 min |
| instrumentation.ts: 过期 Key 定时任务 | 10 min |
| **合计** | **~185 min (~3h)** |

---

## 向后兼容性

- 所有新字段有默认值或 nullable，不影响现有数据
- 现有 API 调用方（SDK、前端）无需任何修改
- 不传新字段时行为与现有完全一致
- **`permissions = {}` 等同于全权限（宽松默认）**——鉴权层用 `=== false` 判断，`undefined` 放行

## 测试要点

| 测试场景 | 预期结果 |
|----------|---------|
| 创建 Key 不传新字段 | 成功，permissions = {}，expiresAt = null |
| 创建 Key 传 description + permissions | 成功，字段正确存储 |
| GET 列表含新字段 | 字段存在且为默认值 |
| PATCH 更新单个字段 | 其他字段不变 |
| PATCH 尝试设 status | 400 错误（不接受 status） |
| DELETE (REVOKED) key | 已 REVOKED 时返回 400 |
| 权限检查: permissions = {} → /v1/chat | **200 放行**（关键！） |
| 权限检查: permissions = { chatCompletion: true } → /v1/chat | 200 放行 |
| 权限检查: permissions = { chatCompletion: false } → /v1/chat | 403 拒绝 |
| MCP chat Tool + chatCompletion: false | MCP isError: true |
| MCP list_models + projectInfo: false | MCP isError: true |
| 过期 Key（定时任务） | 1h 内自动 REVOKED |
| 过期 Key（运行时兜底） | API 调用 401 + 自动更新 status |
| IP 白名单: 白名单内 IP | 200 放行 |
| IP 白名单: 非白名单 IP | 403 + 返回客户端 IP |
| RPM: Key=10000, Project=60 | 实际生效 RPM = 60 (Math.min) |
| RPM: Key=30, Project=60 | 实际生效 RPM = 30 |
| RPM: Key=null, Project=60 | 实际生效 RPM = 60 |
