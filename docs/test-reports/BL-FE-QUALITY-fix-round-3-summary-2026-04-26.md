# BL-FE-QUALITY Fix Round 3 完成说明

- 批次：`BL-FE-QUALITY`
- 功能：`F-FQ-05`
- 提交方：Generator / Kimi（cli）
- 日期：2026-04-26
- 触发：Reviewer round5 失败报告 `docs/test-reports/BL-FE-QUALITY-reverifying-failed-2026-04-26-round5.md`
- 性质：**测试基础设施修复**（不修任何产品代码）

## 1. 上一轮 push-back 误判校正

fix_round 2 的 push-back 报告（commit `12777d6`）判定 round3/round4 失败"全部"为 Evaluator 用了不存在的 `/zh/...` URL，这部分判断**对一半**：URL 前缀确实不存在；但还有更深一层根因，被 push-back 漏掉了。

Reviewer 接受 push-back 后改用无前缀 URL 复验（round5），结果一样的 chunks 400/404 + NO_FCP。证明真根因不仅是 URL 前缀。

本轮深挖出真根因，向 Reviewer 致歉。

## 2. 真正根因（链路完整）

### 2.1 触发器

`commit b9fafa5 feat(BL-SEC-CRED-HARDEN): remove hardcoded secrets + fail-fast env asserts` 在本批次启动后引入：

```ts
// src/instrumentation.ts:11-17
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // 启动时 fail-fast：IMAGE_PROXY_SECRET 家族必须至少一个有值
    const { assertImageProxySecret } = await import("@/lib/env");
    assertImageProxySecret();
    ...
```

```ts
// src/lib/env.ts:103-109
export function assertImageProxySecret(): void {
  const secret =
    process.env.IMAGE_PROXY_SECRET || process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("IMAGE_PROXY_SECRET (or AUTH_SECRET / NEXTAUTH_SECRET) is required");
  }
}
```

### 2.2 测试 env 断层

`scripts/test/codex-env.sh` 是 codex 测试环境唯一 env source，它没有 `IMAGE_PROXY_SECRET` / `AUTH_SECRET` / `NEXTAUTH_SECRET` 任意一个：

```bash
# 修改前 codex-env.sh，缺三个 SECRET
export DATABASE_URL=...
export REDIS_URL=...
export JWT_SECRET="test-jwt-secret-2026"
export JWT_EXPIRES_IN="7d"
# ↑ 后面再没有 IMAGE_PROXY_SECRET / AUTH_SECRET / NEXTAUTH_SECRET
```

### 2.3 失败链

1. `codex-setup.sh` 跑 `node .next/standalone/server.js`
2. instrumentation hook 调用 `assertImageProxySecret()` → throw
3. Next.js 14 standalone server 标记 `Failed to prepare server`，但仍 listen
4. **每次 HTTP 请求都重新触发 register → 重新 throw → 返回 500**
5. `/login` 500 / `/dashboard` 500
6. 浏览器加载 500 错误页（Next.js fallback），错误页引用了**正常 build 的 chunk hash**，但因为 server 在 broken state，不能正常 stream RSC，部分 chunk 走 200 路径但大部分走异常路径返回 400/404
7. 最终现象：截图白屏 + Lighthouse NO_FCP + 大量 _next/static 400/404

### 2.4 本地实证

source 修复后的 `codex-env.sh` 启动 standalone server，直接验证：

```
chunks: HTTP/1.1 200 OK ✓
/login:  HTTP/1.1 200 OK ✓
/dashboard: HTTP/1.1 307 Temporary Redirect → /login (未登录正常) ✓

instrumentation log:
  ✓ Ready in 67ms
  [redis] connected
  [instrumentation] Redis ready, leadership acquired
  [health-scheduler] started (V2 alias-aware)
  [billing-scheduler] started
  [model-sync] Scheduler started
  [maintenance] scheduler started
  [instrumentation] scheduler leader — all background jobs started
```

## 3. 修复内容（test infra only）

### 3.1 `scripts/test/codex-env.sh`

补 IMAGE_PROXY_SECRET / AUTH_SECRET / NEXTAUTH_SECRET（三个都加，覆盖所有 fallback 路径）：

```bash
# instrumentation.ts assertImageProxySecret() (commit b9fafa5 BL-SEC-CRED-HARDEN) requires at least one of the three;
# missing them all causes server prepare to throw and every page to return 500 (chunks 400/404 cascade, NO_FCP).
export IMAGE_PROXY_SECRET="test-image-proxy-secret-2026-with-enough-length-for-hmac"
export AUTH_SECRET="test-auth-secret-2026-with-enough-length-for-hmac"
export NEXTAUTH_SECRET="test-nextauth-secret-2026-with-enough-length-for-hmac"
```

### 3.2 `scripts/test/codex-setup.sh`

cp 步骤改稳健（去掉 `2>/dev/null || true` 静默 + 加 fail-fast verify），避免类似底层失败被吞：

```bash
# 修改前
cp -r .next/static .next/standalone/.next/static 2>/dev/null || true
cp -r public .next/standalone/public 2>/dev/null || true
exec node .next/standalone/server.js

# 修改后
rm -rf .next/standalone/.next/static .next/standalone/public
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public
if [ -z "$(ls -A .next/standalone/.next/static/chunks 2>/dev/null)" ]; then
  echo "ERROR: .next/standalone/.next/static/chunks empty after cp" >&2
  exit 1
fi
exec node .next/standalone/server.js
```

预清目标避免 macOS/BSD `cp -r` 在 target 已存在时嵌套创建子目录的坑；verify 步骤把任何 cp 静默失败立刻暴露。

## 4. 不修产品代码

- fix_round 1 (commit `b62a9ff`) 已正确闭环 spec acceptance（A11y + DS grep）
- 本轮所有失败均为测试 env 缺口，与产品代码无关
- 不修 src/，不修 next.config.mjs，不修 middleware.ts，不修 i18n

## 5. 给 Reviewer round6 的复验提示

完整重跑 `bash scripts/test/codex-setup.sh`（修复后版本），然后：

- **静态资源**：`_next/static/chunks/*.js`, `_next/static/css/*.css`, `_next/static/media/*.woff2` 全部应 200
- **路由**：`/login` 200，`/dashboard` 未登录 307→/login，登录后 200
- **A11y**：`npx lighthouse http://localhost:3099/dashboard --only-categories=accessibility`（先在浏览器登录 + 切 zh-CN + 拷贝 cookie），分数应 ≥ 98（fix_round 1 已修头像 a11y）
- **TC10**：`/error-test` + `localStorage.setItem('aigc-locale','zh-CN')` → 标题"出错了"按钮"重试"
- **TC11**：`/admin/models` + 切 zh-CN → `Free`→"免费", `Degraded`→"降级"
- **TC12**：登录后任意 console 页右上角 NotificationCenter + 切 zh-CN → 相对时间中文

## 6. progress.json 状态变化

- `status` `fixing` → `reverifying`
- `fix_rounds` 3 → 4
- `evaluator_feedback` 清空
- `generator_handoff` 改为 fix_round 3 完成说明
- `session_notes.Kimi-fix-round-3` 记录根因 + 修复 + 自验证
