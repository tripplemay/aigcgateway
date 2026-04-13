# UI-UNIFY 批次规格文档

**批次代号：** UI-UNIFY
**目标：** 统一 console 所有页面的视觉、布局、交互，抽取缺失的公共组件，建立设计系统规范
**触发时机：** DX-POLISH 签收部署后立即启动
**规模：** 13 个 generator + 1 个 codex 验收 = 14 条

## 背景

生产审查发现 12 个 console 页面存在严重不一致：
- 外层容器宽度至少 4 种（`max-w-4xl/5xl/6xl/7xl`），3 个页面甚至无 `max-w`
- 标题标签混用 `<h1>/<h2>/<h3>`，字号 4 种（text-2xl 到 text-4xl）
- 主按钮、表格外壳、状态标签、KPI 卡等重复散落在各页面
- shadcn tabs 默认样式与手写 pill 样式不一致（BL-123）
- 部分页面加载态逻辑错误导致闪烁（BL-122）
- 部分按钮缺 onClick（BL-121）

根因：重构到新设计系统时，只做了"1:1 HTML 翻译"，未抽取公共组件。

## 新增公共组件清单

所有新组件放在 `src/components/`（非 shadcn primitive）。

| ID | 组件 | 文件 | 用途 |
|----|------|------|------|
| C1 | PageContainer | `page-container.tsx` | 外层宽度+居中容器，`size="default\|narrow"` |
| C2 | PageHeader | `page-header.tsx` | 统一页面标题区（h1+subtitle+badge+actions） |
| C3 | TableCard | `table-card.tsx` | 表格外壳（标题+搜索+表头栏+内容） |
| C4 | KPICard | `kpi-card.tsx` | 统计卡片（label+value+trend） |
| C5 | StatusChip | `status-chip.tsx` | 彩色状态胶囊（success/error/warning/info） |
| C6 | CTABanner | `cta-banner.tsx` | 深色大卡片横幅（"构建多步工作流"等） |
| C7 | SectionCard | `section-card.tsx` | 通用带标题内容卡片 |
| C8 | TableLoader | `table-loader.tsx` | 表格内加载态占位（多行 skeleton） |
| C9 | PageLoader | `page-loader.tsx` | 页面级加载占位（替换掉各页面手写的"加载中"） |

**升级现有组件：**
- `empty-state.tsx` 升级为通用 EmptyState（`icon/title/description/action` props），保留项目 empty 作为默认实例
- `ui/button.tsx` 增加 `variant="gradient-primary"`（统一"创建"按钮的渐变样式）

**新建设计系统文档：**
- `design-draft/Layout Shell - AIGC Gateway/PAGE-LAYOUT.md` — 记录 PageHeader/PageContainer/TableCard 的规范

## Features

### 第一阶段：公共组件（6 条）

| ID | 标题 | 优先级 | 验收 |
|----|------|--------|------|
| F-UU-01 | 新建 PageContainer + PageHeader 组件（C1+C2） | high | 1) PageContainer 支持 default(max-w-7xl) / narrow(max-w-5xl)；2) PageHeader 支持 title/subtitle/badge/actions 四 props；3) h1 统一为 `text-4xl font-extrabold tracking-tight`；4) 配套 Storybook 或最简 demo 页；5) tsc 通过 |
| F-UU-02 | 新建 TableCard + TableLoader 组件（C3+C8） | high | 1) TableCard 提供标题+搜索+children slot；2) TableLoader 支持自定义 rows 和 colSpan；3) 样式与现有表格视觉一致（rounded-2xl shadow-sm border-b 表头）；4) tsc 通过 |
| F-UU-03 | 新建 KPICard + StatusChip 组件（C4+C5） | medium | 1) KPICard label/value/trend props，匹配 dashboard/usage/balance 的视觉；2) StatusChip 支持 success/error/warning/info 4 个 variant；3) 视觉与现有散落代码的中位值一致；4) tsc 通过 |
| F-UU-04 | 新建 CTABanner + SectionCard + PageLoader 组件（C6+C7+C9） | medium | 1) CTABanner 从 actions/templates 页面提取；2) SectionCard 简单包装 rounded-2xl 容器；3) PageLoader 用作页面级加载占位；4) tsc 通过 |
| F-UU-05 | 升级 empty-state.tsx 为通用 EmptyState | medium | 1) props: icon/title/description/action；2) 保留现有项目 empty 使用方式（向后兼容或迁移）；3) tsc 通过 |
| F-UU-06 | Button 扩展 gradient-primary variant | low | 1) ui/button.tsx 增加 variant，匹配现有渐变样式（bg-gradient-to-r from-ds-primary to-ds-primary-container）；2) tsc 通过 |

### 第二阶段：页面改造（6 条）

| ID | 标题 | 优先级 | 验收 |
|----|------|--------|------|
| F-UU-07 | 改造 actions + templates 页面 | high | 1) 使用 PageContainer + PageHeader + TableCard + TableLoader + EmptyState + CTABanner + 新 Button variant；2) 顺便修复 BL-121 相关 UI 问题（标题闪烁 BL-122）；3) 视觉对齐新规范；4) tsc 通过；5) scripts/e2e-test.ts 增加回归测试验证页面正常渲染（遵循 test-lifecycle.md 规则） |
| F-UU-08 | 改造 keys + models 页面 | high | 1) keys 全面使用新组件；2) models 页面修复 BL-121（底部"显示全部"按钮无 onClick）；3) 标题字号统一 text-4xl；4) 外层使用 PageContainer default；5) tsc 通过 |
| F-UU-09 | 改造 logs + usage + balance + dashboard 页面 | high | 1) 四个页面统一使用 PageContainer + PageHeader；2) logs/dashboard 补上 max-w-7xl；3) KPI 卡统一使用 KPICard；4) 状态标签统一使用 StatusChip；5) tsc 通过 |
| F-UU-10 | 改造 settings + docs + quickstart 页面 | medium | 1) settings/docs/quickstart 使用 PageContainer size="narrow"（max-w-5xl）；2) docs 修复缺 mx-auto 的 bug；3) settings 的手写 pill tabs 保留或抽取为 PillTabs 组件；4) tsc 通过 |
| F-UU-11 | 改造 mcp-setup 页面 + templates tab 统一（BL-123） | medium | 1) mcp-setup 使用 PageContainer；2) templates 页面的"我的模板/公共模板库"tab 改为与 settings 一致的 pill 样式（BL-123）；3) tsc 通过 |
| F-UU-12 | 字体/heading scale 统一 | medium | 1) tailwind.config 或 globals.css 定义 `.heading-1/2/3` 工具类或 font-size 规范；2) PageHeader 和各处 h1/h2/h3 使用统一规则；3) 消除 font-extrabold / font-black / font-bold 的混乱；4) 更新 design-draft/.../PAGE-LAYOUT.md 文档 |

### 第三阶段：验收（1 条）

| ID | 标题 | 优先级 | 验收 |
|----|------|--------|------|
| F-UU-13 | UI-UNIFY 全量验收 | high | codex 执行：1) 12 个 console 页面视觉一致（标题字号、外层容器宽度、对齐方式）；2) BL-121/122/123 已修复；3) 公共组件单元测试或视觉 smoke 通过；4) 签收报告生成 |

## 执行顺序

1. **第一阶段先完成 F-UU-01 ~ F-UU-06**（建立组件基础设施）
2. **第二阶段并行或串行 F-UU-07 ~ F-UU-12**（改造页面）
3. **F-UU-13 全量验收**

## 验收硬性要求

- 所有 BL-121/122/123 必须在本批次中解决
- Generator 在改造页面时，必须按 test-lifecycle.md 规则同 commit 补 regression test（至少 e2e smoke 测试验证页面正常渲染）
- 所有页面使用 `<PageContainer>` 和 `<PageHeader>`，不允许手写 max-w 和 h1

## 合并的 backlog 条目

本批次覆盖并关闭：
- BL-121 Models 页面"显示全部"按钮无效 → F-UU-08
- BL-122 Actions/Templates 加载闪烁 → F-UU-07
- BL-123 Templates tab 样式不一致 → F-UU-11
