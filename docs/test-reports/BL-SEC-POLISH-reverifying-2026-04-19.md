# BL-SEC-POLISH 复验报告（2026-04-19）

## 阶段与口径
- 阶段：`reverifying`
- 依据：`features.json` 最新 acceptance（已纳入 2026-04-19 Planner 裁决）
  - #1：改为时延差 `<20ms`（而非 `<50ms`）
  - #14：改为 MCP `CallToolResult.isError` 语义限流（外层 HTTP 200）

## 环境
- L1 本地：`http://localhost:3099`
- 启动：`bash scripts/test/codex-setup.sh` + `bash scripts/test/codex-wait.sh`
- DB：`aigc_gateway_test`

## 结果汇总
- 18/18 PASS
- 结论：满足签收条件

## 逐项结果
1. PASS：不存在用户错密 vs 存在用户错密时延差 `<20ms`（missing=224ms, existing=229ms, delta=5ms）
2. PASS：存在用户错密 >150ms
3. PASS：cost10 首登 rehash 到 cost12
4. PASS：login 同 IP 第 11 次 429
5. PASS：login 同 email 第 6 次 429
6. PASS：register 同 IP 第 11 次 429
7. PASS：webhook `http://example.com` -> `400 invalid_webhook_url`
8. PASS：webhook `169.254.169.254` -> `400 invalid_webhook_url`
9. PASS：webhook `10.0.0.1` -> `400 invalid_webhook_url`
10. PASS：image-proxy 上游 `text/html` -> 本地 `application/octet-stream`
11. PASS：`e2e-errors` setup 失败即 `process.exit(1)` 且有 fatal 日志
12. PASS：`stress-test` 生成当日报告 `docs/test-reports/stress-test-2026-04-19.md`
13. PASS：`setup-zero-balance` 脚本可运行（exit=0），且 user hash 匹配 `^\$2[aby]\$`
14. PASS：`run_template test_mode=execute` 超限时 `isError=true` + `Rate limit exceeded`（HTTP 200）
15. PASS：`npm run build`
16. PASS：`npx tsc --noEmit`
17. PASS：`npx vitest run`
18. PASS：已生成 signoff 报告（见下文证据）

## 证据
- API 探针（#1-#10）：`docs/test-reports/artifacts/bl-sec-polish-api-probes-2026-04-19.json`
- e2e-errors（#11）：
  - `docs/test-reports/artifacts/e2e-errors-setup-failure-2026-04-19.log`
  - `docs/test-reports/artifacts/e2e-errors-setup-failure-exitcode-2026-04-19.txt`
- stress-test（#12）：
  - `docs/test-reports/stress-test-2026-04-19.md`
  - `docs/test-reports/artifacts/stress-test-run-2026-04-19.log`
- setup-zero-balance（#13）：
  - `docs/test-reports/artifacts/setup-zero-balance-2026-04-19.log`
  - `docs/test-reports/artifacts/setup-zero-balance-exitcode-2026-04-19.txt`
  - `docs/test-reports/artifacts/setup-zero-balance-hash-check-2026-04-19.json`
- run-template rate limit（#14）：`docs/test-reports/artifacts/bl-sec-polish-run-template-rate-limit-2026-04-19.json`
- 质量闸门（#15-#17）：
  - `docs/test-reports/artifacts/bl-sec-polish-build-2026-04-19.log`
  - `docs/test-reports/artifacts/bl-sec-polish-tsc-2026-04-19.log`
  - `docs/test-reports/artifacts/bl-sec-polish-vitest-2026-04-19.log`
  - `docs/test-reports/artifacts/bl-sec-polish-quality-gates-2026-04-19.json`
