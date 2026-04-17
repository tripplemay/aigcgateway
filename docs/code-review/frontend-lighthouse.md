# Frontend Lighthouse & Core Web Vitals 实测

**测试日期：** 2026-04-17
**测试环境：** Desktop / 本地 dev server (Next.js 14 dev mode, port 3099)
**测试工具：** Chrome DevTools MCP — `lighthouse_audit` + `performance_start_trace`
**CPU/网络节流：** 无（`none`）— 这意味着实测数据比生产环境更乐观

**⚠️ 重要说明：** 本次测试使用 `next dev` 模式，非 `next start`。生产构建的真实性能会好于本地 dev，但核心瓶颈（bundle 体积、render delay）会同比放大。**真实 4G 环境下 LCP 可能为本报告数据的 3-5 倍。**

---

## 总览

| 路由 | Accessibility | Best Practices | SEO | LCP (ms) | CLS | 评估 |
|---|:-:|:-:|:-:|:-:|:-:|---|
| `/login` | **96** | 100 | 100 | **491** | 0.04 | ✅ 良好 |
| `/dashboard` | 94 | 100 | 100 | **603** | **0.11** | ⚠️ CLS 超阈值 |
| `/usage` | 94 | 100 | 100 | **650** | 0.09 | ✅ 尚可，CLS 接近阈值 |
| `/templates` | 95 | 100 | 100 | **571** | 0.02 | ✅ 良好 |

**Core Web Vitals 阈值：**
- LCP：Good ≤ 2500ms，Poor > 4000ms
- CLS：Good ≤ 0.1，Poor > 0.25

### 🔴 关键发现

1. **`/dashboard` CLS = 0.11 — 超过 Good 阈值 (0.1)**
   - 触发时间：加载 335ms 后发生 layout shift
   - 推断原因：异步加载的图表容器、用户头像、balance 卡片在数据返回后尺寸变化
   - **修复：** 为所有异步内容预留固定高度（`min-h-[NNNpx]`）或用 Skeleton 占位；next/image 加 width/height

2. **LCP Render Delay 占比 >90% — 全部 4 个页面**
   - login: TTFB 36ms + **Render 455ms** = 491ms
   - dashboard: TTFB 32ms + **Render 571ms** = 603ms
   - usage: TTFB 29ms + **Render 620ms** = 650ms
   - templates: TTFB 27ms + **Render 544ms** = 571ms
   - **结论：** 服务端响应很快（<40ms），但客户端 JS 解析/执行占大头。与 Bundle 分析发现的 `"use client"` 污染 83.9% + recharts 静态导入完全吻合。

3. **Accessibility 94-95（非 100）**
   - 与 Batch 07 前端审查的"图标按钮缺 aria-label"发现一致
   - 可通过补 aria-label 快速提到 98+

---

## 逐页详情

### `/login`（公共页面）

```
LCP: 491 ms (Good)
  TTFB: 36 ms
  Render delay: 455 ms
CLS: 0.04 (Good)
A11y: 96 / BP: 100 / SEO: 100
```
**Failed audits:** 1（未展开细节）

**评估：** 首屏表现良好，无明显优化点。Render delay 455ms 主要来自 login 页面的 ASCII terminal 动画。

---

### `/dashboard`（最重路由）

```
LCP: 603 ms (Good)
  TTFB: 32 ms
  Render delay: 571 ms  ← 94.7% 时间在客户端渲染
CLS: 0.11 (⚠️ Needs Improvement)
A11y: 94 / BP: 100 / SEO: 100
```
**Failed audits:** 2

**结合 Bundle 数据：**
- 该路由 First Load JS = **281 kB**（见 `frontend-bundle-analysis.md`）
- PERF-1 已确认：recharts 未 dynamic import，直接打进该路由
- CLS 0.11 主要源于：Dashboard 卡片异步加载（余额、用量、最近日志）时，占位容器高度与实际内容不一致

**修复建议：**
1. 懒加载 recharts（P0） — 预计 First Load 降至 ~150 kB，Render delay 降至 ~300ms
2. 所有异步卡片加固定 `min-height` 或 Skeleton 占位
3. next/image 替换 `<img>` 并设置 width/height

---

### `/usage`（第二重路由）

```
LCP: 650 ms (Good)
  TTFB: 29 ms
  Render delay: 620 ms
CLS: 0.09 (接近 Good 上限)
A11y: 94 / BP: 100 / SEO: 100
```
**Failed audits:** 2

**评估：** 同 `/dashboard`，瓶颈在 recharts 静态导入 + `"use client"` 污染。First Load 271 kB。CLS 0.09 已经接近阈值，图表面板的延迟加载可能使其跨线。

---

### `/templates`（页面 size 35 kB 异常大）

```
LCP: 571 ms (Good)
  TTFB: 27 ms
  Render delay: 544 ms
CLS: 0.02 (Excellent)
A11y: 95 / BP: 100 / SEO: 100
```
**Failed audits:** 1

**评估：**
- CLS 优秀（无图表异步加载），但 page size 35 kB 意味着初次加载包含过多业务逻辑
- 需要拆解：`<TemplateLibrary />`、`<TemplateDetail dialog>`、`<MarkdownPreview />` 是否可 dynamic import

---

## 性能 trace 洞察（all insight names 可用）

每个 trace 的 DevTools JSON 都已保存到 `docs/code-review/lighthouse/trace-*.json`：
- `trace-login.json`
- `trace-dashboard.json`
- `trace-usage.json`
- `trace-templates.json`

可在 Chrome DevTools 中 `import trace` 打开，查看火焰图、具体 render delay 成因。Lighthouse 给出的可用 insights 包括：

- **LCPBreakdown** — 可定位 LCP 的 4 个子阶段：TTFB、Resource Load Delay、Resource Load Time、Element Render Delay
- **CLSCulprits** — 直接列出触发 shift 的元素（dashboard 必查）
- **NetworkDependencyTree** — 是否存在请求链式依赖
- **ThirdParties** — 第三方 script 影响（本地 dev 无此问题，生产若加分析埋点需关注）

---

## Lighthouse Reports HTML 位置

每个页面的完整 HTML 报告（含所有 audits 细节）：

- `docs/code-review/lighthouse/report.html`（/login）
- `docs/code-review/lighthouse/dashboard/report.html`
- `docs/code-review/lighthouse/usage/report.html`
- `docs/code-review/lighthouse/templates/report.html`

建议用浏览器打开这些 HTML，查看具体 failed audits 和 opportunity estimations。

---

## 与静态审查的交叉验证

| 静态审发现 | Lighthouse 确认 |
|---|---|
| recharts 未 dynamic import（PERF-1 CRITICAL） | ✅ dashboard/usage LCP Render delay >570ms，明显 JS 解析瓶颈 |
| `"use client"` 占 83.9%（PERF-1 CRITICAL） | ✅ 所有页面 TTFB < 40ms 但 Render delay > 450ms，典型的 server 快/client 慢模式 |
| 异步卡片无占位（未在静态审中明确） | ✅ dashboard CLS 0.11 直接命中 |
| 图标按钮缺 aria-label（Batch 07 HIGH-07） | ✅ A11y 94（非 100） |
| /templates 页面 size 35 kB 异常 | ⚠️ LCP/CLS 正常，但 First Load 199 kB 仍偏高，说明该页面将来的扩展风险 |

---

## 建议的后续实测

当前测试是**本地 dev / desktop / 无节流**。生产数据的完整画像还需要：

1. **移动设备 + Slow 4G 节流** — 实际用户体验基线
2. **生产构建 + CDN** — `next start` + 真实 CDN（brotli/http2）
3. **真实账户数据** — admin 账号的 dashboard 可能比测试账号的更重（300+ channels 表格）
4. **CrUX 数据** — 部署后观察 field data

本次审查已给出静态层面的 bundle 画像和本地 lab data，生产验证建议在 P0 修复（recharts 懒加载、CLS 修复）完成后再做一次 before/after 对比。
