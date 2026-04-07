# User Profile Center Verification — 2026-04-08

## 环境
- Codex L1 stack via `bash scripts/test/codex-setup.sh`（PostgreSQL + Redis 本地）
- Service URL: http://localhost:3099
- 账号：`codex-dev@aigc-gateway.local` / `codex-admin@aigc-gateway.local` + 临时测试用户

## 测试资产
1. `docs/test-cases/user-profile-center-local-test-cases-2026-04-08.md`
2. `scripts/test/user-profile-center-e2e-2026-04-08.ts`
3. `tests/e2e/user-profile-center.spec.ts`（Playwright WebKit）

## 执行记录
| 顺序 | 资产 | 结果 | 产物 |
| --- | --- | --- | --- |
| 1 | `npx tsx scripts/test/user-profile-center-e2e-2026-04-08.ts` | PASS | `docs/test-reports/user-profile-center-e2e-2026-04-08.json` |
| 2 | `npx playwright test tests/e2e/user-profile-center.spec.ts --browser=webkit` | PASS | `docs/test-reports/user-profile-center-playwright-report.json` |

## 结果概要
- Sidebar 用户信息块在 Developer 账号下显示姓名 + 角色徽标，点击后跳转 `/settings`。
- 登录成功会向 `login_history` 表写入包含 IP + UA 的记录，API `/api/auth/login-history` 返回最近 20 条并与脚本中两次登录 UA 匹配。
- Settings → Security Log 列表展示最新记录，UA “PlaywrightUICheck” 正常渲染。
- Admin/Developer 导航条的 Settings 项与 main nav 高亮正常（在手工 sanity 中验证）。

## 已知问题
- 无

## 结论
- F-UP-01 ~ F-UP-06 全部 PASS，可进入 signoff。
