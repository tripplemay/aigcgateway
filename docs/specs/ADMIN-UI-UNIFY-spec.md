# ADMIN-UI-UNIFY 批次规格文档

**批次代号：** ADMIN-UI-UNIFY
**目标：** 将 admin 端 9 个管理员页面全面对齐设计系统，使用公共组件
**触发时机：** UI-UNIFY-FIX-2 签收后启动
**规模：** 9 个 generator + 1 个 codex 验收 = 10 条

## 背景

UI-UNIFY 及其后续批次**只改造了 `src/app/(console)/` 下非 admin 的 12 个用户端页面**，admin 端 9 个页面**完全零采用**所有公共组件：

| admin 页面 | 当前状态 |
|-----------|---------|
| admin/health | 无 PageContainer、`<h2>` × 2，无 max-w |
| admin/logs | 无 PageContainer、`<h2>` × 1，max-w-7xl |
| admin/model-aliases | 无 PageContainer、`<h1>+<h2>×4`，max-w-md（窄）|
| admin/models | 无 PageContainer、`<h1>+<h2>`，max-w-7xl |
| admin/operations | 无 PageContainer、`<h2>`，max-w-7xl |
| admin/providers | 无 PageContainer、`<h2>`×3，max-w-7xl |
| admin/templates | 无 PageContainer、`<h1>`，max-w-md |
| admin/usage | 无 PageContainer、`<h2>`，max-w-7xl |
| admin/users | 无 PageContainer、`<h2>`，max-w-7xl |

**问题：**
- 标题标签混用 `<h1>` vs `<h2>`
- max-w 混用：max-w-md / max-w-7xl / none
- 所有手写 Table / card / chip / button 样式
- 没有使用 PageContainer / PageHeader / TableCard / SectionCard / KPICard / StatusChip

## Features

### Phase 1：数据页（大改造）

| ID | 标题 | 优先级 | 验收 |
|----|------|--------|------|
| F-AUU-01 | admin/models 改造 | high | 1) 使用 PageContainer + PageHeader；2) 表格改用 TableCard；3) 状态 chip 改用 StatusChip；4) 主按钮用 gradient-primary variant；5) 不改动业务逻辑；6) tsc 通过 |
| F-AUU-02 | admin/model-aliases 改造 | high | 1) max-w-md → default PageContainer；2) PageHeader；3) 所有手写 rounded-xl section → SectionCard；4) 编辑器相关交互保留；5) tsc 通过 |
| F-AUU-03 | admin/providers 改造 | high | 1) PageContainer + PageHeader；2) 服务商卡片用 SectionCard；3) 状态 chip 用 StatusChip；4) tsc 通过 |
| F-AUU-04 | admin/templates 改造 | medium | 1) max-w-md → default PageContainer；2) PageHeader；3) TableCard（如果有列表）；4) tsc 通过 |
| F-AUU-05 | admin/users 改造 | medium | 1) PageContainer + PageHeader；2) 用户列表 TableCard；3) 状态 chip 用 StatusChip；4) tsc 通过 |

### Phase 2：运维/观测页

| ID | 标题 | 优先级 | 验收 |
|----|------|--------|------|
| F-AUU-06 | admin/operations 改造 | medium | 1) PageContainer + PageHeader；2) 运维卡片用 SectionCard；3) 主按钮 gradient-primary；4) tsc 通过 |
| F-AUU-07 | admin/health 改造 | medium | 1) PageContainer + PageHeader；2) 健康状态卡片用 SectionCard；3) 状态 chip 用 StatusChip；4) tsc 通过 |
| F-AUU-08 | admin/logs 改造 | medium | 1) PageContainer + PageHeader；2) 日志列表 TableCard；3) 状态 chip 用 StatusChip；4) tsc 通过 |
| F-AUU-09 | admin/usage 改造 | low | 1) PageContainer + PageHeader；2) KPI 用 KPICard；3) TableCard；4) tsc 通过 |

### Phase 3：验收

| ID | 标题 | 优先级 | 验收 |
|----|------|--------|------|
| F-AUU-10 | ADMIN-UI-UNIFY 全量验收 | high | codex 执行：1) 9 个 admin 页面都使用 PageContainer + PageHeader；2) 所有表格使用 TableCard；3) 所有手写 bg+rounded section 消失（SectionCard 采用）；4) 所有状态 chip 使用 StatusChip；5) 所有主按钮使用 gradient-primary variant；6) grep 机械化验证；7) 9 个页面视觉一致性人工复核；8) 签收报告生成 |

## 关键约束

- **不改业务逻辑** — 只做 UI 外壳替换
- **保留现有交互** — 搜索、分页、编辑器、dialog 等
- **admin 业务本身有自己的约定** — 比如 model-aliases 的定价编辑器非常特殊，不应强行拆分成 SectionCard，可以放在一个 SectionCard 里保留原有内部结构
- **i18n 保持不变** — admin 端已经 i18n 过

## 不在本批次范围

- 新增 admin 功能
- admin 业务逻辑优化（BL-099/101/111/113 是独立批次）
