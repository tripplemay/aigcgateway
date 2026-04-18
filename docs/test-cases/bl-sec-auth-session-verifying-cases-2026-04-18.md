# BL-SEC-AUTH-SESSION 验收用例（待执行）

- 批次：`BL-SEC-AUTH-SESSION`
- 阶段：`verifying` / `reverifying`
- 目标功能：`F-AS-04`（`executor: codex`）
- 当前状态：**仅准备用例，不执行测试**

## 验收范围

1. 登录态迁移到 HttpOnly cookie（含 SameSite，生产含 Secure）。
2. middleware 使用 `jose` 验签，拒绝伪造/过期 token。
3. console layout 增加 SSR 鉴权守卫，未授权直跳登录。
4. 登出 API 正确清 cookie，登出后受保护页面不可访问。
5. 构建、类型检查、JWT 单测通过。

## 前置条件（执行时）

1. 已由 Generator 完成 `F-AS-01 ~ F-AS-03` 并推送。
2. 本地环境（Codex 端口）：
1. `bash scripts/test/codex-setup.sh`
2. `bash scripts/test/codex-wait.sh`
3. 可用测试账号（admin/dev）与 API 调用工具（curl）。
4. 若执行“生产 Secure 标记”验证，需用户确认生产已部署该批次。

## L1 本地验收矩阵

### TC-AS-01 登录响应 Set-Cookie 属性（本地）
- 目的：确认后端登录写入 cookie，且具备安全属性。
- 步骤：
1. `curl -i -sS -X POST http://localhost:3099/api/auth/login -H 'content-type: application/json' --data '{"email":"codex-admin@aigc-gateway.local","password":"<ADMIN_TEST_PASSWORD>"}'`
2. 检查响应头中的 `Set-Cookie`。
- 期望：
1. 存在 `token=...`。
2. 包含 `HttpOnly`、`SameSite=Lax`、`Path=/`、`Max-Age=604800`。
3. 本地可不带 `Secure`（HTTP dev 兼容）。

### TC-AS-02 登录后 JS 不可读 token（浏览器）
- 目的：验证 HttpOnly 生效。
- 步骤：
1. 浏览器登录后打开 DevTools Console，执行 `document.cookie`。
2. 打开 Application > Cookies 查看 `token` 行。
- 期望：
1. `document.cookie` 不包含 `token=`。
2. Cookies 面板中 `token` 的 `HttpOnly` 勾选为 true。

### TC-AS-03 middleware 无 token 拦截
- 目的：验证受保护页面未登录重定向。
- 步骤：
1. 清空 cookie/storage。
2. `curl -i -sS http://localhost:3099/dashboard`
- 期望：
1. 返回 `302/307` 重定向到 `/login?redirect=/dashboard`（或等效）。

### TC-AS-04 middleware 伪造 JWT 拦截
- 目的：验证不再是 base64 解码，而是签名校验。
- 步骤：
1. 构造任意伪造 token（payload 含 `"role":"ADMIN"`，签名随意）。
2. `curl -i -sS http://localhost:3099/admin/operations -H "Cookie: token=<forged_jwt>"`
- 期望：
1. 被重定向到 `/login`（验签失败）。

### TC-AS-05 middleware 过期 JWT 拦截
- 目的：验证 exp 过期处理正确。
- 步骤：
1. 构造 `exp` 为过去时间的 token。
2. 用 cookie 携带访问 `/dashboard` 或 `/admin/operations`。
- 期望：
1. 被重定向到 `/login`。

### TC-AS-06 SSR 守卫无闪现（layout）
- 目的：验证 console layout 由 server 侧先鉴权。
- 步骤：
1. 清空 cookie 后请求受保护页面。
2. `curl -i -sS http://localhost:3099/dashboard`
3. `curl -sS http://localhost:3099/dashboard | head -n 30`
- 期望：
1. 响应直接是 redirect（状态码+Location）。
2. HTML 首包不含 console shell 主体 DOM（无“先渲染后跳转”）。

### TC-AS-07 /api/auth/logout 清 cookie
- 目的：验证后端登出 API 有效清理会话 cookie。
- 步骤：
1. 先登录获取 cookie jar。
2. `curl -i -sS -X POST http://localhost:3099/api/auth/logout -b cookie.txt -c cookie.txt`
- 期望：
1. `Set-Cookie` 返回 `token=; Max-Age=0`（或等效过期设置）。
2. 含 `HttpOnly`、`Path=/`。

### TC-AS-08 登出后访问受保护页面
- 目的：验证登出闭环。
- 步骤：
1. 使用 TC-AS-07 后的 cookie 再访问 `/dashboard`。
- 期望：
1. 重定向到 `/login`。

### TC-AS-09 /api/auth/profile 兼容性（登录后）
- 目的：验证 cookie 会话对现有 API 可用。
- 步骤：
1. 登录后携带 cookie 调用 `GET /api/auth/profile`。
- 期望：
1. 返回 `200` 与用户信息。

### TC-AS-10 /api/auth/profile 兼容性（登出后）
- 目的：验证登出后 API 权限收敛。
- 步骤：
1. 登出后同样调用 `GET /api/auth/profile`。
- 期望：
1. 返回 `401`（或等效未授权）。

### TC-AS-11 构建与类型检查
- 目的：确认改造后整体可构建。
- 步骤：
1. `npx tsc --noEmit`
2. `npm run build`
- 期望：
1. 两项均通过（非阻断 warning 可记录但不判失败）。

### TC-AS-12 JWT 单测
- 目的：确认 `verifyJwt` 正负路径可靠。
- 步骤：
1. `npx vitest run src/lib/auth/__tests__/jwt.test.ts`
- 期望：
1. 用例通过，覆盖合法/篡改/过期/空 token 场景。

## L2 生产烟测项（需用户明确授权）

### TC-AS-13 生产登录 cookie Secure 标记
- 步骤：
1. 对生产 `/api/auth/login` 发请求，抓响应头。
- 期望：
1. `Set-Cookie` 含 `Secure; HttpOnly; SameSite=Lax`。

### TC-AS-14 生产浏览器 HttpOnly 可视验证
- 步骤：
1. 浏览器登录生产，检查 Application > Cookies。
2. Console 执行 `document.cookie`。
- 期望：
1. token 为 HttpOnly，console 不可读 token。

## 执行输出（执行时）

1. 本地验收报告（建议）：
`docs/test-reports/bl-sec-auth-session-verifying-local-2026-04-18.md`
2. 全量通过后 signoff：
`docs/test-reports/BL-SEC-AUTH-SESSION-signoff-2026-04-18.md`

## 备注

1. 当前仅完成用例准备，未执行任何测试命令。
2. 收到你“开始测试”指令后，按上述用例逐项执行并附证据。
