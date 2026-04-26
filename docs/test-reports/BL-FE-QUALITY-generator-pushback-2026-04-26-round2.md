# BL-FE-QUALITY Generator Push-back（fix_round 2）

- 批次：`BL-FE-QUALITY`
- 功能：`F-FQ-05`
- 提交方：Generator / Kimi（cli）
- 对象：Reviewer round3 / round4 验收报告
- 日期：2026-04-26
- 性质：**Push-back**（不修产品代码，请求 Evaluator 用正确方法重验）
- 触发报告：
  - `docs/test-reports/BL-FE-QUALITY-reverifying-failed-2026-04-26-round3.md`
  - `docs/test-reports/BL-FE-QUALITY-reverifying-failed-2026-04-26-round4.md`

## 1. 结论

**round3 / round4 报告中所有 4 项 FAIL（/zh/dashboard 404、_next 资源 400/404、Lighthouse A11y=0、TC10/11/12 动态 i18n 阻断）均为同一根因：Evaluator 使用了项目中不存在的 `/zh/...` URL 前缀路径。**

项目代码层面无任何路由 / 静态资源缺陷，前一轮 fix_round 1（commit `b62a9ff` A11y + DS grep）已正确闭环 spec acceptance；reverify 失败是验收方法学回归，不是 Generator 实现差错。

## 2. 项目 i18n 实现事实（带文件证据）

### 2.1 `src/app/` 目录结构 — 无 `[locale]` 段

```
src/app/
├── (auth)/             # route group，无 locale 段
├── (console)/
│   ├── dashboard/page.tsx
│   ├── admin/models/page.tsx
│   ├── admin/logs/page.tsx
│   ├── admin/operations/page.tsx
│   ├── error.tsx
│   └── ...
├── api/
├── layout.tsx
└── page.tsx
```

`(auth)` `(console)` 是 Next.js route group（带括号），不构成 URL segment；线上真实 URL 永远是 `/dashboard` `/admin/models` `/error-test` 等无前缀路径。

### 2.2 `src/middleware.ts` matcher — 无任何 locale 路径

```ts
export const config = {
  matcher: [
    "/v1/:path*",
    "/mcp",
    "/dashboard/:path*",
    "/keys/:path*",
    "/actions/:path*",
    "/templates/:path*",
    "/models/:path*",
    "/logs/:path*",
    "/usage/:path*",
    "/balance/:path*",
    "/quickstart/:path*",
    "/mcp-setup/:path*",
    "/settings/:path*",
    "/admin/:path*",
  ],
};
```

middleware 不识别 `/zh/*` `/en/*`，没有 next-intl 的 `createMiddleware`。

### 2.3 `next.config.mjs` — 无 next-intl plugin

```js
import withBundleAnalyzer from "@next/bundle-analyzer";
const nextConfig = {
  output: "standalone",
  poweredByHeader: false,
  images: { remotePatterns: [] },
  experimental: { instrumentationHook: true },
};
export default analyzer(nextConfig);
```

无 `createNextIntlPlugin` 包裹。

### 2.4 真实 i18n 实现 — 客户端 localStorage

`src/components/intl-provider.tsx`：

```tsx
"use client";
function IntlInner({ children }) {
  const { locale } = useLocale();           // 来自客户端 hook
  const [messages, setMessages] = useState<Messages | null>(null);
  useEffect(() => {
    import(`@/messages/${locale}.json`)     // 动态 import 当前 locale messages
      .then(mod => setMessages(mod.default));
  }, [locale]);
  return <NextIntlClientProvider locale={locale} messages={messages}>{children}</NextIntlClientProvider>;
}
```

`src/hooks/use-locale.tsx`：

```tsx
"use client";
const STORAGE_KEY = "aigc-locale";
function detectLocale(): Locale {
  if (typeof window === "undefined") return "en";
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === "en" || saved === "zh-CN") return saved;
  const browserLang = navigator.language;
  return browserLang.startsWith("zh") ? "zh-CN" : "en";
}
```

**结论：** 项目 i18n = `localStorage["aigc-locale"]` + 客户端动态 import messages。**URL 永远不带 locale 前缀。** 切换语言通过页面右上角 Locale Toggle UI（或直接 `localStorage.setItem("aigc-locale","zh-CN")` 后刷新）。

## 3. round3/round4 失败的真因

| Reviewer 观察 | 真因 |
|---|---|
| `/zh/dashboard` HTTP 404，RSC initialTree 命中 `/_not-found` | 该路由从未存在；Next.js 对未注册路径正确返回 404 + `_not-found` 页面 |
| `_next/static/chunks/app/layout-*.js` 404 | 这是 `_not-found` 页面引用的 layout chunk 路径，与 dashboard layout 不同；不是中间件拦截或资源丢失 |
| `_next/static/chunks/*.js` 多个 400 | 同上副作用，且部分 `dev` 模式 chunk 在 404 路由上下文里被请求时可能返回 400 |
| Lighthouse A11y = 0 | curl 的就是 404 错误页，没有可验收对象 |
| TC10/11/12 动态 i18n 阻断 | 所有 `/zh/...` 都 404，自然无法验证文案 |

**反证：** commit `b62a9ff`（fix_round 1）只修了 `src/components/top-app-bar.tsx`、`src/app/(console)/admin/logs/page.tsx`、`src/app/(console)/admin/operations/page.tsx` 三个文件，全部是色类与 aria-label 文本替换，**根本没有触碰任何路由 / middleware / next.config / i18n 文件**。无任何代码路径会让一个本来 200 的 URL 变成 404。

## 4. 历史证据 — 04-19 signoff 也是无前缀验收

`docs/test-reports/bl-fe-quality-reverifying-local-2026-04-19-round8.md` 中：

- TC10 验收用的 URL：`/error-test`（无前缀）
- TC11 验收用的 URL：`/admin/models`（无前缀，配合客户端切 zh-CN）
- TC12 验收用的 URL：`/notification-center` 入口（无前缀，同上）

最终 `docs/test-reports/BL-FE-QUALITY-signoff-2026-04-19.md` 由 Reviewer 自己签字 PASS，commit `994a665`。

也就是说：**同一个 reviewer / 同一份 spec / 同一个 i18n 实现，04-19 用无前缀 URL 通过验收，04-26 round3 起换成了不存在的 `/zh/...` URL 一直 fail**。是 04-26 的验收方法学回归。

## 5. 正确的验收方法（请 Reviewer round5 采用）

### 5.1 静态构建/类型/测试/PATCH（已 PASS，沿用）

`build` / `tsc --noEmit` / `vitest run`（414 tests）/ DS 静态 grep / PATCH invalid JSON 400 — round4 报告已确认全 PASS，无需复验。

### 5.2 Lighthouse A11y（F-FQ-05-09）

正确 URL：`http://localhost:3099/dashboard`（无前缀），且需先在浏览器 / lighthouse run 中预置：

```bash
# 命令行：lighthouse 需要登录态 cookie + localStorage，建议浏览器 snapshot
# 浏览器：登录后 DevTools Console 执行 localStorage.setItem('aigc-locale','en'); location.reload();
# 然后 npx lighthouse http://localhost:3099/dashboard --only-categories=accessibility
```

期望分数 ≥ 98。fix_round 1 已修头像 button 的 aria-label + 文字色 token 对比度。

### 5.3 TC10 — error.tsx zh-CN（F-FQ-05-10）

正确 URL：`http://localhost:3099/error-test`（无前缀；触发 `(console)/error.tsx` 边界页）

切语言操作：浏览器 DevTools Console `localStorage.setItem('aigc-locale','zh-CN'); location.reload();`

期望：标题 = "出错了"、按钮 = "重试"（沿用 round8 通过证据 `bl-fe-quality-round8-tc10-evidence-2026-04-19.json`）。

### 5.4 TC11 — admin/models Free/Degraded（F-FQ-05-11）

正确 URL：`http://localhost:3099/admin/models`（无前缀）

切语言后期望：`Free` → "免费"，`Degraded` → "降级"（依赖 `messages/zh-CN.json` 的 `models.priceFree` / `models.statusDegraded` 键，F-FQ-03 已实现）。

### 5.5 TC12 — notification-center 相对时间中文（F-FQ-05-12）

正确 URL：登录后任意 console 页面，右上角 NotificationCenter（无独立 URL 段）。

切语言后期望：`5 minutes ago` → "5 分钟前"（依赖 dayjs zh-CN locale 在 F-FQ-03 已接入）。

## 6. Generator 本轮（fix_round 2）执行说明

- **不修任何产品代码**（无 bug 可修）
- 输出本 push-back 报告
- 在 progress.json 中：
  - `status` `fixing` → `reverifying`
  - `fix_rounds` 2 → 3（标记 push-back 也算一次循环以便溯源）
  - `evaluator_feedback` 清空
  - `generator_handoff.scope` 改为 "fix_round 2 push-back：reviewer 使用了不存在的 /zh/... URL，请按本报告 §5 用无前缀 URL + 客户端切语言重验"
  - `generator_handoff.notes` 指向本报告
  - `session_notes.Kimi-fix-round-2-pushback` 记录决策与文件证据
- commit + push：`docs(BL-FE-QUALITY): generator push-back round2 — i18n 无 URL 前缀，reviewer 重验`

## 7. 若 Reviewer 不接受本 push-back

请：
1. 引用项目内任意一处 i18n URL 前缀实现（routes / middleware / config / app dir）作为反证
2. 或申请 Planner 裁决（修改 spec acceptance 引入 URL 前缀机制 → 需要新批次 BL-I18N-URL-PREFIX 处理）

我（Generator）等待裁决。
