# Action + Template 统一重构规格文档（P4）

> 批次：p4-action-template
> 日期：2026-04-05
> 状态：planning

---

## 一、背景与目标

现有 Template 系统（P3-1 交付）仅支持静态 prompt 模板注入：一组 messages + 变量替换，注入到 `/v1/chat/completions`。调用者无法指定模型，无法串联多步调用，无法并行分拆任务。

本批次将 Template 系统彻底重构为两层架构：

- **Action（原子单元）**：绑定模型 + 提示词内容 + 变量定义。一个 Action 代表"用某个模型做某件事"。
- **Template（编排层）**：由一个或多个 Action 按顺序或并行组合而成。支持三种执行模式：单步、串行多步、动态 Fan-out。

旧 Template 系统（数据库表、API 路由、MCP Tool、控制台页面）全部删除重建。生产数据为测试数据，允许破坏性变更，无需迁移。

---

## 二、核心概念

### 2.1 Action（动作）

Action 是不可拆分的原子执行单元：

```
Action = {
  name: string          // 可读名称，如 "generate_outline"
  model: string         // 完整模型名，如 "volcengine/doubao-pro-32k"
  messages: Message[]   // 提示词，支持 {{variable}} 占位符
  variables: VarDef[]   // 变量定义（name/description/required/defaultValue）
}
```

Action 支持版本管理（与现有 TemplateVersion 逻辑相同），有 activeVersionId 标记当前激活版本。

### 2.2 Template（模板/工作流）

Template 是 Action 的编排组合，由有序的 TemplateStep 列表构成：

```
Template = {
  name: string
  steps: TemplateStep[]
}

TemplateStep = {
  order: number         // 执行顺序（0-based）
  actionId: string      // 引用的 Action
  role: StepRole        // SEQUENTIAL | SPLITTER | BRANCH | MERGE
}
```

### 2.3 三种执行模式

**模式 A：单步（步骤数 = 1）**
等同于旧版简单模板。一个 Action 执行，变量注入，返回结果。

**模式 B：串行多步（所有步骤 role = SEQUENTIAL）**
步骤按 order 顺序执行。每步的完整输出自动作为下一步的 `{{previous_output}}` 变量注入。

```
Step 1 (Action A) → output → Step 2 (Action B, {{previous_output}}) → output → ...
```

**模式 C：动态 Fan-out（包含 SPLITTER + BRANCH + MERGE）**

```
Step 0 (SPLITTER, Action A) → 输出 JSON 数组
    → Step 1 (BRANCH, Action B) × N  （并行）
        → Step 2 (MERGE, Action C, {{all_outputs}})
```

Fan-out 结构规则：
- SPLITTER 必须是第一个步骤，输出必须是合法 JSON 数组，每项含 `content` 字段
- BRANCH 步骤只能有一个，engine 将 SPLITTER 的每个 `{content}` 作为 `{{branch_input}}` 并行运行
- MERGE 步骤可选，`{{all_outputs}}` 注入所有 BRANCH 结果（JSON 数组格式）
- 缺少 MERGE 时，所有 BRANCH 输出按顺序拼接后返回

---

## 三、保留变量（Reserved Variables）

以下变量名由引擎自动注入，用户不得在变量定义中重名：

| 变量名 | 注入场景 | 内容 |
|--------|----------|------|
| `{{previous_output}}` | 串行模式每步（非第一步） | 上一步的完整文本输出 |
| `{{branch_input}}` | Fan-out BRANCH 步骤 | 当前分支的 content 字符串 |
| `{{all_outputs}}` | Fan-out MERGE 步骤 | 所有分支输出的 JSON 数组（`["output1","output2",...]`） |

---

## 四、数据库 Schema

### 4.1 新增模型

```prisma
model Action {
  id              String   @id @default(cuid())
  projectId       String
  name            String
  description     String?
  model           String                    // 完整模型名
  activeVersionId String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  project       Project        @relation(fields: [projectId], references: [id])
  versions      ActionVersion[]
  templateSteps TemplateStep[]

  @@index([projectId])
  @@map("actions")
}

model ActionVersion {
  id            String   @id @default(cuid())
  actionId      String
  versionNumber Int
  messages      Json     // Message[]：[{role, content}]，支持 {{variable}}
  variables     Json     // VarDef[]：[{name, description, required, defaultValue?}]
  changelog     String?
  createdAt     DateTime @default(now())

  action Action @relation(fields: [actionId], references: [id], onDelete: Cascade)

  @@unique([actionId, versionNumber])
  @@index([actionId])
  @@map("action_versions")
}

model Template {
  id          String   @id @default(cuid())
  projectId   String
  name        String
  description String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  project Project       @relation(fields: [projectId], references: [id])
  steps   TemplateStep[]

  @@index([projectId])
  @@map("templates")
}

model TemplateStep {
  id         String   @id @default(cuid())
  templateId String
  actionId   String
  order      Int
  role       StepRole @default(SEQUENTIAL)
  createdAt  DateTime @default(now())

  template Template @relation(fields: [templateId], references: [id], onDelete: Cascade)
  action   Action   @relation(fields: [actionId], references: [id])

  @@unique([templateId, order])
  @@index([templateId])
  @@map("template_steps")
}

enum StepRole {
  SEQUENTIAL
  SPLITTER
  BRANCH
  MERGE
}
```

### 4.2 删除模型

- `TemplateVersion` → 删除整张表（`template_versions`）
- `Template`（旧）→ 完全替换（字段不同）

### 4.3 CallLog 字段更新

删除旧字段，新增字段：
```prisma
// 删除：
templateId        String?
templateVersionId String?
templateVariables Json?

// 新增：
actionId        String?    // 执行的 Action ID（单步或模板中的每步）
actionVersionId String?    // 执行时的 ActionVersion ID
templateRunId   String?    // 关联的 Template 运行批次 ID（可选，用于聚合查询）
```

---

## 五、API 设计

### 5.1 Action CRUD（管理面）

```
POST   /api/projects/:id/actions                              # 创建 Action（含首个版本）
GET    /api/projects/:id/actions                              # 列表（含 activeVersion 信息）
GET    /api/projects/:id/actions/:actionId                    # 详情（含所有版本）
PUT    /api/projects/:id/actions/:actionId                    # 更新名称/描述/model
DELETE /api/projects/:id/actions/:actionId                    # 删除

POST   /api/projects/:id/actions/:actionId/versions           # 新建版本
GET    /api/projects/:id/actions/:actionId/versions           # 版本列表
PUT    /api/projects/:id/actions/:actionId/active-version     # 激活指定版本
```

**创建 Action 请求体：**
```json
{
  "name": "generate_outline",
  "description": "生成内容大纲",
  "model": "volcengine/doubao-pro-32k",
  "messages": [
    { "role": "system", "content": "你是一个大纲生成助手" },
    { "role": "user",   "content": "请为以下主题生成大纲：{{topic}}" }
  ],
  "variables": [
    { "name": "topic", "description": "主题", "required": true }
  ],
  "changelog": "初始版本"
}
```

### 5.2 Template CRUD（管理面）

```
POST   /api/projects/:id/templates                            # 创建 Template（含 steps）
GET    /api/projects/:id/templates                            # 列表
GET    /api/projects/:id/templates/:templateId                # 详情（含 steps + Action 信息）
PUT    /api/projects/:id/templates/:templateId                # 更新名称/描述/steps
DELETE /api/projects/:id/templates/:templateId                # 删除
```

**创建 Template 请求体：**
```json
{
  "name": "旅行计划生成器",
  "description": "先生成框架，再填充内容",
  "steps": [
    { "actionId": "act_xxx", "order": 0, "role": "SEQUENTIAL" },
    { "actionId": "act_yyy", "order": 1, "role": "SEQUENTIAL" }
  ]
}
```

### 5.3 执行端点（调用面，兼容 OpenAI Auth）

**运行单个 Action：**
```
POST /v1/actions/run
Authorization: Bearer pk_xxx

{
  "action_id": "act_xxx",
  "variables": { "topic": "量子计算" },
  "stream": true
}
```

**运行 Template：**
```
POST /v1/templates/run
Authorization: Bearer pk_xxx

{
  "template_id": "tpl_xxx",
  "variables": { "destination": "日本" },
  "stream": true
}
```

---

## 六、SSE 输出格式

### 6.1 单步 Action 运行

```
data: {"type":"action_start","action_id":"act_xxx","model":"volcengine/..."}
data: {"type":"content","delta":"大纲第一章..."}
data: {"type":"content","delta":"大纲第二章..."}
data: {"type":"action_end","usage":{"prompt_tokens":120,"completion_tokens":340}}
data: [DONE]
```

### 6.2 串行 Template 运行

```
data: {"type":"step_start","step":0,"role":"SEQUENTIAL","action_id":"act_xxx","model":"gpt-4o"}
data: {"type":"content","step":0,"delta":"框架第一章..."}
data: {"type":"step_end","step":0,"usage":{...}}

data: {"type":"step_start","step":1,"role":"SEQUENTIAL","action_id":"act_yyy","model":"claude-3-5"}
data: {"type":"content","step":1,"delta":"详细内容..."}
data: {"type":"step_end","step":1,"usage":{...}}

data: {"type":"done","total_steps":2}
data: [DONE]
```

### 6.3 Fan-out Template 运行

```
data: {"type":"step_start","step":0,"role":"SPLITTER","action_id":"act_aaa"}
data: {"type":"content","step":0,"delta":"[{\"content\":\"东京\"},{\"content\":\"京都\"}]"}
data: {"type":"step_end","step":0,"branches":2}

data: {"type":"branch_start","branch":0,"input":"东京"}
data: {"type":"content","branch":0,"delta":"东京详细行程..."}
data: {"type":"branch_end","branch":0}

data: {"type":"branch_start","branch":1,"input":"京都"}
data: {"type":"content","branch":1,"delta":"京都详细行程..."}
data: {"type":"branch_end","branch":1}

data: {"type":"step_start","step":2,"role":"MERGE","action_id":"act_ccc"}
data: {"type":"content","step":2,"delta":"完整旅行计划..."}
data: {"type":"step_end","step":2}

data: {"type":"done","total_steps":3,"branches":2}
data: [DONE]
```

---

## 七、执行引擎设计

### 7.1 文件结构

```
src/lib/action/
  runner.ts          # ActionRunner：单个 Action 执行
  inject.ts          # 变量注入（替代旧 template/inject.ts）

src/lib/template/
  runner.ts          # TemplateRunner：编排执行
  sequential.ts      # 串行多步逻辑
  fanout.ts          # Fan-out 逻辑（SPLITTER/BRANCH/MERGE）
```

### 7.2 ActionRunner 逻辑

```
1. 取 Action.activeVersionId → 加载 ActionVersion（messages + variables）
2. 校验必填变量（与 injectTemplate 相同）
3. 替换 {{variable}} 占位符 → 得到 injectedMessages
4. 调用 engine.chatCompletions(model, injectedMessages, ...)
5. 流式输出 SSE content delta
6. 完成后 → 写 CallLog（含 actionId/actionVersionId）+ 扣费
7. 返回完整 output 字符串（供上层串联）
```

### 7.3 TemplateRunner 串行逻辑

```
1. 加载 Template.steps（按 order 排序，全部 role=SEQUENTIAL）
2. previousOutput = null
3. for each step:
   a. 构建 variables = { ...callerVariables, previous_output: previousOutput }
   b. 调用 ActionRunner（stream SSE with step marker）
   c. previousOutput = step.fullOutput
4. 所有步骤完成 → 发送 done
```

### 7.4 TemplateRunner Fan-out 逻辑

```
1. 步骤 0（SPLITTER）：执行 Action → 收集完整输出 → JSON.parse → 得到 parts[]
   - 若 parse 失败 → 返回 error SSE
   - 每项必须有 content 字段
2. 并行执行所有 BRANCH：
   - for each part: ActionRunner({ ...callerVariables, branch_input: part.content })
   - 用 Promise.all 并行，流式输出各自 branch_start/content/branch_end
3. 步骤 N（MERGE，可选）：
   - variables = { ...callerVariables, all_outputs: JSON.stringify(branchOutputs) }
   - 调用 ActionRunner → SSE 输出
4. 若无 MERGE：按 branch 顺序拼接输出，发送 done
```

---

## 八、MCP Tool 更新

### 8.1 删除旧 Tool

删除：`create-template`、`get-template`、`list-templates`、`update-template`、`confirm-template`（5 个）

### 8.2 新增 Tool

**list-actions**：列出当前项目所有 Actions，含名称、描述、模型、激活版本。

**run-action**：运行单个 Action，传 action_id + variables，返回完整文本输出。

**list-templates**：列出当前项目所有 Templates，含名称、描述、步骤数、执行模式摘要。

**run-template**：运行 Template，传 template_id + variables，流式返回每步输出。

### 8.3 SERVER_INSTRUCTIONS 更新内容

- Action 与 Template 的区别和使用场景
- 保留变量说明（previous_output / branch_input / all_outputs）
- run-action 与 run-template 的 variables 传递方式
- Fan-out 模式的 SPLITTER 输出格式要求

---

## 九、控制台页面

### 9.1 Action 页面（新增）

- `/actions`：Action 列表（名称、模型、激活版本号、描述、操作）
- `/actions/new`：创建 Action（名称、描述、模型选择器、messages 编辑器、变量定义）
- `/actions/:actionId`：详情页（版本列表、激活版本切换、编辑入口）

### 9.2 Template 页面（重构）

- `/templates`：Template 列表（名称、步骤数、执行模式、操作）
- `/templates/new`：创建 Template（名称、描述、步骤编排器：选 Action + 设置 role）
- `/templates/:templateId`：详情页（步骤可视化、编辑入口）

**步骤编排器 UI：**
- 步骤列表（可拖拽排序，每步选择已有 Action + 设置 role）
- 执行模式自动推断（全 SEQUENTIAL = 串行；含 SPLITTER = Fan-out）
- 保留变量提示（选中非第一步时显示 `{{previous_output}}` 可用）

---

## 十、删除范围（旧 Template 系统）

| 类型 | 删除对象 |
|------|----------|
| 数据库 | `template_versions` 表，`templates` 表（重建），CallLog 旧字段 |
| API | `/api/projects/:id/templates/fork`、`/active-version` 路由 |
| lib | `src/lib/template/inject.ts`（替换为 `src/lib/action/inject.ts`） |
| v1 | `/v1/chat/completions` 中的 `template_id` 注入逻辑 |
| MCP | `create-template`、`get-template`、`list-templates`、`update-template`、`confirm-template` |
| 控制台 | 旧 `/templates/[templateId]` 页面（重构）、旧 `/templates/new`（重构） |

**不删除：** 侧边栏的模板入口保留（路由不变）、`/templates` 列表路由保留（内容重构）

---

## 十一、i18n 要求

- 新增命名空间：`actions`（对应现有 `templates` 命名空间）
- 需要更新：`en.json` + `zh-CN.json`，新增 action 相关 key，更新 template 相关 key
- 保留变量名不翻译（`previous_output`、`branch_input`、`all_outputs`）
- StepRole 枚举值在 UI 中的显示：SEQUENTIAL="顺序"，SPLITTER="分拆"，BRANCH="分支"，MERGE="合并"

---

## 十二、不在本批次范围内

- Template 运行历史记录页面（TemplateRun 审计详情）
- 步骤间数据格式转换（目前只支持纯文本传递）
- Action/Template 跨项目共享
- 版本 diff 对比视图
