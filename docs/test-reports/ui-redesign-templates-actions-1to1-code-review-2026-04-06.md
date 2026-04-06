# ui-redesign-templates-actions 1:1 代码级还原测试（2026-04-06）

## 结论
- **总体结论：FAIL（未达到 1:1 代码级还原）**
- 判定依据：对 7 个页面实施“实现源码 vs 原型源码”逐页核对，检查 DOM 结构层级、核心区块、关键字段/列、交互入口与数据绑定路径。

## 发现（按严重级别）

### High-1：Action 编辑态未实现（仅创建态）
- 文件：`src/app/(console)/actions/new/page.tsx`
- 位置：`1-349`（全文件未处理 `edit` 查询参数，提交仅走 POST）
- 现象：页面路由支持 `/actions/new?edit={id}`，但代码无 `useSearchParams`、无 `GET /actions/{id}` 回填、无 PUT 更新分支。
- 影响：无法按原型“Create/Edit 一体”流程编辑既有 Action，1:1 交互语义不成立。

### High-2：Template 编辑态未实现（仅创建态）
- 文件：`src/app/(console)/templates/new/page.tsx`
- 位置：`1-266`（全文件未处理 `edit` 查询参数，提交仅走 POST）
- 现象：页面路由支持 `/templates/new?edit={id}`，但无回填与更新分支。
- 影响：模板编辑器不具备原型中的编辑能力，1:1 功能还原失败。

### High-3：Admin 模板管理页缺失原型关键列与操作能力
- 文件：`src/app/(console)/admin/templates/page.tsx`
- 位置：`128-176`（表格列定义与行渲染）
- 与原型差异：
  - 缺少 Public 开关列
  - 缺少 Quality Score 列
  - 缺少操作列（Actions）
  - 统计卡片维度也与原型不一致（原型强调 total/public/private）
- 影响：管理员治理场景信息不完整，且不满足本轮验收定义。

### Medium-1：Action 列表页结构与原型存在明显布局偏差
- 文件：`src/app/(console)/actions/page.tsx`
- 位置：`67-182`
- 差异点：
  - 实现侧使用“主表 + 右侧统计卡”双栏布局；原型同页还包含更丰富的下方分析模块（如 latency/health 区块结构）
  - 表格列标题“Version”与验收描述“Active Version”不一致（语义弱化）
- 影响：视觉与信息层级未完全对齐，属于非 1:1 级偏差。

### Medium-2：Template 列表页未对齐原型的外层结构与扩展信息块
- 文件：`src/app/(console)/templates/page.tsx`
- 位置：`72-169`
- 差异点：
  - 原型包含更完整的外层“Explorer + 辅助信息”结构；实现仅保留主表块
  - 原型中的扩展卡片/健康信息区未还原
- 影响：页面骨架“可用”，但不属于严格 1:1。

### Medium-3：Template 详情页流程区块为简化版
- 文件：`src/app/(console)/templates/[templateId]/page.tsx`
- 位置：`130-227`
- 差异点：
  - 实现保留步骤流水线和信息侧栏，但未完整还原原型中的部分视觉组件与占位流程段（如 add-step placeholder 等呈现层）
- 影响：核心功能可用，但 1:1 还原度不足。

### Medium-4：Action 详情页右侧信息面板字段较原型简化
- 文件：`src/app/(console)/actions/[actionId]/page.tsx`
- 位置：`288-313`
- 差异点：
  - 仅展示 createdAt / totalVersions / model，未完全覆盖原型“insights”面板信息密度（如模板引用数展示）
- 影响：信息完整性低于原型。

## 页面级判定（1:1）
- `/actions`：**PARTIAL**
- `/actions/{id}`：**PARTIAL**
- `/actions/new?edit={id}`：**FAIL**
- `/templates`：**PARTIAL**
- `/templates/{id}`：**PARTIAL**
- `/templates/new?edit={id}`：**FAIL**
- `/admin/templates`：**FAIL**

## 建议状态
- 维持 `fixing`，优先修复：
  1. `F-UI-03` 编辑态回填与更新
  2. `F-UI-06` 编辑态回填与更新
  3. `F-UI-07` Admin 列/开关/操作/筛选分页完整补齐

## 证据
- 代码对照文件：
  - `src/app/(console)/actions/page.tsx`
  - `src/app/(console)/actions/[actionId]/page.tsx`
  - `src/app/(console)/actions/new/page.tsx`
  - `src/app/(console)/templates/page.tsx`
  - `src/app/(console)/templates/[templateId]/page.tsx`
  - `src/app/(console)/templates/new/page.tsx`
  - `src/app/(console)/admin/templates/page.tsx`
- 原型文件：
  - `design-draft/Action List (v2)/index.html`
  - `design-draft/Action Detail (v2)/index.html`
  - `design-draft/Action Editor (v2)/index.html`
  - `design-draft/Template List (v2)/index.html`
  - `design-draft/Template Detail (v2)/index.html`
  - `design-draft/Template Editor (v2)/index.html`
  - `design-draft/Admin Template Management (v2)/index.html`
