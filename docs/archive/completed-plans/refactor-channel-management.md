# Channel Management 页面重构计划

> **设计稿来源**: Stitch 项目 `13523510089051052358` / Screen `c3588db27453405e918b04650ff4adb5`
> **标题**: Channel Management (English - i18n)
> **当前文件**: `src/app/(console)/admin/models/page.tsx`

---

## 1. 现状分析

### 1.1 当前实现

| 项目 | 现状 |
|------|------|
| **路由** | `/admin/models` |
| **数据源** | `GET /api/admin/models-channels` → `ProviderGroup[]` |
| **结构** | Provider → Model → Channel 三层折叠 |
| **样式方案** | 大量 inline style，灰色系 (#e5e4e0, #888780 等) |
| **字体** | Inter (via next/font)，标题未区分字体 |
| **图标** | Unicode 符号 (▲▶) + lucide-react |
| **组件库** | shadcn/ui (Input 组件) |

### 1.2 设计稿要求

| 项目 | 设计稿 |
|------|--------|
| **设计系统** | "The Algorithmic Atelier" |
| **主色** | `#5443b9` (primary)，`#6d5dd3` (primary-container) |
| **字体** | Manrope (标题/数字) + Inter (正文/标签) |
| **图标** | Material Symbols Outlined |
| **布局** | Stats 卡片 → 搜索过滤 → Provider 卡片 → Global Model Matrix 表格 |
| **哲学** | No-Line (无 1px 边框分隔，用 surface 色差分层)，Tonal Layering |

---

## 2. 差异对比

### 2.1 视觉差异

| 区域 | 当前 | 设计稿 |
|------|------|--------|
| **页面标题** | `fontSize:20, fontWeight:500` 单行 | 大标题 (text-3xl Manrope bold) + 描述副标题 |
| **统计卡片** | 无 | 3 列 grid: Routing Efficiency / Provider Health / Pricing Drift |
| **搜索栏** | inline input + 文字按钮 | 独立搜索输入 + Filter 按钮 + Sort 按钮 + pill tags |
| **Provider 卡** | 32px 色块缩写 + 文字展开 | Provider logo/图标 + 模型数 + 健康标签 (L1 Healthy) |
| **Channel 详情** | 2 列 grid 卡片 (cost/sell/latency/success) | Cluster 行布局 (ID + Level badge + Weight + 操作按钮) |
| **底部表格** | 无 | Global Model Matrix — 扁平表格，含分页 |
| **状态指示** | 7px 圆点 | "Dot + Label" chip (如 `L1 Healthy`) |
| **浮动元素** | 无 | Glassmorphism (backdrop-blur: 12px) |

### 2.2 色彩系统映射

设计稿使用 Material Design 3 色彩系统，需要桥接到项目已有的 CSS 变量：

| 设计稿 Token | 值 | 项目对应 |
|-------------|-----|---------|
| `--primary` | `#5443b9` | 新增，或复用 `--brand` (#6D5DD3 相近) |
| `--primary-container` | `#6d5dd3` | `--brand` |
| `--on-primary` | `#ffffff` | — |
| `--surface` | `#faf8ff` | 调整现有 `--surface` (#f8f7f5) |
| `--surface-container` | `#eaedff` | 新增 |
| `--surface-container-high` | `#e2e7ff` | 新增 |
| `--on-surface` | `#131b2e` | 接近 `--text-primary` (#2C2C2A) |
| `--on-surface-variant` | `#474553` | 接近 `--text-secondary` (#5F5E5A) |
| `--outline-variant` | `#c9c4d5` | 接近 `--border-custom` (#e5e4e0) |
| `--error` | `#ba1a1a` | 现有 `--error-text` (#791F1F) 偏暗，需新增 |

---

## 3. 重构方案

### 3.1 不变的部分

- **路由** `/admin/models` 不变
- **API** `/api/admin/models-channels` 接口和返回结构不变
- **数据类型** `ProviderGroup` / `ModelEntry` / `ChannelEntry` 不变
- **业务逻辑** priority 编辑、sell price 编辑、sync 模型同步全部保留
- **i18n** 继续使用 `useTranslations("adminModels")`

### 3.2 依赖安装

```bash
pnpm add material-symbols          # Material Symbols Outlined 图标字体
pnpm add @fontsource/manrope       # Manrope 标题字体
```

> **说明**: Inter 已通过 next/font 加载，无需额外安装。
> lucide-react 保留（其他页面在用），本页面改用 Material Symbols。

### 3.3 样式基础设施

#### 3.3.1 注册 Manrope 字体

在 `src/app/layout.tsx` 中添加 Manrope：

```tsx
import { Inter, Manrope } from "next/font/google";
const manrope = Manrope({ subsets: ["latin"], variable: "--font-heading" });
// className: `${inter.variable} ${manrope.variable}`
```

#### 3.3.2 导入 Material Symbols

在 `src/app/globals.css` 顶部添加：

```css
@import "material-symbols/outlined.css";
```

#### 3.3.3 扩展 CSS 变量

在 `:root` 中新增设计系统 surface 分层色：

```css
/* Algorithmic Atelier surface layers */
--ds-primary: #5443b9;
--ds-primary-container: #6d5dd3;
--ds-on-primary: #ffffff;
--ds-surface: #faf8ff;
--ds-surface-container: #eaedff;
--ds-surface-container-high: #e2e7ff;
--ds-surface-container-low: #f2f3ff;
--ds-surface-container-lowest: #ffffff;
--ds-on-surface: #131b2e;
--ds-on-surface-variant: #474553;
--ds-outline: #787584;
--ds-outline-variant: #c9c4d5;
--ds-error: #ba1a1a;
```

> 使用 `--ds-` 前缀避免与 shadcn 现有变量冲突，仅在本页面使用。

### 3.4 页面结构重构

将 `page.tsx` 从单一组件拆分为清晰的区块：

```
page.tsx
├── PageHeader         — 标题 + 描述 + "Create New Channel" 按钮
├── StatsCards         — 3 列统计卡片 (从现有数据聚合)
├── SearchFilterBar    — 搜索 + Filter + Sort + Pill tags
├── ProviderCardList   — Provider 分组卡片 (可展开)
│   ├── ProviderCard
│   │   ├── ProviderHeader   — logo/缩写 + 名称 + 模型数 + 健康标签
│   │   └── ModelList
│   │       ├── ModelRow     — 模型名 + modality badge + context + price
│   │       └── ChannelClusterList
│   │           └── ChannelCluster  — ID + Level badge + 指标 + 操作
├── GlobalModelMatrix  — 扁平表格 (新增)
│   └── Pagination
└── SyncFooter         — 状态图例 + 同步信息
```

### 3.5 数据映射策略

设计稿中有些概念在当前数据模型中不存在，需要做映射：

| 设计稿概念 | 映射策略 |
|-----------|---------|
| Routing Efficiency | 从所有 channels 的 `successRate` 加权平均计算 |
| Provider Health (94/96) | `activeChannels / totalChannels` |
| Pricing Drift | 暂用占位，后续接入真实数据 |
| L1/L2/L3 Level | 按 `channel.priority` 映射：1=L1, 2=L2, 3+=L3 |
| Cluster Weight | 按 priority 反比计算，或用 channel 数平均 |
| Provider Logo | 复用现有 `PROVIDER_COLORS` + 缩写色块方案 |
| Global Model Matrix | 将所有 ProviderGroup → flatMap → channels 展平 |

### 3.6 样式迁移策略

| 项目 | 方案 |
|------|------|
| 去除 inline style | 全部改用 Tailwind class + CSS 变量 |
| 卡片容器 | `bg-[var(--ds-surface-container-high)] rounded-xl` (无边框，用色差分层) |
| 标题字体 | `font-[var(--font-heading)]` 或自定义 `font-heading` utility |
| 图标 | `<span className="material-symbols-outlined">icon_name</span>` |
| 按钮 | 复用 shadcn Button variant，主色改为 `--ds-primary` gradient |
| 表格 | 复用 shadcn Table 组件，无水平分隔线，hover 用 surface-container 背景 |

### 3.7 i18n 补充

需要在 `en.json` 和 `zh-CN.json` 的 `adminModels` namespace 下新增：

```json
{
  "pageDescription": "Configure orchestration routes and health rules for model providers.",
  "createChannel": "Create New Channel",
  "routingEfficiency": "Routing Efficiency",
  "providerHealth": "Provider Health",
  "pricingDrift": "Pricing Drift",
  "filter": "Filter",
  "sortBy": "Priority",
  "globalModelMatrix": "Global Model Matrix",
  "modelIdentifier": "Model Identifier",
  "cluster": "Cluster",
  "availability": "Availability",
  "tokenCost": "Token Cost (1M)",
  "lastPing": "Last Ping",
  "showingEntries": "Showing {from} of {total} entries",
  "previous": "Previous",
  "next": "Next",
  "weight": "Weight",
  "edit": "Edit",
  "retry": "Retry",
  "troubleshoot": "Troubleshoot"
}
```

---

## 4. 实施步骤

### Phase 1: 基础设施 (不影响现有页面)

1. `pnpm add material-symbols @fontsource/manrope`
2. 注册 Manrope 字体到 layout.tsx
3. globals.css 导入 material-symbols + 新增 `--ds-*` CSS 变量
4. 补充 i18n keys

### Phase 2: 页面重构

5. 重写 PageHeader — 大标题 + 描述 + CTA 按钮
6. 新增 StatsCards — 3 列统计卡片 (从现有数据聚合)
7. 重构 SearchFilterBar — 设计稿样式的搜索+过滤
8. 重构 ProviderCardList — 设计稿卡片样式，保留展开/折叠逻辑
9. 重构 ChannelCluster — priority→Level 映射，Cluster 行布局
10. 新增 GlobalModelMatrix — 扁平表格 + 分页

### Phase 3: 收尾

11. 去除所有残留 inline style
12. 验证 i18n 中英文切换
13. 验证深色模式（如果 `--ds-*` 变量需要 dark variant）
14. 验证数据交互（priority 编辑、sell price 编辑、sync）

---

## 5. 风险 & 注意事项

| 风险 | 缓解 |
|------|------|
| Material Symbols 字体文件较大 (~300KB) | 可后续用 `material-symbols/outlined.woff2` 子集优化 |
| 设计稿部分概念无真实数据 (Routing Efficiency, Pricing Drift) | Phase 2 先用计算值/占位，后续 API 扩展 |
| 与其他页面样式冲突 | `--ds-*` 前缀隔离，仅本页面引用 |
| 深色模式适配 | Phase 3 统一处理，不阻塞主流程 |
| 设计稿的 sidebar/header 与项目全局 layout 不同 | 只重构 main content 区域，不动全局 layout |
