# BL-SEC-AUTH-SESSION Spec

**批次：** BL-SEC-AUTH-SESSION（P0-security，第一波第 2 批）
**负责人：** Planner = Kimi / Generator = 默认映射 / Evaluator = Reviewer
**创建：** 2026-04-18
**工时：** 1.5 day
**源：** `docs/code-review/backend-fullscan-2026-04-17.md` CRIT-7 + H-8 + H-32

## 背景

Code Review 2026-04-17 发现会话层 3 个相关问题，合并为一个批次修复：

### CRIT-7 — JWT 明文存 cookie + localStorage（XSS 会话劫持）

`src/app/(auth)/login/page.tsx:131` + `src/app/(console)/layout.tsx:50` + `src/app/(console)/settings/page.tsx:711-714` + `src/components/top-app-bar.tsx:45` 四处：

```ts
document.cookie = `token=${data.token}; path=/; max-age=604800; SameSite=Lax`;
localStorage.setItem("token", data.token);
```

**无 `HttpOnly`、无 `Secure` 标记**。任一 XSS 漏洞或第三方脚本注入 → 全站会话被盗。

### H-8 — middleware 仅 base64 解码不验签

`src/middleware.ts:4-13` 的 `decodeJwtPayload(token)` 直接 `JSON.parse(atob(token.split('.')[1]))`，**从不验证签名**。攻击者可以伪造 payload（`role: "ADMIN"`）访问 `/admin/*` 路由。

### H-32 — console layout 全 client + 每次导航重抓 profile

`src/app/(console)/layout.tsx` 顶部 `"use client"`，`useEffect` 里 `apiFetch("/api/auth/profile")`。**无 SSR 鉴权守卫 → 未授权用户先看到空白布局再被重定向**；且每次客户端导航都重新 fetch 一次 profile。

## 目标

1. **JWT 只放在 HttpOnly + Secure + SameSite=Lax cookie 里**，JS 无法读取
2. **middleware 真实验签**（Edge Runtime 兼容，用 `jose`）
3. **SSR 层提前鉴权**，消除未授权内容闪现
4. 过渡期允许 fetch 从 cookie 自动携带 token（`credentials: "include"` 或同源默认）

## 改动范围

### F-AS-01：后端 Set-Cookie HttpOnly + /api/auth/logout

**文件：**
- `src/app/api/auth/login/route.ts` — 成功响应加 `Set-Cookie: token=<jwt>; HttpOnly; Secure; SameSite=Lax; Max-Age=604800; Path=/`
- 新增 `src/app/api/auth/logout/route.ts` — `Set-Cookie: token=; Max-Age=0; HttpOnly; Path=/`
- 响应 body 暂保留 `{ token }` 字段，不影响现有前端（过渡期）

**注意：**
- `Secure` 仅在生产/HTTPS 环境下设置；本地 dev 走 HTTP 需允许（可用 `process.env.NODE_ENV === 'production' ? 'Secure; ' : ''`）
- 使用 Next.js `cookies()` API 或手动 `Set-Cookie` header
- `/api/auth/register` 若直接登录，同步返回 Set-Cookie

### F-AS-02：middleware 用 `jose` 真实验签

**文件：** `src/middleware.ts`

- 删除 `decodeJwtPayload`（仅 base64 的版本）
- 改用 `jose.jwtVerify(token, new TextEncoder().encode(JWT_SECRET))`（Edge Runtime 兼容）
- 验签失败：`NextResponse.redirect(new URL('/login?redirect=' + encodeURIComponent(pathname), request.url))`
- 保留 role 检查逻辑，读取已验签 payload 的 `role` 字段
- 本次起 token 从 cookie 读取（`request.cookies.get('token')`），不再看 Authorization header（中间件无需）

**单测：** 新增 `src/middleware.test.ts`（若 vitest 不支持 middleware，改用单元测试 `verifyJwt` helper 函数）

### F-AS-03：前端 4 写入点改造 + console layout SSR 守卫

**4 写入点改造：**

| 文件 | 原行为 | 新行为 |
|---|---|---|
| `src/app/(auth)/login/page.tsx:131` | `document.cookie + localStorage.setItem` | 删除（cookie 由后端 Set-Cookie 写入）；`localStorage.setItem` 保留用于过渡期 Authorization header，但加 TODO 注释最终移除 |
| `src/app/(console)/layout.tsx:50` | 同上 | 同上（删除 document.cookie 写入） |
| `src/app/(console)/settings/page.tsx:711-714` | 登出清 `document.cookie + localStorage` | 调 `/api/auth/logout` + `localStorage.removeItem('token')` |
| `src/components/top-app-bar.tsx:45` | 同上 | 同上 |

**console layout SSR 守卫：**

方案：拆分为 server layout + client shell

```
src/app/(console)/layout.tsx           (→ server component, 鉴权)
  └── src/app/(console)/_client-shell.tsx  (client, 原来的 UI + state)
```

server layout 里：
```tsx
// async server component
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyJwt } from "@/lib/auth/jwt";

export default async function ConsoleLayout({ children }) {
  const token = cookies().get("token")?.value;
  if (!token) redirect("/login");
  
  try {
    const payload = await verifyJwt(token);
    return <ConsoleClientShell user={payload}>{children}</ConsoleClientShell>;
  } catch {
    redirect("/login");
  }
}
```

抽 `src/lib/auth/jwt.ts`（或 `src/lib/auth/verify.ts`）统一的 `verifyJwt` 函数，供 middleware + server layout 共用。

### F-AS-04：全量验收（Evaluator）

**安全属性断言：**
1. 登录后 cookie 有 `HttpOnly`、`SameSite=Lax`、生产环境 `Secure` 标记
2. `document.cookie` JS 层读不到 token（浏览器开发者工具确认）
3. 伪造 JWT（替换 payload）→ 访问 `/admin/operations` → middleware 返回 redirect `/login`
4. 无 token 访问 `/dashboard` → middleware redirect `/login?redirect=/dashboard`
5. 无 token 直接访问 `/console` 子路径 → 不出现空白页面闪现（SSR 层 redirect）

**构建与代码健全：**
6. `npm run build` 通过
7. `npx tsc --noEmit` 通过
8. `npx vitest run src/lib/auth/` 新单测通过（verifyJwt 正向 + 负向）

**兼容性回归：**
9. 登录成功后 client 端 `apiFetch` 仍能正常调用 `/api/*`（cookie 自动带上）
10. 登出成功后再访问 `/dashboard` 被 redirect
11. 过渡期 localStorage token 仍在（用户不被动登出）

**生成 signoff 报告。**

## 非目标

- 不移除 `localStorage.token`（过渡期保留；下一轮 P3 再彻底清理）
- 不改 `/api/*` 业务路由的 auth 检查（middleware 层已足够）
- 不做 refresh token / session rotation（留给后续独立批次）
- 不加双因子认证或邮箱验证增强（脱离本批次 scope）

## Risks

| 风险 | 缓解 |
|---|---|
| 登录后 cookie 没自动带上 → 业务 API 401 雪崩 | `apiFetch` 配置 `credentials: "include"`（若跨域）或依赖同源默认；本地/prod 均同源走 cookie 无问题 |
| middleware jose 在 Edge Runtime 报错 | `jose` 官方支持 Edge；若报错 fallback Node.js runtime（middleware 声明 `export const runtime = 'nodejs'`） |
| SSR 鉴权导致首屏阻塞 | `cookies()` + `jwtVerify` 纯计算，无 DB 查询，开销可忽略 |
| Set-Cookie 在本地 dev HTTP 下 Secure 标记导致浏览器拒绝 | 环境判断：生产 `Secure`，本地开发不加 |
| 用户已登录态 localStorage 有 token 但 cookie 已失效 | 过渡期尴尬：用户会被 redirect 到 /login。接受（一次性迁移痛点） |

## 部署

- 纯代码变更，无 migration
- 生产 deploy 后所有现有用户 cookie 会失效（因 HttpOnly 是新写入）→ **需一次 logout 或等 cookie 过期**
- 回滚：revert commit；旧 cookie 中间件仍能解析（base64 版本），不会全站不可用

## 验收标准（Evaluator 完成全部才签收）

- [ ] 登录 cookie 属性：HttpOnly + SameSite=Lax + 生产 Secure
- [ ] JS 无法读 token（DevTools Application > Cookies 标记 HttpOnly 勾选）
- [ ] middleware 验签：伪造 JWT 访问 admin 路由被 redirect
- [ ] middleware 验签：无 token 被 redirect
- [ ] SSR 守卫：未授权访问 console 不闪现空白
- [ ] 登出 API 清除 cookie
- [ ] build + tsc + vitest 全过
- [ ] 业务 API 调用兼容性（apiFetch 成功）
- [ ] signoff 报告归档
