# AIGC Gateway — P3-1 Prompt 模板治理基础建设 规格文档

> Version 1.0 | 2026-04-03
> 状态：规划完成，待实施

---

## 1. 概述

P3-1 是 Prompt 模板治理的核心基建阶段，交付完整的模板 CRUD、版本管理、变量注入引擎、API 调用链路接入、MCP 工具，以及控制台管理页面。

---

## 2. 数据模型

### 2.1 Template 表

```prisma
model Template {
  id              String    @id @default(cuid())
  projectId       String?   // null = 平台公共模板，有值 = 项目私有模板
  name            String
  description     String?
  category        String?   // 分类标签，公共模板归类用
  activeVersionId String?   // 当前活跃版本 ID（A/B 切换改此字段）
  forkedFromId    String?   // fork 自哪个平台模板（溯源用）
  createdBy       String    // userId
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  project  Project?          @relation(fields: [projectId], references: [id])
  versions TemplateVersion[]

  @@index([projectId])
  @@index([forkedFromId])
  @@map("templates")
}
```

### 2.2 TemplateVersion 表

```prisma
model TemplateVersion {
  id            String   @id @default(cuid())
  templateId    String
  versionNumber Int      // 同模板内自增（1, 2, 3...）
  messages      Json     // 完整 messages 数组，支持多轮对话 / few-shot
  variables     Json     // 变量定义列表，见 §2.4
  changelog     String?  // 本版本改了什么
  createdAt     DateTime @default(now())

  template Template @relation(fields: [templateId], references: [id])

  @@unique([templateId, versionNumber])
  @@index([templateId])
  @@map("template_versions")
}
```

### 2.3 CallLog 表变更

新增字段 `templateVersionId`：

```sql
ALTER TABLE call_logs ADD COLUMN template_version_id TEXT REFERENCES template_versions(id);
```

Prisma schema 对应增加：
```prisma
templateVersionId String? @map("template_version_id")
```

### 2.4 变量定义结构（JSON 数组）

```typescript
type TemplateVariable = {
  name: string          // 占位符名称，对应模板内的 {{name}}
  description: string   // 对开发者的说明
  required: boolean
  defaultValue?: string // 可选默认值
}
```

### 2.5 messages 字段结构

完整 OpenAI 兼容格式，支持多轮：

```json
[
  { "role": "system", "content": "你是一个专业的 {{role}}" },
  { "role": "user",   "content": "示例问题" },
  { "role": "assistant", "content": "示例回答" },
  { "role": "user",   "content": "{{question}}" }
]
```

变量占位符格式：`{{变量名}}`，仅支持 `string` 类型。

---

## 3. 变量注入引擎

**位置：** `src/lib/template/inject.ts`

**职责：**
1. 接收 `templateVersionId` + `variables: Record<string, string>`
2. 校验所有 `required` 变量均已提供
3. 对每条 message 的 `content` 做占位符替换
4. 返回组装好的 `messages` 数组，直接传入 AI 调用链路

**替换规则：**
- 全局替换同名占位符（同一条 content 内多次出现均替换）
- 未提供的非必填变量：使用 `defaultValue`，无默认值则替换为空字符串
- 未提供的必填变量：抛出 400 错误，说明缺少哪个变量

---

## 4. API 设计

### 4.1 开发者模板 API（JWT 鉴权）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/projects/:id/templates` | 列出项目模板（支持 search 参数）|
| POST | `/api/projects/:id/templates` | 创建项目模板 |
| GET | `/api/projects/:id/templates/:templateId` | 获取模板详情（含所有版本）|
| PATCH | `/api/projects/:id/templates/:templateId` | 更新模板基本信息 |
| DELETE | `/api/projects/:id/templates/:templateId` | 删除模板 |
| POST | `/api/projects/:id/templates/:templateId/versions` | 创建新版本 |
| PATCH | `/api/projects/:id/templates/:templateId/active-version` | 切换活跃版本 |
| GET | `/api/public-templates` | 列出平台公共模板（无需登录）|
| POST | `/api/projects/:id/templates/fork` | Fork 平台公共模板到项目 |

### 4.2 Admin 模板 API（JWT + ADMIN 鉴权）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/admin/templates` | 列出所有平台公共模板 |
| POST | `/api/admin/templates` | 创建平台公共模板 |
| GET | `/api/admin/templates/:templateId` | 获取模板详情 |
| PATCH | `/api/admin/templates/:templateId` | 更新模板 |
| DELETE | `/api/admin/templates/:templateId` | 删除模板 |
| POST | `/api/admin/templates/:templateId/versions` | 创建新版本 |
| PATCH | `/api/admin/templates/:templateId/active-version` | 切换活跃版本 |

### 4.3 qualityScore 回传 API

```
PATCH /api/projects/:id/logs/:traceId/quality
Authorization: Bearer <JWT>

Body: { "score": 0.85 }   // 0.0 ~ 1.0
```

更新 `call_logs.qualityScore` 字段。

### 4.4 /v1/chat/completions 扩展

新增可选入参 `templateId` 和 `variables`：

```json
{
  "templateId": "tpl_xxx",
  "variables": {
    "role": "律师",
    "question": "合同违约怎么处理？"
  },
  "model": "deepseek/v3",
  "stream": true
}
```

**优先级规则：**
- 若同时传了 `messages` 和 `templateId`，以 `templateId` 为准，忽略 `messages`
- 若只传 `templateId`，组装后的 messages 替代 `messages` 字段进入现有调用链路
- `model` 仍必传（模板不绑定模型）

**CallLog 记录：**
- `templateVersionId` 写入本次用的版本 ID
- `templateVariables` 写入传入的变量值（已有字段）

---

## 5. MCP 工具

### 5.1 新增工具

#### `create_template`
- **功能：** 根据自然语言描述生成模板草稿
- **入参：** `description: string`，`projectId?: string`（不传则创建平台公共模板，需 Admin Key）
- **返回：** 草稿对象（messages 数组 + variables 定义），不写入数据库
- **用途：** 展示给开发者确认，配合 `confirm_template` 使用

#### `confirm_template`
- **功能：** 确认并保存 `create_template` 生成的草稿
- **入参：** `draft: TemplateVersion`，`name: string`，`projectId?: string`
- **返回：** 已保存的 Template + TemplateVersion 对象

#### `list_templates`
- **功能：** 列出可用模板
- **入参：** `search?: string`，`includePublic?: boolean`（默认 true）
- **返回：** 模板列表（项目私有 + 平台公共）

#### `get_template`
- **功能：** 查看指定模板详情
- **入参：** `templateId: string`
- **返回：** 模板信息 + 所有版本 + 变量定义

#### `update_template`
- **功能：** 为已有模板创建新版本
- **入参：** `templateId: string`，`messages: array`，`variables: array`，`changelog?: string`
- **返回：** 新 TemplateVersion 对象（不自动切换为活跃版本）

### 5.2 改造现有工具：`chat`

新增可选参数：
- `templateId?: string`
- `variables?: Record<string, string>`

传入 `templateId` 时，`messages` 参数可省略。内部逻辑：获取活跃版本 → 注入变量 → 组装 messages → 走现有调用链路。

---

## 6. 控制台页面

> **注意：所有新增页面必须先完成 Stitch 原型设计，再开始前端开发。**

### 6.1 新增页面（需 Stitch 原型）

| 页面 | 路径 | 角色 | 说明 |
|------|------|------|------|
| 模板列表 | `/templates` | 开发者 | 项目模板列表 + 平台公共模板浏览 + Fork 入口 |
| 模板编辑 | `/templates/:id` | 开发者 | messages 编辑器 + 变量定义 + 版本历史 + 切换活跃版本 |
| Admin 模板管理 | `/admin/templates` | Admin | 平台公共模板 CRUD |
| Admin 模板编辑 | `/admin/templates/:id` | Admin | 同开发者编辑页，额外可设置 category |

### 6.2 现有页面改动

- **侧边栏** — 开发者导航新增"模板"入口
- **Admin 侧边栏** — 新增"模板管理"入口
- **i18n** — 所有新增文案需同步更新 `en.json` + `zh-CN.json`

---

## 7. 开发顺序

```
阶段 1：数据库（1~2天）
  → Prisma schema 新增 Template + TemplateVersion
  → CallLog 新增 templateVersionId
  → Migration + prisma generate
  → 种子数据（平台公共模板示例）

阶段 2：后端核心（3~4天）
  → 变量注入引擎（src/lib/template/inject.ts）
  → 模板 CRUD API（Admin + Project）
  → 版本管理 API
  → /v1/chat/completions 扩展
  → qualityScore 回传 API

阶段 3：Stitch 原型（与阶段 2 并行，由用户完成）
  → 模板列表页原型
  → 模板编辑页原型
  → Admin 模板管理页原型

阶段 4：前端（3~4天，等 Stitch 完成后开始）
  → 模板列表页
  → 模板编辑页（含 messages 编辑器 + 变量定义）
  → Admin 模板管理页
  → 侧边栏导航更新
  → i18n 补全

阶段 5：MCP 工具（2天）
  → create_template + confirm_template
  → list_templates + get_template + update_template
  → chat 工具改造

阶段 6：集成测试
  → L1 本地测试（模板调用链路、变量注入、MCP 工具）
  → L2 Staging 验收
```

---

## 8. 关键约束

- Schema 变更 + migration + 引用代码必须同一 commit，避免 CI tsc 死锁
- `@updatedAt` 字段 migration 必须手动补 `DEFAULT now()`
- 前端页面必须严格按 Stitch 原型 code.html 1:1 复刻 DOM 结构
- 所有新增用户可见文案必须同步 en.json + zh-CN.json，不得硬编码字符串
- MCP Tool descriptions 要精准，这是 AI 编辑器理解工具能力的唯一途径
- `create_template` 工具生成的草稿不写数据库，必须经 `confirm_template` 才保存
