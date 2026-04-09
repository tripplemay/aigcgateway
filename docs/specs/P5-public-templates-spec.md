# P5 — 系统预设模板（Public Templates）规格文档

> 批次名：P5-public-templates
> 创建日期：2026-04-09
> 状态：planning

---

## 1. 目标

让管理员标记的公共模板可被所有用户发现、浏览和 fork 到自己的项目中，形成「模板市场」闭环。

## 2. 现状

| 组件 | 状态 |
|------|------|
| Schema `isPublic` / `qualityScore` | ✅ 已有 |
| Admin API（标记公共/评分） | ✅ 已有 |
| Admin UI（toggle + 筛选） | ✅ 已有 |
| User API（公共列表/详情/fork） | ❌ 缺失 |
| User UI（Global Library tab） | ❌ 缺失 |
| MCP Tools（浏览/fork） | ❌ 缺失 |
| i18n | ⚠️ 仅 Admin 侧 |

## 3. Schema 变更

### 3.1 Template 模型新增字段

```prisma
model Template {
  // ... existing fields ...
  sourceTemplateId String?    @db.Uuid
  sourceTemplate   Template?  @relation("TemplateFork", fields: [sourceTemplateId], references: [id], onDelete: SetNull)
  forks            Template[] @relation("TemplateFork")
}
```

- `sourceTemplateId`：fork 来源，SetNull 策略（源模板删除不影响副本）
- 自引用关系，支持查询某模板被 fork 了多少次

### 3.2 Migration

一个 migration：`add_source_template_id`
- ALTER TABLE "Template" ADD COLUMN "sourceTemplateId" UUID REFERENCES "Template"("id") ON DELETE SET NULL
- CREATE INDEX "Template_sourceTemplateId_idx" ON "Template"("sourceTemplateId")

## 4. API 设计

### 4.1 GET /api/templates/public

公共模板列表，无需项目鉴权，但需 JWT 认证（登录用户可见）。

**Query Params:**
- `page` (default: 1)
- `pageSize` (default: 20)
- `search` (模糊搜索 name/description)
- `sort` (default: `qualityScore`, 可选: `name`, `updatedAt`, `forkCount`)

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "Travel Planner",
      "description": "...",
      "stepCount": 3,
      "executionMode": "sequential",
      "qualityScore": 85,
      "forkCount": 12,
      "modelId": "gpt-4o",
      "updatedAt": "2026-04-09T..."
    }
  ],
  "pagination": { "page": 1, "pageSize": 20, "total": 5, "totalPages": 1 }
}
```

注意：
- 不暴露 projectId（公共模板的归属项目对用户不可见）
- `forkCount` 通过 `_count: { forks: true }` 聚合
- 只返回 `isPublic === true` 的模板

### 4.2 GET /api/templates/public/:templateId

公共模板详情，含 Steps 和关联 Actions 概要。

**Response:**
```json
{
  "id": "uuid",
  "name": "Travel Planner",
  "description": "...",
  "systemPrompt": "...",
  "variables": [...],
  "steps": [
    {
      "id": "uuid",
      "name": "Step 1",
      "actionId": "uuid",
      "actionName": "Generate Itinerary",
      "order": 1
    }
  ],
  "qualityScore": 85,
  "forkCount": 12,
  "executionMode": "sequential",
  "modelId": "gpt-4o"
}
```

### 4.3 POST /api/projects/:projectId/templates/fork

Fork 公共模板到用户项目，深拷贝 Template + Steps + Actions。

**Request Body:**
```json
{
  "sourceTemplateId": "uuid"
}
```

**处理逻辑（事务内）：**
1. 查询源模板，验证 `isPublic === true`
2. 查询源模板的所有 Steps 及关联 Actions
3. 深拷贝 Actions：
   - 对每个关联 Action，检查用户项目中是否已存在同名 Action
   - 不存在 → 创建副本（新 ID，projectId = 当前项目）
   - 已存在 → 复用已有 Action（不覆盖）
4. 深拷贝 Template：
   - 新 ID，projectId = 当前项目
   - `sourceTemplateId` = 源模板 ID
   - `isPublic = false`
5. 深拷贝 TemplateSteps：
   - 新 ID，templateId = 新模板 ID
   - actionId = 第 3 步中映射后的 Action ID

**Response:** 新创建的 Template 完整对象

**错误场景：**
- 源模板不存在或非公共 → 404
- 用户项目中已 fork 过同一源模板 → 409（可选，或允许重复 fork）

## 5. User UI

### 5.1 Templates 页增加 Tab 切换

在现有 Templates 页头部增加 tab bar：
- **My Templates** — 现有表格视图（保持不变）
- **Global Library** — 新的卡片网格视图

Tab 状态通过 URL query param `?tab=library` 控制，默认 `my`。

### 5.2 Global Library Tab

- 3 列卡片网格
- 每张卡片展示：模板名、质量评分徽章、描述（截断 2 行）、Step 数 + 执行模式 badge、Fork 按钮
- 搜索栏
- 分页
- 底部 stats bento（公共模板数 / 最热门 / CTA）

### 5.3 Fork 确认弹窗

点击 "Fork to Project" 后弹出确认对话框：
- 展示模板名、Step 数、将拷贝的 Action 数
- 确认按钮触发 POST fork API
- 成功后 toast 提示并跳转到新模板详情页

### 5.4 设计稿参考

Stitch 生成的设计稿存放于 `design-draft/templates-global-library/`

## 6. MCP Tools

### 6.1 list_public_templates

```
Tool: list_public_templates
Description: Browse public template library. Returns templates marked as public by administrators, with quality scores and fork counts.
Input: { search?: string, page?: number, pageSize?: number }
Output: { templates: [...], pagination: {...} }
```

- 调用 `/api/templates/public` 相同逻辑
- 不写审计日志，不计费

### 6.2 fork_public_template

```
Tool: fork_public_template
Description: Fork a public template and its associated Actions to your project. Creates independent copies you can freely edit.
Input: { templateId: string }
Output: { forkedTemplate: {...}, copiedActions: number, message: string }
```

- 调用 `/api/projects/:projectId/templates/fork` 相同逻辑
- 不写审计日志，不计费（fork 是管理操作，非 AI 调用）

### 6.3 SERVER_INSTRUCTIONS 更新

在 MCP Server Instructions 中追加：
- list_public_templates 的使用场景和输出格式
- fork_public_template 的使用场景和注意事项（fork 后模板是独立副本）

## 7. i18n

### 7.1 新增翻译 key（~20 个）

命名空间 `templates`：
- `tabMyTemplates` / `tabGlobalLibrary`
- `globalLibrarySubtitle`
- `qualityScore`
- `forkCount` / `forksUnit`
- `forkToProject` / `forkNow` / `forkCancel`
- `forkDialogTitle` / `forkDialogDesc`
- `forkSuccess` / `forkError`
- `publicTemplates` / `mostPopular`
- `actionsWillBeCopied`
- `alreadyForked`（可选）

## 8. 验收标准

### F-P5-01 Stitch 设计稿
1. Global Library tab 卡片网格设计稿已生成
2. Fork 确认弹窗设计稿已生成
3. 存放于 design-draft/templates-global-library/

### F-P5-02 Schema 迁移
1. sourceTemplateId 字段添加成功
2. 自引用关系和索引正确
3. `npx prisma generate` + `migrate dev` 通过

### F-P5-03 User API
1. GET /api/templates/public 返回公共模板列表，分页正确
2. GET /api/templates/public/:id 返回完整详情含 Steps
3. POST fork 深拷贝 Template + Steps + Actions，事务完整
4. 非公共模板不可被 fork（404）
5. tsc 通过

### F-P5-04 User UI
1. Templates 页有 My Templates / Global Library 两个 tab
2. Global Library 展示 3 列卡片网格
3. Fork 确认弹窗展示待拷贝内容
4. Fork 成功跳转新模板详情
5. 布局与设计稿一致

### F-P5-05 MCP Tools
1. list_public_templates 返回公共模板列表
2. fork_public_template 成功 fork 并返回结果
3. SERVER_INSTRUCTIONS 已更新
4. tsc 通过

### F-P5-06 i18n
1. en.json + zh-CN.json 同步更新
2. 无硬编码字符串
3. UI 中英文切换正常

### F-P5-07 全量验收（executor: codex）
1. 公共模板从 Admin 标记到用户 fork 全链路通过
2. Fork 深拷贝完整性（Template + Steps + Actions）
3. MCP Tools 功能正确
4. DS token 一致，零旧 token
5. 现有 Templates 功能不回退
6. 签收报告生成
