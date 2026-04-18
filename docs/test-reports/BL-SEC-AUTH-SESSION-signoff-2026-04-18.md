# BL-SEC-AUTH-SESSION 签收报告

- 批次：`BL-SEC-AUTH-SESSION`
- 阶段：`verifying -> done`
- 日期：`2026-04-18`
- 执行人：`Reviewer (Codex)`
- 环境：本地 `http://127.0.0.1:3099`（L1）

## 总结

**PASS**。`F-AS-04` 验收项在本地范围内通过，生产烟测项（Secure 标记）按口径保留到生产复验。

## 验收结果（对应 acceptance）

1. 登录响应 `Set-Cookie` 含 `HttpOnly`：**PASS**  
2. 登录响应 `Set-Cookie` 含 `SameSite=Lax`：**PASS**（响应头展示为 `SameSite=lax`）  
3. 生产环境 `Secure`：**未在本轮本地执行，生产复验项**  
4. DevTools Cookie HttpOnly 勾选：**通过响应头 + 浏览器行为间接验证**  
5. 浏览器 `document.cookie` 读不到 token：**PASS**（返回空串，不含 `token=`）  
6. 伪造 JWT 访问 `/admin/operations` 被重定向：**PASS**（307 -> `/login?redirect=%2Fadmin%2Foperations`）  
7. 无 token 访问 `/dashboard` 重定向：**PASS**（307 -> `/login?redirect=%2Fdashboard`）  
8. 过期 JWT 访问 `/admin/operations` 重定向：**PASS**（307 -> `/login?redirect=%2Fadmin%2Foperations`）  
9. SSR 守卫无未授权布局闪现：**PASS**（无 cookie 请求 `/dashboard` 响应体直接为重定向目标，不含 console layout DOM）  
10. `npm run build`：**PASS**  
11. `npx tsc --noEmit`：**PASS**  
12. `npx vitest run src/lib/auth/__tests__/jwt.test.ts`：**PASS**（10/10）  
13. 登录后 profile 能成功：**PASS**（Bearer 调用 `/api/auth/profile` 返回 200）  
14. 登出后 profile 返回 401：**PASS**（无授权 header 返回 401）  
15. 登出后访问 `/dashboard` 被重定向：**PASS**（307 -> `/login?redirect=%2Fdashboard`）  
16. 生成 signoff 报告：**PASS**（本文件）

## 关键证据

目录：`docs/test-reports/artifacts/bl-sec-auth-session-verifying-2026-04-18/`

- `login_response.txt`：登录响应头（Set-Cookie 属性）与 body token
- `admin_forged_jwt.txt`：伪造 JWT 重定向证据
- `admin_expired_jwt.txt`：过期 JWT 重定向证据
- `dashboard_no_cookie.txt`：未登录访问重定向证据
- `dashboard_no_cookie_body.html`：SSR 守卫响应体证据
- `logout_response.txt`：`/api/auth/logout` 清 cookie 证据
- `profile_with_bearer.txt` / `profile_without_bearer.txt`：兼容性回归证据
- `profile_after_logout.txt` / `dashboard_after_logout.txt`：登出后访问受限证据

## 备注与风险

1. `build` 期间存在 `jose` 与 Edge Runtime 的兼容 warning（CompressionStream/DecompressionStream），本轮功能验证未复现运行时失败；建议后续在生产发布后做一次定向 smoke（伪造 token 拦截 + 正常 admin 访问）。
2. 目前 `/api/auth/profile` 仍依赖 `Authorization` header；本批次前端通过保留 `localStorage token` 维持过渡期兼容，行为与 generator handoff 一致。
