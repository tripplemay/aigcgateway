# BL-TEST-INFRA-IMPORT Signoff（2026-04-30）

- 批次：`BL-TEST-INFRA-IMPORT`
- 阶段：`reverifying` → `done`
- 执行人：Codex / Reviewer
- 本地环境：macOS arm64, Node `v25.7.0`, npm `10.8.2`, Docker `29.2.1`（Colima）
- CI：GitHub Actions run `25155177661`（head `55ef79274b0de2668eb0e52b2fdb74347ed6cbde`）

## 结论

- 本批次签收结论：**PASS**
- F-TI-07 的 11 项验收全部满足。
- 上轮唯一 blocker 已关闭：在 `5432` 已被本机其他 PostgreSQL / 容器占用的默认环境下，`bash scripts/test/codex-setup.sh` 现可自动改用空闲 host 端口，并同步 `DATABASE_URL`，随后完成 migrate / seed / build / start。

## 验收摘要

1. `tsc + build + vitest unit + vitest integration`：**PASS**
   - 本地 `npm run typecheck`：PASS
   - 本地 `npm run build`：PASS
   - 本地 `npm run test`：`68 files, 549 passed, 4 skipped`
   - 本地 `npm run test:integration`：`1 file, 2 passed`
2. `coverage artifact 生成且 lcov.info 可读`：**PASS**
   - 本地 `coverage/lcov.info` 存在
   - CI artifact：`docs/test-reports/_artifacts/BL-TEST-INFRA-IMPORT/gh-run-25155177661/coverage/lcov.info`
   - 最新 CI coverage 汇总：`Stmts 22.82 / Branch 19.49 / Funcs 21.17 / Lines 23.79`
3. `validate-rollback-sql.sh 通过 64 migrations`：**PASS**
4. `CI 8 jobs 在 main push 全跑（5/8 必 PASS）`：**PASS**
   - 实际 `8/8 jobs success`
5. `deduct-balance-atomic 真跑通`：**PASS**
   - 本地 `2/2` 通过
   - CI integration job `2/2` 通过
6. `Testcontainers 启动 + migrate + cleanup ≤ 90s`：**PASS**
   - 本地 integration：`Duration 8.04s`
   - CI integration：`Duration 9.62s`
7. `Playwright 跑 3 spec 至少 1 PASS`：**PASS**
   - 本地 `bash scripts/test/codex-setup.sh` 成功拉起 `:3199`
   - 本地 `bash scripts/test/codex-wait.sh`：PASS
   - 本地 `npm run test:e2e`：`1 passed / 3 skipped`
   - CI Playwright：`1 passed / 3 skipped`
8. `CI 上传 playwright-report artifact`：**PASS**
   - `docs/test-reports/_artifacts/BL-TEST-INFRA-IMPORT/gh-run-25155177661/playwright-report/index.html`
9. `tests/setup.ts 启用后单测无回归`：**PASS**
10. `handlers.ts mock 4 个上游 untreated 请求 console warn`：**PASS**
11. `signoff 报告`：**PASS**

## 关键证据

- 本地默认启动链：
  - `bash scripts/test/codex-setup.sh` 在 `5432` 已被 `kolmatrix-postgres` 占用时，输出：
    - `=== [PG] :5432 occupied → starting aigc-gateway-test-pg on host :55592 ===`
    - `=== [PG] container ready on :55592 (DATABASE_URL synced) ===`
    - `✓ Ready in 67ms`
- 本地等待脚本：
  - `bash scripts/test/codex-wait.sh` → `✅ Ready (1x3s elapsed)`
- 最新 CI E2E 实际输出：
  - `Running 4 tests using 2 workers`
  - `1 passed (18.8s)`
  - `3 skipped`
- 最新 CI integration 实际输出：
  - `tests/integration/deduct-balance-atomic.test.ts (2 tests) 9075ms`
  - `Duration 9.62s`
- 最新 CI unit 实际输出：
  - `68 passed`
  - `549 passed | 4 skipped`

## Artifact / Link

- 验收 run：`https://github.com/tripplemay/aigcgateway/actions/runs/25155177661`
- coverage artifact：
  - [lcov.info](/Users/yixingzhou/project/aigcgateway/docs/test-reports/_artifacts/BL-TEST-INFRA-IMPORT/gh-run-25155177661/coverage/lcov.info)
- Playwright report：
  - [index.html](/Users/yixingzhou/project/aigcgateway/docs/test-reports/_artifacts/BL-TEST-INFRA-IMPORT/gh-run-25155177661/playwright-report/index.html)

## Residual Risk

- 旧版本遗留的 malformed `aigc-gateway-test-pg` 容器在极少数本地环境里可能需要先 `docker rm -f aigc-gateway-test-pg` 再跑一次，原因是旧容器可能没有可解析的 published-port 元数据。
- 这不阻断当前版本签收，因为 clean-state 默认路径已在真实 `5432` 冲突环境中完成端到端验证。
