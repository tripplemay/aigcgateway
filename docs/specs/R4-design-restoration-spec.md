# R4 — 设计稿结构还原（6 页面）

## 目标

将 6 个未按 `design-draft/*/code.html` 做代码级还原的页面，重构为与设计稿 1:1 对齐的布局结构。仅涉及前端 TSX，不涉及 API / Schema / Migration。

## 范围

| # | 页面 | 设计稿 | 偏差等级 | 工作量 |
|---|------|--------|----------|--------|
| 01 | Admin Model Whitelist | admin-model-whitelist/ | MISMATCH | 重度 |
| 02 | Admin Model Aliases | admin-model-aliases/ | MISMATCH | 重度 |
| 03 | Admin Model Capabilities | admin-model-capabilities/ | MISMATCH | 重度 |
| 04 | Admin User Detail | admin-user-detail/ | MISMATCH | 重度 |
| 05 | Admin Templates | admin-templates/ | PARTIAL | 中度 |
| 06 | MCP Setup | mcp-setup/ | PARTIAL | 中度 |

## 逐页差异与还原要求

### F-R4-01: Admin Model Whitelist

**当前问题：**
- 缺 Provider 列（设计稿 9 列，实现 7 列）
- 缺 Price 双行显示（sell + cost）
- Stats 卡片：第三卡片用 orange 硬编码，应为 tertiary-fixed；无 hover scale 动效
- 搜索栏缺 search icon、缺 filter_list 按钮
- 分页缺 `...` 省略号

**还原目标：**
1. 表格恢复 9 列：Enable / Model Name / Provider / Modality / Context / Price(Sell/Cost) / Channels / Health / Actions
2. Provider 列显示 providerName 文字（无 logo，DESIGN.md 已标注 fabricated）
3. Price 列双行：sell price 上、cost price 下（cost 数据来自 channel.costPrice）
4. Stats 第三卡片 icon 背景改为 `bg-ds-tertiary-fixed`
5. 搜索栏内嵌 search icon，追加 filter_list 图标按钮
6. 分页加 `...` 省略号逻辑

### F-R4-02: Admin Model Aliases

**当前问题：**
- Classified 区域用单列堆叠 + `<code>` 块，设计稿用 3 列卡片网格 + 圆角 pill 标签
- 缺 more_vert 菜单、缺计数徽章、缺 question_mark icon、缺 "Scan for new" 按钮

**还原目标：**
1. Classified Models 改为 `grid-cols-1 md:grid-cols-2 lg:grid-cols-3` 卡片网格
2. 每卡：icon + model name + alias 计数 + 圆角 pill 标签（hover 变 error-container + × 关闭）
3. 标题栏加计数徽章（"N CANONICAL IDENTIFIERS"）
4. Unclassified 表格行首加 question_mark icon
5. 保留现有功能逻辑（addAlias / deleteAlias / mergeModel），仅重构视觉

### F-R4-03: Admin Model Capabilities

**当前问题：**
- 用 `<table>` 而非 CSS grid-cols-12 布局
- 筛选栏缺 border-bottom 强调、缺 "Bulk Update" 按钮、缺 "Last sync" 指示
- 底部完全缺失 3 个 insight 卡片
- TEXT 模型最后列应显示描述文本而非 "—"

**还原目标：**
1. 表格改为 `grid-cols-12`（3+1+5+3）布局
2. 筛选栏：select 加 border-b-2 border-primary 强调 + "Bulk Update" 按钮（功能可 noop）+ "Last sync" 时间戳
3. 底部追加 3 个 insight 卡片（Capability Utilization / Enabled Functions / Safety Sync），数据可从现有 models 列表派生
4. 图片模型 capabilities 区域加 `opacity-50 cursor-not-allowed`
5. size 标签改用 `bg-ds-surface-container-high` 圆角标签 + close 按钮

### F-R4-04: Admin User Detail

**当前问题：**
- 用 2×2 info grid 而非 hero profile 布局
- 缺余额交易历史表
- 缺 Danger Zone（suspend/delete）
- 项目用表格而非卡片

**还原目标：**
1. 顶部 hero：左 4 col profile（头像 + 名称 + 角色 + 注册日期）+ 右 8 col stats 卡片行
2. 中部：左 Projects 列表 + 右 Balance History 交易表（数据来自 `/api/admin/users/:id` 现有字段）
3. 底部 Danger Zone：Suspend / Delete 按钮（可 disabled，功能后续实现）
4. Balance History 若无 API 支持，显示空状态占位

### F-R4-05: Admin Templates

**当前问题：**
- 用表格而非卡片网格
- 缺精选大卡 + 质量评分徽章

**还原目标：**
1. 表格改为 `grid-cols-1 md:grid-cols-2 lg:grid-cols-3` 卡片网格
2. 每卡显示：名称 / 步骤数 / 执行模式 / 描述 / 更新时间 / 操作
3. 若有 isPublic + qualityScore，显示对应徽章
4. 保留搜索和 visibility 筛选

### F-R4-06: MCP Setup

**当前问题：**
- 单列垂直布局，设计稿为 5/7 bento grid
- 缺底部 3 列 feature showcase

**还原目标：**
1. 主区域改为 `grid-cols-12`：左 5 col（API key 选择 + 工具徽章列表）+ 右 7 col（客户端选择 + config 代码块）
2. 底部追加 3 列 feature showcase 卡片（Latency Optimization / E2E Encryption / Global Gateway）— 纯展示性内容
3. 保留现有 10 客户端选择逻辑

## 通用约定

- 所有 token 使用 `ds-*` 前缀（不引入 shadcn 旧 token）
- 所有用户可见文本走 i18n（`t()`）
- 不修改 API / Schema / Migration
- 每完成一个页面立即 commit + 更新 features.json
- tsc + lint 通过后才标记 done

## 验收标准（通用）

1. 每页布局结构与 `design-draft/*/code.html` 一致（列数、网格比例、区块顺序）
2. DS token 正确（零 shadcn 旧 token、零硬编码颜色）
3. i18n 完整（切换中文无英文残留）
4. `npx tsc --noEmit` 零错误
5. 现有功能不回退（toggle/CRUD/搜索/分页等）

## 不包含

- 新 API 端点 / 数据库迁移
- Admin Models (Channels) 页面（已确认 MATCH）
- 已通过 R3C 验收的页面
