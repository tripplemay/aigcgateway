# User Profile Center Production Verification — 2026-04-08

## 环境
- 域名：`https://aigc.guangai.ai`
- 账号：`codex-dev@aigc-gateway.local` / `Codex@2026!`
- PROD_STAGE=RND, DB_WRITE=ALLOW（登录写入 login_history 属于最小必要写操作）

## 执行步骤
1. `npx tsx scripts/test/prod-upc-check.ts`（一次性脚本）
   - 调用 `/api/auth/login` 获取 token。
   - 调用 `/api/auth/login-history` 验证最近记录。
   - 通过 Playwright WebKit 注入 token 后访问 `/dashboard` 与 `/settings` 并截图。
2. 手工审阅截图库，确认 Sidebar 用户信息 + Settings 安全日志与 L1 一致。

## 证据
- API 结果：`docs/test-reports/user-profile-center-production-api-2026-04-08.json`
- 截图：`docs/test-reports/user-profile-center-prod-dashboard.png`、`docs/test-reports/user-profile-center-prod-settings.png`

## 结论
- 登录成功并写入 login_history，API 返回记录含 token UA（CodexProdTest/UA-1）。
- Dashboard Sidebar 展示开发者身份信息，Settings 页面 Security Log 区块存在。
- 生产环境表现与 L1 一致，无异常。
