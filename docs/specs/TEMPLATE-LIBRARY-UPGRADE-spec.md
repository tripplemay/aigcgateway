# TEMPLATE-LIBRARY-UPGRADE 批次规格文档

**批次代号：** TEMPLATE-LIBRARY-UPGRADE
**目标：** 公共模板库体验升级——分类筛选 + 评分系统 + 多维排序
**规模：** 7 个 generator + 1 个 codex 验收 = 8 条

## 需求汇总

| 决策 | 结论 |
|------|------|
| 分类方式 | 固定列表，管理员通过 SystemConfig 预置 |
| 分类存储 | SystemConfig `TEMPLATE_CATEGORIES` JSON（`[{id, label, labelEn, icon}]`），Template 表加 `category String?` |
| icon | Material Symbols 图标名（code_review / edit_note / translate / analytics 等） |
| qualityScore | 激活：用户 fork 后可打分（1-5 星），公共模板卡片展示平均分 + 评分人数 |
| 排序 | 4 种：推荐（综合分）/ 热门（fork 数）/ 最高评分 / 最新 |

## 设计

### 分类数据结构（SystemConfig）

Key: `TEMPLATE_CATEGORIES`
Value:
```json
[
  { "id": "dev-review", "label": "开发审查", "labelEn": "Dev Review", "icon": "code_review" },
  { "id": "writing", "label": "内容创作", "labelEn": "Writing", "icon": "edit_note" },
  { "id": "translation", "label": "翻译", "labelEn": "Translation", "icon": "translate" },
  { "id": "analysis", "label": "数据分析", "labelEn": "Analysis", "icon": "analytics" },
  { "id": "customer-service", "label": "客服", "labelEn": "Customer Service", "icon": "support_agent" },
  { "id": "other", "label": "其他", "labelEn": "Other", "icon": "category" }
]
```

### 评分系统

- 新增 `TemplateRating` 表：userId + templateId + score(1-5) + createdAt（UNIQUE userId+templateId）
- Template 表新增 `ratingCount Int @default(0)` + `ratingSum Int @default(0)`
- `qualityScore` 改为计算字段：`ratingSum / ratingCount`（展示时计算，不存冗余）
- 或保留 `qualityScore` 作为缓存字段，每次新评分时更新

### 排序算法

| 排序名 | API 参数 | 逻辑 |
|--------|---------|------|
| 推荐 | `sort_by=recommended` | `qualityScore * 0.7 + log2(forkCount + 1) * 0.3`，NULL 评分按 0 处理 |
| 热门 | `sort_by=popular` | `forkCount DESC` |
| 最高评分 | `sort_by=top_rated` | `qualityScore DESC NULLS LAST`（无评分排最后） |
| 最新 | `sort_by=latest` | `updatedAt DESC`（当前默认） |

### 前端布局

```
┌─ 公共模板库 ──────────────────────────────────────────────────┐
│                                                               │
│  🔍 搜索模板...                    排序：[推荐 ▾]             │
│                                                               │
│  [全部] [📋 开发审查] [✏️ 内容创作] [🌐 翻译] [📊 数据分析]   │
│                                                               │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ 📋 标准开发需求审查模板           3步 · sequential        │ │
│  │ 结构化解析→风险评估→验收计划       ★ 4.5 (12) · Fork 15  │ │
│  │                                          [预览] [Fork]   │ │
│  └──────────────────────────────────────────────────────────┘ │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ 📋 标准开发需求审查模板（严审版） 5步 · sequential        │ │
│  │ 5步深度审查...                    ★ 4.8 (8)  · Fork 8   │ │
│  │                                          [预览] [Fork]   │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                               │
│  Fork 成功后弹出评分弹窗：                                     │
│  ┌─────────────────────────────┐                              │
│  │ 为这个模板打分               │                              │
│  │ ★ ★ ★ ★ ☆  (点击选分)      │                              │
│  │        [跳过]  [提交]        │                              │
│  └─────────────────────────────┘                              │
└───────────────────────────────────────────────────────────────┘
```

## Features

| ID | 标题 | 优先级 | 验收 |
|----|------|--------|------|
| F-TL-01 | Schema：Template 加 category + TemplateRating 表 + migration | high | 1) Template 表新增 `category String?` 字段（migration）；2) 新增 `template_ratings` 表（id/userId/templateId/score(1-5)/createdAt + UNIQUE userId+templateId）；3) Template 表新增 `ratingCount Int @default(0)` + `ratingSum Int @default(0)` 用于缓存平均分；4) 现有 3 个公共模板补 `category = 'dev-review'`；5) tsc 通过 |
| F-TL-02 | SystemConfig 预置分类 + 管理端分类管理卡片 | high | 1) seed 或 migration 写入 SystemConfig key=`TEMPLATE_CATEGORIES` 包含初始 6 个分类；2) admin/operations 页面增加"模板分类管理"SectionCard，列出所有分类（id/label/labelEn/icon），支持增删改；3) 修改后写入 SystemConfig；4) i18n；5) tsc 通过 |
| F-TL-03 | 管理端发布公共模板时选择分类 | medium | 1) admin/templates 页面的"设为公开"操作增加分类下拉选择（从 SystemConfig 读取分类列表）；2) 选择后写入 Template.category；3) 未选择分类时默认 'other'；4) i18n；5) tsc 通过 |
| F-TL-04 | 评分 API：POST /api/templates/[id]/rate + 评分缓存更新 | high | 1) POST /api/templates/[id]/rate body={score:1-5} — upsert TemplateRating（同用户同模板只能一个评分，可修改）；2) 写入后更新 Template.ratingCount 和 ratingSum（原子操作）；3) 只能对 isPublic=true 的模板打分；4) 返回 {averageScore, ratingCount}；5) MCP 无需对应工具（评分走控制台）；6) tsc 通过 |
| F-TL-05 | API/MCP：list_public_templates 增加 category 过滤 + sort_by + 评分字段 | high | 1) list_public_templates 新增可选参数 `category`（筛选）和 `sort_by`（recommended/popular/top_rated/latest，默认 recommended）；2) 返回体每个模板增加 `category` / `categoryIcon` / `averageScore` / `ratingCount` 字段；3) 推荐排序算法：`qualityScore * 0.7 + log2(forkCount + 1) * 0.3`；4) REST API `/api/public-templates` 同步支持；5) MCP tool schema 更新；6) tsc 通过 |
| F-TL-06 | 前端：global-library.tsx 分类 Tab + 排序 + 评分展示 | high | 1) 顶部从 SystemConfig 动态读取分类列表渲染为 Tab 按钮（"全部" + 各分类，含 icon）；2) 点击分类筛选模板列表；3) 搜索栏旁增加排序下拉（推荐/热门/最高评分/最新）；4) 模板卡片展示 ★ averageScore (ratingCount) + Fork 数；5) 无评分时不显示星星（或显示"暂无评分"）；6) 使用 SectionCard / StatusChip / Button gradient-primary 公共组件；7) i18n 中英文；8) tsc 通过 |
| F-TL-07 | 前端：Fork 后评分弹窗 | medium | 1) fork_public_template 成功后弹出评分 Dialog；2) 5 颗星可点击选分（hover 预览效果）；3) "跳过"按钮关闭不提交；4) "提交"按钮调 POST /api/templates/[id]/rate；5) 已评过的模板再次 fork 时不弹窗（或显示"你已评过 X 分，是否修改"）；6) i18n；7) tsc 通过 |
| F-TL-08 | TEMPLATE-LIBRARY-UPGRADE 全量验收 | high | codex 执行：1) SystemConfig 分类列表可 CRUD 且前端动态刷新；2) 公共模板带 category 标签展示；3) 分类 Tab 筛选生效；4) 4 种排序均可切换且结果正确；5) Fork 后弹出评分弹窗，提交后 averageScore 更新；6) 同用户再次评分覆盖旧分；7) MCP list_public_templates 的 category + sort_by 参数生效；8) 签收报告生成 |

## 推荐执行顺序

1. **F-TL-01**（schema 先行）
2. **F-TL-02**（SystemConfig + 管理端分类管理）
3. **F-TL-04**（评分 API）
4. **F-TL-05**（list_public_templates 改造）
5. **F-TL-03**（管理端发布时选分类）
6. **F-TL-06**（前端主体改造）
7. **F-TL-07**（评分弹窗）
8. **F-TL-08**（验收）

## 关键约束

- 分类列表从 SystemConfig 动态读取，前端不硬编码
- 评分 upsert（同用户同模板只存一条，可更新）
- 推荐排序的 qualityScore 使用 ratingSum/ratingCount 计算，NULL 按 0 处理
- 所有新 UI 使用公共组件（SectionCard / StatusChip / Button gradient-primary / PageHeader）
- i18n 中英文双语（分类 label 和 labelEn 按 locale 切换）
