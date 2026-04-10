# K1 — API Key 用户级迁移 + 余额模型收敛 规格文档

> 批次名：K1-apikey-user-level
> 创建日期：2026-04-10
> 状态：planning
> 关联 backlog：BL-081 + BL-069

---

## 1. 目标

将 API Key 从项目级迁移到用户级，统一数据模型：Key = 用户身份，Project = 资源分组，Balance = 用户钱包。消除当前 Key(项目级) + 余额(用户级) 的逻辑矛盾。

## 2. 现状分析

### 2.1 已经是用户级的（无需改动）

| 组件 | 状态 |
|------|------|
| User.balance | ✅ 已迁移 |
| deduct_balance() SQL 函数 | ✅ 扣 User.balance |
| check_balance() SQL 函数 | ✅ 检查 User.balance |
| Transaction.userId | ✅ 已填充 |
| Admin 充值 | ✅ 充到 User.balance |

### 2.2 仍然是项目级的（需要迁移）

| 组件 | 当前状态 | 目标状态 |
|------|---------|---------|
| ApiKey.projectId | 必填，绑定项目 | 改为 userId，绑定用户 |
| 鉴权中间件 | 从 Key 解析 projectId | 从 Key 解析 userId + 从 header/默认值取 projectId |
| MCP auth | 返回 project | 返回 userId + projectId（可选） |
| Keys 管理页 | /keys，按项目列出 | 移到用户维度 |
| RechargeOrder.projectId | 必填 | 改为可选（充值是用户级操作） |
| Project.balance | 仍存在 | 废弃字段（保留但不再使用） |

## 3. Schema 变更

### 3.1 ApiKey 表

```prisma
model ApiKey {
  id          String       @id @default(cuid())
  userId      String                    // 新增：绑定用户
  keyHash     String       @unique
  keyPrefix   String
  name        String?
  description String?
  status      ApiKeyStatus @default(ACTIVE)
  permissions Json         @default("{}")
  expiresAt   DateTime?
  rateLimit   Int?
  ipWhitelist Json?
  lastUsedAt  DateTime?
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt

  user    User    @relation(fields: [userId], references: [id])

  @@index([keyHash])
  @@index([userId])
  @@map("api_keys")
}
```

变更：
- `projectId` → `userId`
- `project` 关联 → `user` 关联
- 索引从 `projectId` 改为 `userId`

### 3.2 User 表新增

```prisma
model User {
  // ... existing fields ...
  defaultProjectId String?              // 新增：默认项目
  apiKeys          ApiKey[]             // 新增：反向关联
}
```

### 3.3 删除的字段

| 表 | 字段 | 说明 |
|----|------|------|
| Project | balance | 直接删除，余额完全在 User 上 |
| RechargeOrder | projectId | 直接删除，充值是用户级操作 |

### 3.4 Migration 计划

一个 migration：`apikey_to_user_level`

不兼容旧数据，清空重建：

```sql
-- 1. 清空旧 API Key 数据（用户需重新创建）
TRUNCATE TABLE "api_keys";

-- 2. 重建 ApiKey 表结构
ALTER TABLE "api_keys" DROP COLUMN "projectId";
ALTER TABLE "api_keys" ADD COLUMN "userId" TEXT NOT NULL;
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_userId_fkey" 
  FOREIGN KEY ("userId") REFERENCES "users"("id");
CREATE INDEX "api_keys_userId_idx" ON "api_keys" ("userId");

-- 3. User 加 defaultProjectId
ALTER TABLE "users" ADD COLUMN "defaultProjectId" TEXT;
UPDATE "users" SET "defaultProjectId" = (
  SELECT "id" FROM "projects" WHERE "projects"."userId" = "users"."id" LIMIT 1
);

-- 4. 删除 Project.balance
ALTER TABLE "projects" DROP COLUMN "balance";

-- 5. 删除 RechargeOrder.projectId
ALTER TABLE "recharge_orders" DROP COLUMN "projectId";

-- 6. deduct_balance 函数改为直接接收 userId
CREATE OR REPLACE FUNCTION deduct_balance(
  p_user_id TEXT,
  p_project_id TEXT,
  p_amount DECIMAL(16,8),
  p_call_log_id TEXT,
  p_description TEXT,
  p_trace_id TEXT
) ...
-- 直接用 p_user_id 扣费，不再从 projectId 间接查找
-- p_project_id 仅写入 Transaction 用于审计
```

## 4. 鉴权中间件变更

### 4.1 authenticateApiKey()

**当前：**
```typescript
// Key → Project（含 User）
const apiKey = await prisma.apiKey.findUnique({
  where: { keyHash },
  include: { project: { include: { user: true } } },
});
return { project: apiKey.project, apiKey };
```

**改为：**
```typescript
// Key → User
const apiKey = await prisma.apiKey.findUnique({
  where: { keyHash },
  include: { user: true },
});

// 项目上下文：从 header 或默认值获取
const projectId = request.headers.get("x-project-id") ?? apiKey.user.defaultProjectId;

let project = null;
if (projectId) {
  project = await prisma.project.findFirst({
    where: { id: projectId, userId: apiKey.user.id }, // 校验项目归属
  });
}

return { user: apiKey.user, project, apiKey };
```

### 4.2 AuthContext 类型变更

```typescript
// 当前
interface AuthContext {
  project: Project & { user: User };
  apiKey: ApiKey;
}

// 改为
interface AuthContext {
  user: User;
  project: Project | null;  // 可为空（chat/image 不强制需要项目）
  apiKey: ApiKey;
}
```

### 4.3 项目上下文规则

| 操作 | 是否需要项目 | 来源 |
|------|:---:|------|
| chat / generate_image | 可选 | X-Project-Id header 或 defaultProjectId。无项目时 CallLog.projectId 用 defaultProjectId |
| Actions / Templates CRUD | 必须 | X-Project-Id header 或 defaultProjectId。无项目返回 400 |
| list_logs / get_usage | 必须 | 同上 |
| list_models / get_balance | 不需要 | 余额在用户级，模型全局 |

## 5. MCP 变更

### 5.1 McpAuthContext

```typescript
// 当前
interface McpAuthContext {
  project: Project;
  apiKey: ApiKey;
  permissions: ApiKeyPermissions;
}

// 改为
interface McpAuthContext {
  user: User;
  project: Project | null;
  apiKey: ApiKey;
  permissions: ApiKeyPermissions;
}
```

### 5.2 McpServerOptions

```typescript
// 当前
interface McpServerOptions {
  projectId: string;
  permissions: Partial<ApiKeyPermissions>;
}

// 改为
interface McpServerOptions {
  userId: string;
  projectId: string | null;  // 来自 defaultProjectId 或连接参数
  permissions: Partial<ApiKeyPermissions>;
}
```

### 5.3 MCP Tools 适配

大部分工具用 `opts.projectId` 查询数据，改动最小化：
- projectId 为 null 时，需要项目的工具返回错误提示"请先创建项目或设置默认项目"
- get_balance 改为直接查 User.balance（不经 project）
- list_models 不受影响（全局查询）

## 6. API 端点变更

### 6.1 /v1/chat/completions 和 /v1/images/generations

```typescript
// 当前
const { project, apiKey } = auth.ctx;
const userId = project.userId;

// 改为
const { user, project, apiKey } = auth.ctx;
const projectId = project?.id ?? user.defaultProjectId;
// projectId 用于 CallLog 记录，userId 用于计费
```

### 6.2 Keys 管理 API

路径从 `/api/projects/:id/keys` 改为 `/api/keys`（用户级）：

- **GET /api/keys** — 列出当前用户所有 Key
- **POST /api/keys** — 创建 Key（绑定 userId）
- **PATCH /api/keys/:keyId** — 编辑 Key
- **DELETE /api/keys/:keyId** — 吊销 Key

旧路径 `/api/projects/:id/keys` 删除。

### 6.3 充值 API

路径从 `/api/admin/users/:id/projects/:projectId/recharge` 简化为 `/api/admin/users/:id/recharge`：
- 去掉 projectId 参数
- 直接充值到 User.balance
- 旧路径直接删除

### 6.4 删除的 API 路径

| 旧路径 | 处理 |
|--------|------|
| `/api/projects/:id/keys` (GET/POST) | 删除，改为 `/api/keys` |
| `/api/projects/:id/keys/:keyId` (GET/PATCH/DELETE) | 删除，改为 `/api/keys/:keyId` |
| `/api/admin/users/:id/projects/:projectId/recharge` | 删除，改为 `/api/admin/users/:id/recharge` |

## 7. 前端变更

### 7.1 Keys 管理页

- 从 `/keys`（当前按项目列出）改为按用户列出所有 Key
- 移除项目切换的影响（Key 不再和项目绑定）
- 可考虑移到 Settings 页的新 tab（但这属于 BL-079，不在本批次）

### 7.2 Sidebar 余额显示

当前侧边栏显示 project.balance，改为显示 user.balance。

### 7.3 Balance 页面

当前 `/balance` 通过项目查余额，改为直接查用户余额。交易记录仍可按项目筛选。

## 8. 不改动的部分

| 组件 | 保持不变的原因 |
|------|--------------|
| Actions / Templates | 仍按项目隔离，projectId 不变 |
| CallLog.projectId | 保留，用于按项目统计和审计 |
| Transaction.projectId | 保留，用于按项目追踪支出 |
| 项目切换器 | 保留，用于切换资源上下文 |
| Project CRUD | 保留 |

## 8.1 删除的部分

| 组件 | 说明 |
|------|------|
| Project.balance 字段 | 余额完全在 User 级，删除 |
| RechargeOrder.projectId | 充值是用户级操作，删除 |
| 旧 Keys API 路径 | `/api/projects/:id/keys/*` 直接删除 |
| 旧充值 API 路径 | `/api/admin/users/:id/projects/:projectId/recharge` 直接删除 |
| 旧 API Key 数据 | 清空重建，用户需重新创建 Key |

## 9. 验收标准

### F-K1-01 Schema 迁移
1. ApiKey.projectId → userId 迁移完成
2. User.defaultProjectId 已设置（取用户第一个项目）
3. RechargeOrder.projectId 改为可选
4. deduct_balance 函数更新
5. prisma generate + migrate dev 通过
6. tsc 通过

### F-K1-02 鉴权中间件重构
1. authenticateApiKey 从 Key 解析 userId
2. X-Project-Id header 或 defaultProjectId 获取项目上下文
3. 项目归属校验（用户只能访问自己的项目）
4. 无项目时 chat/image 仍可调用
5. 无项目时 Actions/Templates 返回 400
6. tsc 通过

### F-K1-03 API 端点适配
1. /v1/chat/completions 和 /v1/images/generations 正常工作
2. CallLog.projectId 仍正确记录
3. 计费扣费走 userId
4. tsc 通过

### F-K1-04 Keys 管理 API 改为用户级
1. GET/POST/PATCH/DELETE /api/keys 正常工作
2. 旧 /api/projects/:id/keys 路径删除
3. 创建 Key 绑定 userId
4. tsc 通过

### F-K1-05 充值 API 简化
1. POST /api/admin/users/:id/recharge 正常工作
2. 旧 /api/admin/users/:id/projects/:projectId/recharge 删除
3. 充值到 User.balance
4. tsc 通过

### F-K1-06 MCP 适配
1. MCP auth 返回 userId
2. MCP tools 按需使用 projectId（可空）
3. get_balance 直接查 User.balance
4. 无项目时需要项目的工具返回友好错误
5. tsc 通过

### F-K1-07 前端适配
1. Keys 页面列出用户所有 Key（非按项目）
2. 侧边栏余额显示 User.balance
3. Balance 页面查用户余额
4. tsc 通过

### F-K1-08 余额模型清理
1. Project.balance 字段已删除
2. RechargeOrder.projectId 字段已删除
3. 侧边栏/页面显示 User.balance
4. deduct_balance 直接接收 userId
5. tsc 通过

### F-K1-09 全量验收（executor: codex）
1. 用户用 Key 调 chat → 成功，扣 User.balance
2. 同一 Key 切换项目（X-Project-Id）→ 访问不同项目的 Actions
3. 无项目时 chat 可用、Actions 返回 400
4. Keys 管理列出所有 Key
5. Admin 充值到用户余额
6. MCP 连接正常
7. 签收报告生成
