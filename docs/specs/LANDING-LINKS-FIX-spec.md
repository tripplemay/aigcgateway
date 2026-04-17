# LANDING-LINKS-FIX Spec

**批次：** ONBOARDING-ENHANCE（合并条目）
**负责人：** Planner = Kimi / Generator = 默认（Kimi） / Evaluator = Reviewer
**创建：** 2026-04-17

## 背景

`public/landing.html`（未登录游客入口）存在 3 处指向 `(console)` 私有页面的链接：`/docs`、`/mcp-setup`、`/models`。点击后被 `middleware.ts` + `(console)/layout.tsx` 双重守卫拦到 `/login`，但 login 页当前硬编码 `router.push("/dashboard")`（`src/app/(auth)/login/page.tsx:92`），不读 `redirect` 参数 → 登录成功后跳 dashboard 而非原目标页，体验断裂。

## 改动范围

### F-LL-01：landing.html 链接改 redirect

| 行号 | 原 | 改为 |
|---|---|---|
| 2273 | `<a href="/docs" class="btn btn-ghost">查看文档</a>` | `<a href="/login?redirect=/docs" class="btn btn-ghost">查看文档</a>` |
| 2306 | `<li><a href="/docs">文档</a></li>` | `<li><a href="/login?redirect=/docs">文档</a></li>` |
| 2307 | `<li><a href="/mcp-setup">MCP 接入</a></li>` | `<li><a href="/login?redirect=/mcp-setup">MCP 接入</a></li>` |
| 2308 | `<li><a href="/models">模型清单</a></li>` | `<li><a href="/login?redirect=/models">模型清单</a></li>` |

**不动：**
- 同页锚点（`#layer-access`、`#layer-monitor`、`#layer-optimize`、`#scenes`、`#quickstart`、`#faq`）
- `/login`、`/register`（公开路由）
- 4 个 `href="#"` 占位链接（2315-2318，用户明确暂不处理）

### F-LL-02：login 页支持 redirect 参数（含安全白名单）

**文件：** `src/app/(auth)/login/page.tsx`

**改动：**

1. 新增 redirect 安全校验函数（建议抽成 module-level 常量或独立 util）：

```typescript
/**
 * 校验 redirect 参数是否为安全的内部路径。
 * 拒绝：外部 URL、protocol-relative（//xxx）、javascript: 等 scheme、非 / 开头。
 */
function isSafeRedirect(redirect: string | null): string | null {
  if (!redirect) return null;
  // 必须以 / 开头，但不能是 // 开头（防 protocol-relative）
  if (!redirect.startsWith("/") || redirect.startsWith("//")) return null;
  // 禁止包含反斜杠、控制字符
  if (/[\\\x00-\x1f]/.test(redirect)) return null;
  // 长度上限 256（防止滥用）
  if (redirect.length > 256) return null;
  return redirect;
}
```

2. 从 `useSearchParams` 读 `redirect`，登录成功后跳转：

```typescript
const searchParams = useSearchParams();
const safeRedirect = isSafeRedirect(searchParams.get("redirect"));

// 在 submit() 成功分支里
router.push(safeRedirect ?? "/dashboard");
```

3. 已登录用户访问 `/login` → 自动跳转（避免已登录用户重登）：

```typescript
useEffect(() => {
  const token = localStorage.getItem("token");
  if (token) {
    // 简单 exp 检查（保持和 src/app/page.tsx 一致的 JWT 解码逻辑）
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      if (payload.exp && payload.exp * 1000 > Date.now()) {
        router.replace(safeRedirect ?? "/dashboard");
      }
    } catch { /* 忽略 */ }
  }
}, []);
```

**Next.js 注意事项：**
- 页面当前是 `"use client"`，`useSearchParams` 可直接使用
- `useSearchParams` 在 Next 14 App Router 下需要 Suspense 边界 → 如果 build 报错，用 dynamic rendering 或包 Suspense

### F-LL-03：Evaluator 验收要点（合并到 F-OE-05）

Landing + redirect 验收项（新增到 F-OE-05 acceptance）：
1. 未登录访问 `https://aigc.guangai.ai/landing.html`，点击"文档"/"MCP 接入"/"模型清单"/CTA "查看文档"，URL 分别变为 `/login?redirect=/docs`、`/login?redirect=/mcp-setup`、`/login?redirect=/models`、`/login?redirect=/docs`
2. 在 `/login?redirect=/docs` 页输入有效账号登录 → 跳转到 `/docs`（非 `/dashboard`）
3. 恶意 redirect 全部被拒（跳默认 `/dashboard`）：
   - `/login?redirect=https://evil.com`
   - `/login?redirect=//evil.com`
   - `/login?redirect=javascript:alert(1)`
   - `/login?redirect=../admin`（含反斜杠或控制字符）
4. 已登录用户访问 `/login?redirect=/docs` → 立即跳 `/docs`，不显示登录表单
5. 4 处锚点跳转（`#layer-access`、`#scenes` 等）仍正常滚动
6. `register` 页未改动（行为保持原样：注册成功跳 `/dashboard`）

## 不改动项

- `register/page.tsx`（Q1 用户决策：不改）
- `middleware.ts`（保持 console 路由拦截逻辑）
- `(console)/layout.tsx`（保持客户端守卫）
- 4 个 `href="#"` 占位（2315-2318，Q1 决策：后续批次做真页面）

## 风险与注意

- **Open Redirect**：白名单函数是核心防线，必须有对应单元测试（generator 可在 F-LL-02 中写测试）
- **Next.js Suspense 边界**：`useSearchParams` 在静态生成时可能要求 Suspense，build 阶段留意
- **已登录检测的竞态**：`useEffect` 里判断 localStorage 是客户端异步，首帧可能闪一下登录表单 → 可加 `loading` 初始态隐藏表单直到 effect 完成

## 部署

Q4 决策：用户手动触发 Deploy workflow（本批次合入 ONBOARDING-ENHANCE 一并部署）。
