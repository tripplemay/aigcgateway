# BL-SEC-POLISH Verifying Report (2026-04-19)

## 测试目标
验证 `F-SP-04` 的 18 项验收口径（AUTH 6 + SSRF/CT 4 + 脚本 4 + 构建 3 + signoff 1）。

## 测试环境
- L1 本地：`http://localhost:3099`
- DB: `aigc_gateway_test`（`scripts/test/codex-env.sh`）
- 启动方式：`bash scripts/test/codex-setup.sh` + `bash scripts/test/codex-wait.sh`

## 结果总览
- PASS: 15
- PARTIAL: 2
- FAIL: 1
- 结论：**未签收，进入 fixing**

## 逐项结果
1. FAIL — #1 login 不存在用户 + 错密码 `<50ms`
- 观测：`401`，`elapsedMs=218`
- 证据：`docs/test-reports/artifacts/bl-sec-polish-api-probes-2026-04-19.json`

2. PASS — #2 login 存在用户 + 错密码 `>150ms`
3. PASS — #3 cost=10 首次登录 rehash 到 cost=12
4. PASS — #4 login 同 IP 11/min 第 11 次 429
5. PASS — #5 login 同 email 6/min 第 6 次 429
6. PASS — #6 register 同 IP 11/min 第 11 次 429
7. PASS — #7 webhook `http://example.com` -> `400 invalid_webhook_url`
8. PASS — #8 webhook `169.254.169.254` -> `400 invalid_webhook_url`
9. PASS — #9 webhook `10.0.0.1` -> `400 invalid_webhook_url`
10. PASS — #10 image-proxy 非图片上游 -> `Content-Type=application/octet-stream`
- 证据（#2-#10）：`docs/test-reports/artifacts/bl-sec-polish-api-probes-2026-04-19.json`

11. PASS — #11 e2e-errors setup 失败时 `process.exit(1)` + 错误日志
- 证据：
  - `docs/test-reports/artifacts/e2e-errors-setup-failure-exitcode-2026-04-19.txt`
  - `docs/test-reports/artifacts/e2e-errors-setup-failure-2026-04-19.log`

12. PASS — #12 stress-test 生成当日报告文件
- 观测：`docs/test-reports/stress-test-2026-04-19.md` 已生成
- 证据：
  - `docs/test-reports/stress-test-2026-04-19.md`
  - `docs/test-reports/artifacts/stress-test-run-2026-04-19.log`

13. PARTIAL — #13 setup-zero-balance 的 bcrypt 格式修复生效，但脚本整体仍报错
- 观测：
  - 用户 hash 前缀 `"$2b$10$"`，格式匹配 `^\$2[aby]\$`
  - 脚本在 `project.balance` 字段处报错退出（遗留兼容问题）
- 证据：
  - `docs/test-reports/artifacts/setup-zero-balance-hash-check-2026-04-19.json`
  - `docs/test-reports/artifacts/setup-zero-balance-2026-04-19.log`

14. PARTIAL — #14 run_template(test_mode=execute) 限流语义命中，但协议层非 HTTP 429
- 观测：第二次调用返回 `HTTP 200 + isError + "Rate limit exceeded"`
- 口径差异：若按“语义限流”判定则 PASS；若按“HTTP 429”严格判定则不满足
- 证据：`docs/test-reports/artifacts/bl-sec-polish-run-template-rate-limit-2026-04-19.json`

15. PASS — #15 `npm run build`
16. PASS — #16 `npx tsc --noEmit`
17. PASS — #17 `npx vitest run`
- 证据：
  - `docs/test-reports/artifacts/bl-sec-polish-build-2026-04-19.log`
  - `docs/test-reports/artifacts/bl-sec-polish-tsc-2026-04-19.log`
  - `docs/test-reports/artifacts/bl-sec-polish-vitest-2026-04-19.log`
  - `docs/test-reports/artifacts/bl-sec-polish-quality-gates-2026-04-19.json`

18. FAIL（前置未满足）— signoff
- 由于 #1 未通过且 #13/#14 存在口径问题，本轮不生成 signoff。

## 风险与建议
- AUTH #1 与当前实现（统一 bcrypt compare 抗时序）目标相冲突：建议确认验收口径是否应改为“与存在用户错误密码时延接近”，而非 `<50ms`。
- run_template #14 建议明确“语义 429（MCP isError）”还是“HTTP 429（协议状态码）”。
- setup-zero-balance 脚本建议在后续批次修复 `project.balance` 兼容问题，避免脚本整体不可用。
