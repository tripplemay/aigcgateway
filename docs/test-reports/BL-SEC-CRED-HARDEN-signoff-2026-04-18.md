# BL-SEC-CRED-HARDEN 签收报告

- 批次：`BL-SEC-CRED-HARDEN`
- 阶段：`verifying -> done`
- 验收时间：`2026-04-18`
- 执行人：`Reviewer (Codex)`
- 环境：本地 `localhost:3099/3000` + 生产只读登录探针（`admin-auth.ts`）

## 结论

**PASS**。`F-CH-04` 验收项满足，批次可签收。

## 验收结果

1. 静态检查（代码域）PASS  
   在 `src/`、`scripts/`、`prisma/`、`tests/` 范围内扫描以下关键字均零命中：  
   `admin123` / `Codex@2026` / `Test1234` / `aigc-gateway-image-proxy-dev-secret`

2. `.env.example` 变量完整性 PASS  
   命中 4 个变量：  
   `IMAGE_PROXY_SECRET` / `ADMIN_SEED_PASSWORD` / `ADMIN_TEST_PASSWORD` / `E2E_TEST_PASSWORD`

3. `npx tsc --noEmit` PASS

4. `npm run build` PASS  
   存在既有 lint warnings，但不阻断构建。

5. `npx vitest run src/lib/api/__tests__/image-proxy.test.ts` PASS  
   `10 passed (10)`。

6. 启动 fail-fast（负向）PASS  
   执行：`IMAGE_PROXY_SECRET= AUTH_SECRET= NEXTAUTH_SECRET= npm run dev`  
   观察到明确错误：`IMAGE_PROXY_SECRET (or AUTH_SECRET / NEXTAUTH_SECRET) is required`

7. fallback 链（正向）PASS  
   执行：`IMAGE_PROXY_SECRET= AUTH_SECRET= NEXTAUTH_SECRET='fallback-secret-ok' npm run dev`  
   服务正常启动（Ready），未出现缺失 secret 报错。

8. `admin-auth.ts` 缺失 env 退出 PASS  
   执行：`ADMIN_TEST_PASSWORD= npx tsx scripts/admin-auth.ts`  
   输出：`Missing env: ADMIN_TEST_PASSWORD`，退出码 `1`。

9. `admin-auth.ts` 设置 env 正向 PASS  
   执行：`BASE_URL='https://aigc.guangai.ai' ADMIN_TEST_PASSWORD='***' npx tsx scripts/admin-auth.ts`  
   输出 token 前缀，登录成功。

10. `seed.ts` env 校验与正向执行 PASS  
   - 无 `ADMIN_SEED_PASSWORD`：报错并退出。  
   - 设置 `ADMIN_SEED_PASSWORD`：seed 成功。  
   - 代码核对：`prisma/seed.ts` 中 admin `upsert.update={}`，不重置既有密码哈希。

## 说明

1. 以“全仓 git grep（仅排除 docs）”执行时，关键字仍会命中 `backlog.json`、`features.json`、`progress.json`、`.auto-memory/*` 的规格/记忆文本；本批次按 acceptance 的“代码/scripts/prisma 清零”口径判定通过。
2. 本轮未修改任何产品实现代码，仅执行验收并产出报告。
