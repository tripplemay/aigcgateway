# BL-TEST-INFRA-IMPORT Reverifying Report（2026-04-30）

- 批次：`BL-TEST-INFRA-IMPORT`
- 阶段：`reverifying`
- 执行人：Codex / Reviewer
- 本地环境：macOS arm64, Node `v25.7.0`, npm `10.8.2`, Docker `29.2.1`（Colima）
- CI：GitHub Actions run `25151011889`（head `3bfe956213b5328cf0ed41db50d307353cd92a35`）

## 结论

- 本轮复验结论：**FAIL**
- F-TI-07 的功能验收面已恢复到可接受范围：CI 8 jobs 全绿，`deduct-balance-atomic` 通过，Playwright 已达到“至少 1 PASS + artifact 上传”。
- 仍有 1 个阻断项未关闭：**evaluator 默认本地工作流仍不自洽**。仓库规定的唯一启动方式 `bash scripts/test/codex-setup.sh` 仍默认失败；裸 `npm run test:e2e` 仍默认失败。

## F-TI-07 复验明细

1. `tsc + build + vitest unit + vitest integration`：**PASS**
   - `npm run typecheck`：PASS
   - `npm run build`：PASS
   - `npm run test`：PASS（`68 files, 549 passed, 4 skipped`）
   - `npm run test:integration`：PASS（`1 file, 2 passed`，`Duration 3.00s`，`real 3.300s`）
2. `coverage artifact 生成且 lcov.info 可读`：**PASS**
   - 本地 `coverage/lcov.info` 存在
   - CI artifact 已上传：`docs/test-reports/_artifacts/BL-TEST-INFRA-IMPORT/gh-run-25151011889/coverage/lcov.info`
   - 说明：`npm run test:coverage` 仍因 baseline 阈值不足退出 `1`，但这是批次既定接受项，不构成新增阻断
3. `validate-rollback-sql.sh 通过 64 migrations`：**PASS**
4. `CI 8 jobs 在 main push 全跑（5/8 必 PASS）`：**PASS**
   - 实际 8/8 jobs `success`
5. `deduct-balance-atomic 真跑通`：**PASS**
   - 本地 `2/2` 通过
   - CI integration job `2/2` 通过
6. `Testcontainers 启动 + migrate + cleanup ≤ 90s`：**PASS**
   - 本地：`real 3.300s`
   - CI：`Duration 10.31s`
7. `Playwright 跑 3 spec 至少 1 PASS`：**PASS**
   - CI：`1 passed, 3 skipped`
   - 本地（source `scripts/test/codex-env.sh` 后）：`1 passed, 3 skipped`
8. `CI 上传 playwright-report artifact`：**PASS**
   - `docs/test-reports/_artifacts/BL-TEST-INFRA-IMPORT/gh-run-25151011889/playwright-report/index.html`
9. `tests/setup.ts 启用后单测无回归`：**PASS**
10. `handlers.ts mock 4 个上游 untreated 请求 console warn`：**PASS（静态检查 + 既有单测通过）**
11. `signoff 报告`：**FAIL**
   - 默认本地工作流阻断未关，不能签收

## 唯一阻断项

### 本地 evaluator workflow 仍非默认可用

1. 仓库规定的唯一启动方式仍默认失败：

```bash
bash scripts/test/codex-setup.sh
```

默认输出：

```text
=== [0/5] Killing old process on :3199 ===
=== [1/5] Resetting test database ===
psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory
Is the server running locally and accepting connections on that socket?
```

这说明 `codex-setup.sh` 仍假设本机已有可直接通过默认 socket 访问的 PostgreSQL，但脚本本身没有把 evaluator 引到可复验的默认路径。当前 fix-round 只补了注释，没有补齐默认可运行链路。

2. 裸 E2E 命令仍默认失败：

```bash
npm run test:e2e
```

默认输出：

```text
[playwright] Missing env: E2E_TEST_PASSWORD
```

只有在先 `source scripts/test/codex-env.sh` 后，本地 E2E 才能达到：

```text
3 skipped
1 passed (11.8s)
```

这仍不满足“开箱即验”的 evaluator 体验，也没有符合 AGENTS 中“唯一启动方式”的约束。

## 关键证据

- CI run：`https://github.com/tripplemay/aigcgateway/actions/runs/25151011889`
- CI E2E log 关键行：
  - `Running 4 tests using 2 workers`
  - `3 skipped`
  - `1 passed (20.2s)`
- CI integration log 关键行：
  - `tests/integration/deduct-balance-atomic.test.ts (2 tests) 9757ms`
  - `Duration 10.31s`
- 本地命令结果：
  - `npm run build`：PASS
  - `npm run test`：PASS
  - `npm run test:integration`：PASS
  - `npm run test:coverage`：artifact 生成，但因 baseline 阈值退出 `1`
  - `bash scripts/test/codex-setup.sh`：默认 FAIL
  - `npm run test:e2e`：默认 FAIL
  - `source scripts/test/codex-env.sh && npm run test:e2e`：`1 passed / 3 skipped`

## 交回 Generator 的修复焦点

1. 让 `bash scripts/test/codex-setup.sh` 在 evaluator 默认环境下可直接成功，而不是只给手工 `PGHOST/PGPORT/PGUSER/PGPASSWORD` 注释。
2. 让 `npm run test:e2e` 自带必要测试环境，或在 Playwright 启动链中自动加载 `codex-env.sh`，避免 fresh shell 缺 `E2E_TEST_PASSWORD`。
3. 保持当前已恢复的通过面不回退：CI 8 jobs、integration、Playwright `1 PASS + artifact`。
