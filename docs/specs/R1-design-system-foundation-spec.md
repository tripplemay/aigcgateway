# R1 — 设计系统基础对齐 + Dashboard 试点还原

## 背景与目标

AIGC Gateway 在 Stitch 上完成了完整的 UI 原型设计（Layout Shell + 各页面 Full Redesign），包含一套名为 "The Algorithmic Atelier" 的设计系统（DESIGN.md）。但当前代码实现与设计系统存在系统性偏差：

1. **基础组件不对齐**：Button（无渐变）、Input（全边框而非底线）、Card（有 ring 边框）、Dialog（Glassmorphism 不足）、Table（行间有分割线）均未遵循设计系统
2. **Sidebar 使用硬编码颜色**（bg-slate-50）而非 design token
3. **~80 处 No-Line 规则违规**：border-b、divide-y 大量用于分隔
4. **页面级重复模式未抽取**：SearchBar（7 处）、Pagination（8 处）、数据请求模式不统一

本批次目标：**修好地基**。将基础组件对齐设计系统，抽取公共组件和 hook，并用 Dashboard 页面作为试点验证。完成后后续页面重构可直接使用组件，工作量大幅下降。

## 功能范围

### P0 — 基础组件对齐设计系统

| 组件 | 当前问题 | 目标 |
|---|---|---|
| Button | 纯色 bg-primary，rounded-lg | primary 变体改渐变 from-ds-primary to-ds-primary-container，圆角保持当前值（与设计稿整体一致） |
| Input | 全边框 border-input，bg-transparent | 底线风格 border-b-2，bg-ds-surface-container-low，focus 时底线变 primary |
| Card | ring-1 ring-foreground/10 | 去掉 ring，用 tonal layering（背景色差异制造层级） |
| Dialog | backdrop-blur-xs（太弱） | backdrop-blur-lg + bg-black/20，Content 去掉 ring，加 shadow |
| Table | TableHeader 有 border-b，TableRow 有 box-shadow 模拟分割线 | 去掉行间分割线，hover 用 bg-ds-surface-container-high/30 |

### P0 — Layout Shell 对齐

| 组件 | 当前问题 | 目标 |
|---|---|---|
| Sidebar | bg-slate-50 硬编码，border-l-4 作 active 指示 | bg-ds-surface-container-low，active 改为 3px accent pill（before 伪元素），去掉 border |
| TopAppBar | border-b border-slate-200/15 | 去掉 border-b，用 shadow/tonal shift 代替 |
| Layout | 基本正确 | 微调确保与 Layout Shell code.html 一致 |

### P1 — 公共组件抽取

| 组件 | 来源 | 规格 |
|---|---|---|
| SearchBar | 7+ 页面重复 | props: placeholder, value, onChange, className；Material icon search，rounded-full，bg-ds-surface-container-low |
| Pagination | 8 页面重复（两种变体） | props: page, totalPages, onPageChange, total?, pageSize?；支持简单模式（Previous/Next）和完整模式（页码） |
| useAsyncData hook | 统一数据请求 | 封装 apiFetch + loading + error 三件套，返回 { data, loading, error, refetch } |

### P1 — Dashboard 试点还原

用新组件重写 Dashboard 页面，对照 `design-draft/Dashboard (Full Redesign) v2/code.html` 验证视觉一致性。Dashboard 当前实现已较接近设计稿，主要调整：
- 统计卡片去掉 border，用 tonal layering
- 表格去掉 divide-y
- 确认所有颜色使用 design token

## 关键设计决策

1. **Button 渐变仅限 default variant**：outline/ghost/destructive 等保持不变
2. **Input 改底线风格是破坏性变更**：所有使用 Input 的页面外观都会变，但后续页面重构本来就要改，不如一步到位
3. **Card 去 ring 后需要检查所有使用处**：确保在浅色背景上视觉层级仍清晰（依赖 tonal layering）
4. **Table 组件当前未被页面使用**：页面都是内联 table。本批次先修好 Table 组件，不要求所有页面立即切换（那是后续批次的事）。但 Dashboard 的表格要用新样式
5. **useAsyncData 是新 hook**：本批次仅 Dashboard 使用，后续批次逐步迁移其他页面
6. **SearchBar / Pagination 本批次创建组件**：Dashboard 不使用这两个组件（Dashboard 没有搜索和分页），但先建好供后续批次使用

## 参考文档

- 设计系统：`design-draft/Layout Shell - AIGC Gateway/DESIGN.md`
- Layout Shell 原型：`design-draft/Layout Shell - AIGC Gateway/code.html`
- Dashboard 原型：`design-draft/Dashboard (Full Redesign) v2/code.html`
