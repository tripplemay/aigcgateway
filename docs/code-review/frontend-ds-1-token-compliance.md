# Frontend Design Token 合规性扫描报告

**扫描日期：** 2026-04-17  
**扫描工具：** Code Reviewer (claude-sonnet-4-6)  
**扫描范围：** 61 个 TSX 文件（`(console)/`、`(auth)/`、`src/components/` 排除 `components/ui/`）

---

## 1. 量化指标表

| 指标 | 数值 | 说明 |
|---|---|---|
| 扫描文件总数 | 61 | |
| 使用 `ds-*` token 的文件数 | 52 | |
| 含非 ds 色系违规的文件数 | 44 | 含任意一条违规 |
| **Token 覆盖率** | **52 / (52+9) ≈ 85%** | 完全未引入 ds-token 且含违规的文件有 9 个 |
| 违规行总计（所有类型） | **590+** | |
| — 类型1：硬编码 hex/rgb | 41 行 | `#xxxxxx`、`rgba()` 等 |
| — 类型2：非 ds Tailwind 色类 | 304 行 | `text-slate-*`、`bg-indigo-*` 等 |
| — 类型3：inline style 颜色 | 0 行 | 无（图表 tooltip style 对象不在 className 内） |
| — 类型4：任意值 px 尺寸 | 245 行 | `text-[10px]`、`h-[300px]` 等 |
| Critical（>20 处/文件）| 3 个文件 | |
| High（5-20 处/文件）| 28 个文件 | |
| Medium（1-4 处/文件） | 13 个文件 | |
| Low（0 处/文件，纯净）| 17 个文件 | |

> **Token 覆盖率计算说明：**  
> 分子 = 52（使用了 ds-token 的文件）  
> 分母 = 52 + 9（从未使用 ds-token 且含违规的文件）= 61  
> 覆盖率 = 52/61 ≈ **85.2%**（有 9 个文件完全没有引入任何 ds-* token）

---

## 2. 违规文件完整清单

按违规数降序排列，标注违规类型及行号示例。

### Critical（>20 处违规）

| # | 文件路径 | 违规数 | 主要违规类型 | 行号示例 |
|---|---|---|---|---|
| 1 | `src/app/(console)/admin/operations/page.tsx` | 33 | 非 ds 色类（bg-rose-、bg-emerald-、bg-violet-、bg-amber-、text-indigo-）| L203、L330、L342、L358 |
| 2 | `src/app/(console)/dashboard/page.tsx` | 24 | 硬编码 hex（PIE_COLORS）+ 非 ds 渐变（from-indigo-700 to-indigo-900）| L62、L167、L225、L318 |
| 3 | `src/app/(console)/admin/logs/page.tsx` | 24 | 非 ds 色类（text-indigo-700、text-slate-*、bg-white）| L75、L133、L197、L276 |

### High（5–20 处违规）

| # | 文件路径 | 违规数 | 主要违规类型 | 行号示例 |
|---|---|---|---|---|
| 4 | `src/components/balance/recharge-dialog.tsx` | 16 | border-slate-、text-slate-、bg-white | L69、L93、L130 |
| 5 | `src/app/(console)/keys/page.tsx` | 15 | border-slate-200/5（带透明度变体）、bg-white | L256、L269、L282 |
| 6 | `src/app/(console)/settings/page.tsx` | 14 | bg-white（输入框底色）、bg-indigo-50 | L333、L352、L362 |
| 7 | `src/app/(console)/logs/[traceId]/page.tsx` | 14 | bg-green-/text-green-/bg-red- 状态色 | L83、L85、L261 |
| 8 | `src/app/(console)/actions/[actionId]/page.tsx` | 14 | border-slate-、bg-white、bg-slate-200 | L191、L290 |
| 9 | `src/app/(console)/admin/providers/page.tsx` | 12 | text-slate-500（表头）、text-slate-600 | L266、L300、L305 |
| 10 | `src/app/(console)/templates/[templateId]/page.tsx` | 11 | text-white（on primary）、bg-slate-300 | L146、L174、L188 |
| 11 | `src/app/(console)/logs/page.tsx` | 11 | text-indigo-700/600、bg-indigo-50、bg-emerald-500 | L123、L198、L204 |
| 12 | `src/app/(console)/balance/page.tsx` | 11 | text-slate-500/400、text-green-600 | L151、L168、L201 |
| 13 | `src/components/auth-terminal.tsx` | 10 | text-white/60、text-white/40 等（on-dark surface）| L47、L104、L170 |
| 14 | `src/app/(console)/templates/new/page.tsx` | 10 | bg-white（卡片）、bg-indigo-900（深色 banner）| L191、L219、L348 |
| 15 | `src/app/(console)/models/page.tsx` | 10 | 硬编码 hex（provider 品牌色 map）| L35–L42、L228 |
| 16 | `src/app/(console)/usage/page.tsx` | 9 | 硬编码 hex（PIE_COLORS）、rgba() tooltip | L63、L73、L77 |
| 17 | `src/app/(console)/actions/new/page.tsx` | 9 | bg-white、bg-slate-300（toggle）、border-gray-300 | L326、L356、L363 |
| 18 | `src/app/(auth)/register/page.tsx` | 9 | text-white/40、text-white/60、text-white/90（终端文本）| L20、L25、L37 |
| 19 | `src/app/(auth)/login/page.tsx` | 9 | text-white/40、text-white/60、text-white/90（终端文本）| L37、L42、L49 |
| 20 | `src/app/(console)/admin/usage/page.tsx` | 8 | 硬编码 hex（PIE_COLORS）、rgba() tooltip | L57、L60、L216 |
| 21 | `src/app/(console)/admin/models/page.tsx` | 8 | bg-white（hover）、bg-slate-50、text-amber-500 | L253、L300、L482 |
| 22 | `src/components/sidebar.tsx` | 6 | 硬编码 hex（`#5443b9`、`#f2f3ff`）、hover:bg-slate-800 | L117、L268 |
| 23 | `src/app/(console)/quickstart/page.tsx` | 6 | bg-indigo-50、text-indigo-600、text-slate-400 | L90、L99、L117 |
| 24 | `src/app/(console)/admin/templates/[id]/page.tsx` | 6 | text-slate-400/600、bg-slate-300（小点） | L224、L293、L399 |
| 25 | `src/components/status-chip.tsx` | 5 | 语义色：bg-green-50/text-green-700、bg-red-50/text-red-700、bg-sky-50/text-sky-700 | L13、L14、L16 |
| 26 | `src/app/(console)/actions/page.tsx` | 5 | border-indigo-500、bg-indigo-500/10、text-indigo-400 | L233 |
| 27 | `src/app/(console)/admin/users/page.tsx` | 3 | text-slate-500/600（表格文本） | L71、L82、L88 |
| 28 | `src/app/(console)/templates/global-library.tsx` | 3 | text-white（on dark）、text-white/70 | L437、L440、L445 |
| 29 | `src/app/(console)/mcp-setup/page.tsx` | 3 | text-white（on primary circle）| L265、L313、L350 |
| 30 | `src/app/(console)/keys/[keyId]/page.tsx` | 3 | bg-white（toggle thumb）、text-white | L218、L355 |
| 31 | `src/app/(console)/admin/model-aliases/page.tsx` | 2 | bg-black/30（overlay） | L423、L474 |

### Medium（1–4 处违规）

| # | 文件路径 | 违規数 | 主要违规类型 | 行号示例 |
|---|---|---|---|---|
| 32 | `src/app/(console)/docs/page.tsx` | 2 | bg-zinc-950、text-zinc-100（代码块）| L16 |
| 33 | `src/app/(console)/admin/health/page.tsx` | 2 | bg-white（hover）、hover:bg-white/50 | L556、L559 |
| 34 | `src/components/cta-banner.tsx` | 3 | 硬编码 hex（`#131b2e`、`#6d5dd3`）| L27、L35 |
| 35 | `src/app/(console)/templates/[templateId]/test/page.tsx` | 4 | border-red-300、bg-red-50、bg-red-100/text-red-700 | L589、L601、L636 |
| 36 | `src/components/table-card.tsx` | 1 | border-slate-200/5 | L30 |
| 37 | `src/components/section-card.tsx` | 1 | border-slate-200/5 | L20 |
| 38 | `src/components/notification-center.tsx` | 1 | text-white（badge 文字） | L164 |
| 39 | `src/components/kpi-card.tsx` | 1 | （待确认，计数器统计命中）| — |
| 40 | `src/components/keys/revoke-key-dialog.tsx` | 1 | text-white（on error）| L68 |
| 41 | `src/app/(console)/templates/template-detail-drawer.tsx` | 1 | text-white（on primary）| L102 |
| 42 | `src/app/(console)/templates/rate-template-dialog.tsx` | 1 | text-white（on primary）| L149 |
| 43 | `src/app/(console)/templates/fork-confirm-dialog.tsx` | 1 | text-white（on primary）| L68 |
| 44 | `src/app/(console)/error.tsx` | 1 | text-white（on primary）| L19 |

### Low / 纯净（0 违规）

以下 17 个文件已完全符合 ds-token 规范：

`src/components/top-app-bar.tsx`、`src/components/table-loader.tsx`、`src/components/search-bar.tsx`、`src/components/pagination.tsx`、`src/components/page-loader.tsx`、`src/components/page-header.tsx`、`src/components/page-container.tsx`、`src/components/keys/create-key-dialog.tsx`、`src/components/intl-provider.tsx`、`src/components/empty-state.tsx`、`src/components/create-project-dialog.tsx`、`src/components/admin/channel-table.tsx`、`src/app/(console)/templates/page.tsx`、`src/app/(console)/layout.tsx`、`src/app/(console)/admin/users/[id]/page.tsx`、`src/app/(console)/admin/templates/page.tsx`、`src/app/(auth)/layout.tsx`

---

## 3. 违规 Top 3 类型统计

| 排名 | 违规类型 | 行数统计 | 典型模式 |
|---|---|---|---|
| **#1** | 非 ds Tailwind 色类 | **304 行** | `text-slate-500`、`text-indigo-700`、`bg-white`、`bg-emerald-50` 等 |
| **#2** | 任意值 px 尺寸 | **245 行** | `text-[10px]`、`h-[300px]`、`text-[11px]`、`h-[400px]` 等 |
| **#3** | 硬编码 hex / rgba() | **41 行** | 图表 `PIE_COLORS` 数组、Recharts `fill="#5443b9"`、tooltip `background: "rgba(...)"` |

---

## 4. 允许列表（合理例外）

以下类别在当前项目中属于可接受例外，**不建议强制修改**：

| 例外类别 | 说明 | 涉及文件 |
|---|---|---|
| Recharts 图表 hex 颜色 | Recharts `fill`/`stroke` 属性只接受字符串颜色，不支持 Tailwind 类。建议将 `PIE_COLORS` 改为引用 CSS 变量（`var(--ds-primary)` 等），但非紧急 | `dashboard/page.tsx`、`usage/page.tsx`、`admin/usage/page.tsx` |
| Provider 品牌色 map | `models/page.tsx` 的 `PROVIDER_COLORS` 定义各服务商官方品牌色（Google Blue `#4285F4` 等），属于三方品牌标识，不应改为 ds-token | `models/page.tsx` L35–42 |
| `text-white` on ds-primary | 当背景为 `bg-ds-primary` 或 `bg-gradient-to-r from-ds-primary` 时，`text-white` 即等价于 `text-ds-on-primary`，视觉上合规。可考虑统一改为 `text-ds-on-primary` 以提升语义性，但不是阻塞项 | 全局，约 30 处 |
| `bg-white` on overlay/toggle | Toggle thumb 的 `bg-white` 在深色容器内是标准 UI 模式；modal overlay 的 `bg-black/30` 无对应 ds-token | `actions/new/page.tsx`、`admin/model-aliases/page.tsx` |
| auth-terminal `text-white/*` | auth 页终端仿真器整体在深色 terminal 背景上渲染，`text-white/60` 等是设计意图。可封装为 `text-ds-terminal-*` token | `auth-terminal.tsx`、`login/page.tsx`、`register/page.tsx` |
| `bg-zinc-950 text-zinc-100`（代码块）| `docs/page.tsx` 的代码展示区是深色代码主题，无对应 ds token | `docs/page.tsx` |

---

## 5. 修复优先级建议

### P0 — 立即修复（影响设计一致性，涉及主流程页面）

1. **`src/components/status-chip.tsx`（L13–17）**  
   全局共享组件，5 处状态色（success/error/warning/info/neutral）全部使用原生 Tailwind 色系。应改为 `bg-ds-status-success-container text-ds-on-status-success`、`bg-ds-error-container text-ds-on-error-container` 等 ds-token。影响范围最广。

2. **`src/components/section-card.tsx`、`src/components/table-card.tsx`（L20、L30）**  
   `border-slate-200/5` 应改为 `border-ds-outline-variant/5`。两个最高频复用的容器组件，修一处改全局。

3. **`src/components/balance/recharge-dialog.tsx`（16 处）**  
   充值核心路径，`border-slate-*`、`text-slate-*` 全部应替换为 `border-ds-outline-variant`、`text-ds-on-surface-variant`。

4. **`src/app/(console)/admin/logs/page.tsx`（24 处）**  
   Admin 核心运营页面，`text-indigo-700` 是品牌主色的别名，统一替换为 `text-ds-primary`；`bg-indigo-50` → `bg-ds-surface-container`；`text-slate-*` → `text-ds-on-surface-variant`。

### P1 — 近期修复（高频非核心页面）

5. **`src/app/(console)/dashboard/page.tsx`（24 处）**  
   `from-indigo-700 to-indigo-900` 促销卡片渐变可接受（see 允许列表），但 `text-slate-*`、图表 hex 应处理。图表 `PIE_COLORS` 建议引用 `var(--color-ds-primary)` 等 CSS 变量。

6. **`src/app/(console)/admin/operations/page.tsx`（33 处）**  
   最大违规文件。操作中心状态图标使用了 `bg-rose-50 text-rose-700`、`bg-emerald-50 text-emerald-700`、`bg-amber-50 text-amber-700`、`bg-violet-50 text-violet-600` 等，应统一改用 ds-status token 或添加新的 ds-status-info / ds-status-neutral token。

7. **`src/app/(console)/settings/page.tsx`（14 处）**  
   `bg-white`（输入框底色）→ `bg-ds-surface-container-lowest`；`bg-indigo-50`（icon container）→ `bg-ds-primary-container/20`。

8. **`src/app/(console)/logs/[traceId]/page.tsx`（14 处）**  
   状态徽章的 `bg-green-100 text-green-700`、`bg-amber-100 text-amber-700`、`bg-red-100 text-red-700` 改为 ds-status token。

### P2 — 规划修复（次要页面 / 低频路径）

9. **`src/app/(console)/models/page.tsx`**：provider 品牌色 map 见允许列表，`text-white`（L228）改为 `text-ds-on-primary`。  
10. **`src/app/(console)/usage/page.tsx`、`src/app/(console)/admin/usage/page.tsx`**：图表 hex 引用 CSS 变量；tooltip rgba 改为 ds-surface-container token。  
11. **`src/components/auth-terminal.tsx`、`login/page.tsx`、`register/page.tsx`**：封装 `text-ds-terminal-*` 使用，现有 token 已定义（`--ds-terminal-bg`、`--ds-terminal-surface`）。  
12. **`src/app/(console)/admin/operations/page.tsx`（CTA 按钮 L358）**：`from-violet-600 to-violet-500` 是设计系统外的紫色渐变，应统一为 `from-ds-primary to-ds-primary-container`。

### Token 缺口（需新增）

| 缺失场景 | 建议新 token | 当前替代 |
|---|---|---|
| 状态图标容器背景（info/neutral）| `--ds-status-info-container`、`--ds-on-status-info` | `bg-blue-50 text-blue-600`（现状） |
| 代码块深色主题 | `--ds-code-bg`、`--ds-code-text` | `bg-zinc-950 text-zinc-100`（现状） |
| Terminal overlay 文字层 | 已有 `--ds-terminal-*` token，但未被 TSX 引用 | `text-white/*` 系列 |

---

_报告由 Code Reviewer agent 生成。扫描方法：正则 grep 全量匹配，人工校验 Top 30 文件行号。_
