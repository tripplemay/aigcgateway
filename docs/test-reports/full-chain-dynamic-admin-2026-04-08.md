# Full Chain Dynamic Test Report (Admin-Authorized) — 2026-04-08

- Base: https://aigc.guangai.ai
- Admin: tripplezhou@gmail.com
- Test Developer: codex-admin-e2e-1775613514629@test.local
- Project: cmnpefy9900iwbntb9nk5be6e
- Started: 2026-04-08T01:58:34.629Z
- Finished: 2026-04-08T01:58:48.330Z

## Summary
- Total Steps: 37
- Non-2xx Steps: 4

## High-Signal Findings
1. 受限 key 在 chat 被拒绝，但在 actions/templates 未被同级权限拒绝（存在权限边界不一致）。
2. IP 白名单 key 在 REST 被拦截，但在 MCP initialize 放行（MCP 缺少同级 IP 白名单校验）。
3. 伪造支付宝成功回调请求可获得 success 响应；需结合验签实现评估资金风险。

## Evidence
- JSON: `docs/test-reports/full-chain-dynamic-admin-2026-04-08.json`