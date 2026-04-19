# BL-INFRA-ARCHIVE Verifying Report (2026-04-20)

## 环境
- L1 本地：`scripts/test/codex-env.sh`（DB=`aigc_gateway_test`）
- 生产只读预检：`tripplezhou@34.180.93.185:/opt/aigc-gateway`（仅读 SQL）

## 结果总览
- PASS: 11
- DEFERRED: 2（部署后 smoke，口径允许延后）
- FAIL: 0
- 结论：通过，进入签收

## 逐项结果
1. PASS：cleanupHealthChecks 删除 40d/100d，保留 0d/20d。
2. PASS：cleanupSystemLogs 删除 100d，保留 0d/20d/40d。
3. PASS：scheduler 启动后立即 tick（单测 `start invokes tick immediately; stop clears the interval` 通过）。
4. PASS：leader-lock 未持有时不启动 scheduler（mock instrumentation 用例通过）。
5. PASS：`npm run build`。
6. PASS：`npx tsc --noEmit`。
7. PASS：`npx vitest run`。
8. PASS：生产 health_checks `<30d` 基线 = 0。
9. PASS：生产 system_logs `<90d` 基线 = 0。
10. PASS：`src/scripts` 扫描无 `call_logs` DELETE/partition。
11. DEFERRED：部署后 24h 调度观察（未部署本批至生产）。
12. DEFERRED：生产日志 deleted N 观察（未部署本批至生产）。
13. PASS：signoff 报告已生成。

## 证据
- 本地探针（#1/#2）：`docs/test-reports/artifacts/bl-infra-archive-local-probes-2026-04-20.json`
- 单测（#3）：`docs/test-reports/artifacts/bl-infra-archive-maintenance-tests-2026-04-20.log`
- mock（#4）：`docs/test-reports/artifacts/bl-infra-archive-leader-lock-mock-2026-04-20.log`
- 质量门（#5-#7）：
  - `docs/test-reports/artifacts/bl-infra-archive-build-2026-04-20.log`
  - `docs/test-reports/artifacts/bl-infra-archive-tsc-2026-04-20.log`
  - `docs/test-reports/artifacts/bl-infra-archive-vitest-2026-04-20.log`
  - `docs/test-reports/artifacts/bl-infra-archive-quality-gates-2026-04-20.json`
- 生产只读预检（#8/#9）：`docs/test-reports/artifacts/bl-infra-archive-production-precheck-2026-04-20.txt`
- 静态扫描（#10）：`docs/test-reports/artifacts/bl-infra-archive-call-logs-static-scan-2026-04-20.txt`
