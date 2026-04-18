# BL-FE-PERF-01 Spec

**批次：** BL-FE-PERF-01（P0-frontend，第二波第 1 批）
**负责人：** Planner = Kimi / Generator = 默认映射 / Evaluator = Reviewer
**创建：** 2026-04-18
**工时：** 2 day
**源：** `docs/code-review/frontend-perf.md` + `frontend-lighthouse.md` + `frontend-bundle-analysis.md`

## 背景

Code Review 2026-04-17 前端性能静态 + 实测三份报告一致指向：

### CRITICAL-1 — Recharts 静态导入污染三大路由（`[已核实 file:line]`）

| 文件 | Recharts import 位置 | First Load |
|---|---|---|
| `src/app/(console)/dashboard/page.tsx:20` | `import { ... } from "recharts"` | **281 kB** |
| `src/app/(console)/usage/page.tsx:19` | 同上 | **271 kB** |
| `src/app/(console)/admin/usage/page.tsx:24` | 同上 | **227 kB** |

Recharts 编译后约 **396 kB chunk**（`chunks/6627-*.js`，bundle 分析第一名）。未 `dynamic()` 导入 → 三条路由共享 console layout chunk 后，该库被打进 First Load。

### CRITICAL-2 — i18n 全量捆绑（`[已核实 intl-provider.tsx:4-5]`）

```ts
// src/components/intl-provider.tsx:4-5
import en from "@/messages/en.json";       // ~53 kB
import zhCN from "@/messages/zh-CN.json";  // ~54 kB
const messages = { en, "zh-CN": zhCN };    // 合计 ~107 kB 进每个 client bundle
```

`IntlProvider` 是 root layout 的 client component，所以**每个用户**、**每个页面**都会捆绑两种语言的消息（实际只用其一）。

### HIGH-4 — Material Symbols 无 preconnect（`[已核实 layout.tsx:23-26]`）

```tsx
// src/app/layout.tsx:23-26
<link
  href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:...&display=swap"
  rel="stylesheet"
/>
```

- 已有 `&display=swap` ✅
- 缺 `<link rel="preconnect" href="https://fonts.googleapis.com">`
- 缺 `<link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="">`
- DNS 查询 + TCP 握手阻塞 FCP

### Dashboard CLS 0.11 超阈（`[已核实 lighthouse 实测]`）

异步加载的图表容器、用户头像、balance 卡片在数据返回后尺寸变化触发 layout shift。

### LOW-4 — src/app/page.tsx 重定向逻辑复杂（`[核实发现 Code Review 断言不准]`）

原 Code Review 断言 "仅做 router.push 重定向"。**实际核实：**

```tsx
// src/app/page.tsx:1-36
"use client";
export default function Home() {
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) { window.location.replace("/landing.html"); return; }
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      if (payload.exp && payload.exp * 1000 < Date.now()) {
        /* clear token + go landing */;
      }
      router.replace("/dashboard");
    } catch { /* clear token + go landing */ }
  }, [router]);
  return /* Loading... */;
}
```

有 JWT 校验 + 未登录跳 `/landing.html`，不是 simple redirect。但现在 AUTH-SESSION 已上线 HttpOnly cookie + middleware jose 验签，root page 可以改为 **async RSC 读 cookies + verifyJwt 决定跳 /dashboard 或 /landing.html**，消除客户端 JS 包。

### MEDIUM — console/ 缺 `loading.tsx`

仅有 `error.tsx`。每页自己的 `useAsyncData` 加载态要等 client hydrate 完才显示，路由级 Suspense 边界缺失。

### MEDIUM — `next.config.ts` 缺 bundle-analyzer + images 配置 + poweredByHeader

## 目标

1. `dashboard` / `usage` / `admin/usage` 三路由 First Load 降到 **< 180 kB**（当前 281/271/227）
2. 每页 i18n bundle 从 ~107 kB 降到 ~55 kB（仅当前语言）
3. `dashboard` CLS 降到 ≤ 0.1（Good）
4. 字体加载无 FCP 阻塞（Material Symbols preconnect + swap）
5. 根路由 `/` 从 client-side redirect 改为 RSC redirect（省去该路由的 JS 包）
6. console 路由级 Suspense 边界就位（`loading.tsx`）
7. CI 有 bundle 体积监控入口

## 改动范围

### F-PF-01：Recharts 懒加载（3 个路由）

**文件：**
- `src/app/(console)/dashboard/page.tsx`（L20 recharts 静态 import）
- `src/app/(console)/usage/page.tsx`（L19）
- `src/app/(console)/admin/usage/page.tsx`（L24）

**改动：**

每个页面抽 `ChartsSection.tsx` 子组件：
```tsx
// dashboard/charts-section.tsx (new)
"use client";
import { AreaChart, BarChart, ... } from "recharts";
export default function ChartsSection({ data }) { ... }
```

页面改用 dynamic import：
```tsx
// dashboard/page.tsx
import dynamic from "next/dynamic";
const ChartsSection = dynamic(() => import("./charts-section"), {
  ssr: false,
  loading: () => <Skeleton className="h-64 w-full" />,
});
```

**验证：** `npm run build` 输出对应路由 First Load 降到 < 180 kB。

### F-PF-02：i18n 按需加载

**文件：** `src/components/intl-provider.tsx`

**改动：** 用 `useEffect + import()` 动态加载当前 locale：
```tsx
function IntlInner({ children }) {
  const { locale } = useLocale();
  const [messages, setMessages] = useState<Record<string, string> | null>(null);
  useEffect(() => {
    import(`@/messages/${locale}.json`).then((m) => setMessages(m.default));
  }, [locale]);
  if (!messages) return <Skeleton className="h-screen w-screen" />;
  return <NextIntlClientProvider locale={locale} messages={messages} ...>{children}</NextIntlClientProvider>;
}
```

**验证：** Chrome DevTools Network 面板只加载一个 `messages/en.json` 或 `zh-CN.json`，不同时加载两个。

### F-PF-03：Material Symbols preconnect + dashboard CLS

**文件：** `src/app/layout.tsx:22-27`

**改动：**
```tsx
<head>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
  <link
    href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:..."
    rel="stylesheet"
  />
</head>
```

**Dashboard CLS 修**（`src/app/(console)/dashboard/page.tsx`）：
- 所有 `useAsyncData` 依赖的卡片加 `min-h-[160px]` 或 `<Skeleton>` 占位
- 图表容器改固定高度（`h-[300px]` + Skeleton 而非自适应）
- balance / 用户头像容器预留固定尺寸

**验证：** Lighthouse CLS ≤ 0.1。

### F-PF-04：src/app/page.tsx 改 RSC

**文件：** `src/app/page.tsx`

**改动：**
```tsx
// src/app/page.tsx (new, RSC)
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyJwt } from "@/lib/auth/jwt";

export default async function Home() {
  const token = cookies().get("token")?.value;
  if (!token) redirect("/landing.html");
  try {
    await verifyJwt(token);
    redirect("/dashboard");
  } catch {
    redirect("/landing.html");
  }
}
```

- 删除 `"use client"`
- 利用 AUTH-SESSION 已上线的 HttpOnly cookie + `verifyJwt`
- 客户端 JS 包清零（该路由）

**验证：** `npm run build` 输出 `/` 路由 First Load JS **显著下降**；view-source 响应首字节即是 redirect meta/Location。

### F-PF-05：console/ 补 loading.tsx

**文件：** 新建 `src/app/(console)/loading.tsx`

```tsx
import { Skeleton } from "@/components/ui/skeleton";
export default function Loading() {
  return (
    <div className="p-6 space-y-4">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-64 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}
```

**可选补充：** `src/app/(console)/dashboard/loading.tsx`、`/usage/loading.tsx`、`/admin/usage/loading.tsx` 各自更贴近页面布局的 Skeleton。

**验证：** 手动导航切换时立即看到 Skeleton，不闪白屏。

### F-PF-06：next.config.ts bundle-analyzer + 其他

**文件：** `next.config.ts`

**改动：**

1. 安装 `@next/bundle-analyzer` dev dep
2. `next.config.ts` 接入：
```ts
import withBundleAnalyzer from "@next/bundle-analyzer";
const analyzer = withBundleAnalyzer({ enabled: process.env.ANALYZE === "true" });
export default analyzer({
  poweredByHeader: false,
  output: "standalone",
  // images config 预留（没有外部图片时空对象）
  images: { remotePatterns: [] },
  // ... 现有配置
});
```

3. `package.json` 添加 `"analyze": "ANALYZE=true npm run build"` script（可选便利）

**验证：** `npm run analyze` 生成报告可读；`npm run build` 响应头 `X-Powered-By` 消失。

### F-PF-07：全量验收（Evaluator）

**Bundle 体积断言（关键性能指标）：**
1. `npm run build` 输出 `/dashboard` First Load JS ≤ **180 kB**（当前 281，期望下降 100+ kB）
2. `/usage` First Load JS ≤ **180 kB**（当前 271）
3. `/admin/usage` First Load JS ≤ **160 kB**（当前 227）
4. `/` First Load JS ≤ **90 kB**（当前需测，RSC 改造后应接近 0 业务代码）
5. `chunks/6627-*.js`（recharts）仍存在但不出现在三大路由 First Load 列表

**Lighthouse 实测（本地 `npm run build && npm start`）：**
6. `/dashboard` LCP ≤ 1.5s（当前 603 ms dev 无节流，prod 应更好）
7. `/dashboard` CLS ≤ **0.1**（当前 0.11，必须降）
8. `/` view-source 响应首字节是 HTML redirect meta 或 302 Location，不含业务 JS

**i18n 验证：**
9. DevTools Network：加载 `/dashboard` 只请求一个 `messages/*.json`（en 或 zh-CN 其一）
10. 语言切换后动态请求另一个 JSON 正常工作

**构建与单测：**
11. `npm run build` 通过
12. `npx tsc --noEmit` 通过
13. `npx vitest run` 全过
14. `npm run analyze`（ANALYZE=true）产出 report.html 可打开

**冒烟回归：**
15. 未登录访问 `/` → redirect `/landing.html`
16. 已登录访问 `/` → redirect `/dashboard`
17. `/dashboard` 图表正常显示（加载过程有 Skeleton，无白屏闪烁）
18. 语言切换（zh-CN ↔ en）生效

**生成 signoff 报告。**

## 非目标

- 不做前端组件库重构（shadcn 补齐留给 BL-FE-DS-SHADCN）
- 不做 A11y / i18n 文本修（留给 BL-FE-QUALITY）
- 不做 UX 交互层改造（留给 BL-FE-QUALITY 的 UX 部分）
- 不做 Material Symbols 自宿（next/font/local 迁移留给后续优化批次）
- 不做 SW / 缓存策略优化

## Risks

| 风险 | 缓解 |
|---|---|
| Recharts `dynamic({ssr: false})` 导致首屏短暂 Skeleton 闪烁 | 可接受（本来异步加载数据也会有加载态）；Skeleton 尺寸固定避免 CLS |
| i18n 动态加载导致首次渲染 Skeleton 持续约 100ms | 可接受；也可预加载当前 locale（`<link rel="preload">`）进一步优化 |
| src/app/page.tsx RSC 改造依赖 verifyJwt 同步可用 | verifyJwt 在 AUTH-SESSION 已稳定；cookies() 在 RSC 标准 API |
| bundle-analyzer dev dep 增加 npm install 时间 | 仅 dev 依赖，不影响生产 |
| loading.tsx 与现有 error.tsx 混用 | Next.js 标准模式，无冲突 |

## 部署

- 纯前端/构建配置变更，无 migration
- 生产部署：git pull + npm ci + npm run build + pm2 restart
- 回滚：revert commit

## 验收标准

- [ ] F-PF-07 的 18 项全 PASS
- [ ] 三大路由 First Load 下降 ≥ 100 kB
- [ ] dashboard CLS < 0.1
- [ ] signoff 报告归档
