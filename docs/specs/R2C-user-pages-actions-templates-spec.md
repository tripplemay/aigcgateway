# R2C — 用户侧页面还原：Actions + Templates

## 批次目标

将 `/actions`（3页）和 `/templates`（3页）从旧代码模式还原为 R1 设计系统，对齐 Stitch 设计稿。先做 Actions 再做 Templates（Templates 编辑器引用 Actions）。

## 设计稿映射

| 页面路由 | 设计稿路径 | DESIGN.md |
|---|---|---|
| `/actions` | `design-draft/actions/` | 有 |
| `/actions/[actionId]` | `design-draft/actions-detail/` | 有 |
| `/actions/new` | `design-draft/actions-editor/` | 有 |
| `/templates` | `design-draft/templates/` | 有 |
| `/templates/[templateId]` | `design-draft/templates-detail/` | 有 |
| `/templates/new` | `design-draft/templates-editor/` | 有 |

**开发前必读：** `design-draft/DESIGN-GLOBAL.md` + 每个页面的 `DESIGN.md`

## 还原原则

与 R2A/R2B 一致：

1. **DS 组件替换**：useAsyncData、Table、Card、Dialog、Button、Input、SearchBar、Pagination
2. **视觉对齐设计稿**：使用 DS token，不硬编码颜色
3. **功能范围 = DESIGN.md 中标注为 "Fully supported" 的功能**，忽略标注为 "Ignore" 的
4. **组件拆分**：大块 UI 抽为子组件
5. **i18n**：所有用户可见文本走 next-intl，中英双语。**自检清单同 R2A/R2B**

## 页面级需求

### /actions — Action 列表

**数据源：** `GET /api/projects/:id/actions`（search, page, pageSize）

**功能：**
- 表格列：Action Name、Model、版本号（显示为 "v{number}"）、描述、更新时间
- 搜索（SearchBar）
- 分页（Pagination）
- "Create Action" 按钮 → 跳转 /actions/new
- 行点击 → 跳转 /actions/[actionId]

**不做（见 DESIGN.md）：** semver 格式版本号、Variables 数量列

### /actions/[actionId] — Action 详情

**数据源：**
- `GET /api/projects/:id/actions/:actionId`（基本信息 + 活跃版本）
- `GET /api/projects/:id/actions/:actionId/versions`（版本列表）
- `PUT /api/projects/:id/actions/:actionId/active-version`（切换活跃版本）

**功能：**
- 头部：名称 + 模型 badge + Delete/Edit/New Version 按钮
- Active Version 区：版本号、System Message、User Prompt（含 {{变量}} 高亮）
- Variables Configuration 表格（name, description, required, default value）
- Version History 列表 + "Current" 标记 + 切换活跃版本按钮
- Delete Action（确认弹窗，被 Template 引用时阻止）

**不做（见 DESIGN.md）：** 版本作者、部署时间戳、Developer Quick-Link

### /actions/new — Action 编辑器（创建/编辑通用）

**数据源：**
- `POST /api/projects/:id/actions`（创建）
- `PUT /api/projects/:id/actions/:actionId`（编辑元数据）
- `POST /api/projects/:id/actions/:actionId/versions`（创建新版本）

**功能：**
- Basic Info：Action Name、Model Selection（下拉，从 /v1/models 拉列表）、Description
- Messages Editor：System/User 消息编辑 + "Add Message" 按钮 + {{变量}} 语法高亮
- Detected Variables 面板：自动从消息内容中提取 {{variable}}，显示 required 开关 + description + default value
- Changelog 输入
- Cancel / Save 按钮

### /templates — Template 列表

**数据源：** `GET /api/projects/:id/templates`（search, page, pageSize）

**功能：**
- 表格列：Name、Steps 数量 badge、Execution Mode（Sequential/Fan-out）、Description、Last Updated
- 搜索（SearchBar）
- 分页（Pagination）
- "Create Template" 按钮 → 跳转 /templates/new
- 行点击 → 跳转 /templates/[templateId]

**不做（见 DESIGN.md）：** 自定义 ID 格式、Aggregator 模式、Import from Library

### /templates/[templateId] — Template 详情

**数据源：** `GET /api/projects/:id/templates/:templateId`

**功能：**
- 头部：名称 + SEQUENTIAL/FAN-OUT badge + Edit/Delete 按钮
- Execution Architecture：步骤流程列表（每步显示 Action 名称 + 模型 + 角色 badge + 设置图标）
- Template Info 卡片（Created Date、Last Updated、Step Count、Execution Mode）
- Resources Used（从 steps→actions→model 客户端推算模型引用）

**不做（见 DESIGN.md）：** Pipeline Preview 动画图

### /templates/new — Template 编辑器

**数据源：**
- `POST /api/projects/:id/templates`（创建）
- `PUT /api/projects/:id/templates/:templateId`（编辑）
- `GET /api/projects/:id/actions`（拉 Action 列表供选择）

**功能：**
- Template Name + Description
- 步骤编排：从已有 Actions 列表中选择 + 指定 order + 指定 role（SEQUENTIAL/SPLITTER/BRANCH/MERGE）
- 步骤可删除、可调整顺序
- Cancel / Save 按钮

**不做（见 DESIGN.md）：** Auto-Optimization、Pipeline Stats、Dry Run Test

## 技术约束

- 页面文件位于 `src/app/(console)/` 下
- 所有 API 调用使用 apiFetch
- 状态管理使用 useAsyncData hook
- 新组件放入 src/components/actions/ 和 src/components/templates/
- 不修改任何 API route / Prisma schema / 后端逻辑
- **i18n 自检清单**（同 R2A/R2B）：
  1. 搜索所有 JSX 中的裸字符串
  2. 切换到 zh-CN 检查无未翻译文案
  3. 特别注意：placeholder、breadcrumb、状态标签、时间格式化、分页文案
