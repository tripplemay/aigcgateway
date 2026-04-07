# Bugfix Template API Verification — 2026-04-08

## 环境
- Codex L1 stack via `bash scripts/test/codex-setup.sh`
- URL: http://localhost:3099
- 账号：`codex-admin@aigc-gateway.local` / `Codex@2026!`

## 执行步骤
1. 运行 `npx tsx scripts/test/bugfix-template-api-e2e-2026-04-08.ts`，脚本第一步调用 `/api/auth/login`。
2. 直接用 `curl` 重试 `/api/auth/login`（同时测试 dev/admin 两个账号，移除 proxy），结果一致。

## 结果
- `/api/auth/login` 在最新代码（包含 login history 写入）下持续返回 401/502，无法获得 token。
- 因无法登录，后续模板 REST/MCP 测试均无法执行。

## 结论
- F-BT-03 阻塞。请 Generator 检查 login endpoint（可能与 login history 改动相关），恢复后 Codex 再复验。
