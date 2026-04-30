# BL-TEST-INFRA-IMPORT Reverifying Report Round 2（2026-04-30）

- 批次：`BL-TEST-INFRA-IMPORT`
- 阶段：`reverifying`
- 执行人：Codex / Reviewer
- 本地环境：macOS arm64, Node `v25.7.0`, npm `10.8.2`, Docker `29.2.1`（Colima）
- CI：GitHub Actions run `25153902475`（head `54bc5e068927a5f318dee23f6e34da0c434b226a`）

## 结论

- 本轮复验结论：**FAIL**
- F-TI-07 的功能验收面已全部稳定：CI 8 jobs 全绿，unit / build / integration / Playwright / artifact 都通过。
- 仍有 1 个阻断项未关闭：**`codex-setup.sh` 默认启动链在 evaluator 默认环境下仍不自洽**。

## F-TI-07 复验明细

1. `tsc + build + vitest unit + vitest integration`：**PASS**
   - `npm run typecheck`：PASS
   - `npm run build`：PASS
   - `npm run test`：PASS（`68 files, 549 passed, 4 skipped`）
   - `npm run test:integration`：PASS（`1 file, 2 passed`，`Duration 8.77s`）
2. `coverage artifact 生成且 lcov.info 可读`：**PASS**
   - 本地 `coverage/lcov.info` 存在
   - CI artifact 已上传：`docs/test-reports/_artifacts/BL-TEST-INFRA-IMPORT/gh-run-25153902475/coverage/lcov.info`
3. `validate-rollback-sql.sh 通过 64 migrations`：**PASS**
4. `CI 8 jobs 在 main push 全跑（5/8 必 PASS）`：**PASS**
   - 实际 8/8 jobs `success`
5. `deduct-balance-atomic 真跑通`：**PASS**
   - 本地 `2/2` 通过
   - CI integration job `2/2` 通过
6. `Testcontainers 启动 + migrate + cleanup ≤ 90s`：**PASS**
   - 本地：`real 9.145s`
   - CI：integration `Duration 10.31s`
7. `Playwright 跑 3 spec 至少 1 PASS`：**PASS**
   - fresh-shell `env -i HOME=$HOME PATH=$PATH npm run test:e2e -- --list`：PASS，不再报 `Missing env`
   - 本地裸 `npm run test:e2e`：`1 passed / 3 skipped`
   - CI：`1 passed / 3 skipped`
8. `CI 上传 playwright-report artifact`：**PASS**
   - `docs/test-reports/_artifacts/BL-TEST-INFRA-IMPORT/gh-run-25153902475/playwright-report/index.html`
9. `tests/setup.ts 启用后单测无回归`：**PASS**
10. `handlers.ts mock 4 个上游 untreated 请求 console warn`：**PASS（静态检查 + 既有单测通过）**
11. `signoff 报告`：**FAIL**
   - 默认启动链阻断未关，不能签收

## 唯一阻断项

### `bash scripts/test/codex-setup.sh` 仍不能在默认环境中开箱运行

本轮修复把旧的“缺 PostgreSQL socket”问题推进到了新的失败点，但默认链路仍未跑通。

默认执行：

```bash
bash scripts/test/codex-setup.sh
```

实际输出：

```text
=== [PG] no native PostgreSQL → starting docker container aigc-gateway-test-pg ===
docker: Error response from daemon: failed to set up container networking: driver failed programming external connectivity on endpoint aigc-gateway-test-pg ... Bind for 0.0.0.0:5432 failed: port is already allocated
```

补充证据：

- `lsof -nP -iTCP:5432 -sTCP:LISTEN` 显示本机 `5432` 已被占用
- `docker ps` 显示 `kolmatrix-postgres` 已占用 `0.0.0.0:5432->5432/tcp`
- 脚本当前只做了：
  1. 试默认 socket
  2. 不通就起自己的 `aigc-gateway-test-pg`

它没有处理这类真实默认环境：

1. `5432` 已被其他本地 PostgreSQL / 容器占用
2. 该占用服务未必能被默认 socket 检测到
3. 脚本也没有改用别的容器端口，或先探测 `localhost:5432` / 已存在容器是否可复用

因此，AGENTS 规定的唯一启动方式仍然不能保证 evaluator 在默认环境下直接完成本地验收。

## 非阻断通过项

- fresh-shell Playwright env 注入已修复：

```bash
env -i HOME="$HOME" PATH="$PATH" npm run test:e2e -- --list
```

结果：

```text
Total: 4 tests in 4 files
```

- 本地裸 `npm run test:e2e` 已可直接执行并通过：

```text
3 skipped
1 passed (16.9s)
```

- 最新 CI run `25153902475` 的 E2E 实际输出：
  - `Running 4 tests using 2 workers`
  - `1 passed (17.2s)`
  - `3 skipped`

## 交回 Generator 的修复焦点

1. 让 `codex-setup.sh` 正确处理“`5432` 已被占用但默认 socket 不通”的环境：
   - 先探测 `localhost:5432` 是否有可复用 PG
   - 或 docker fallback 改用不冲突端口
   - 或显式处理已存在本地 PostgreSQL / 本地容器的复用策略
2. 保持当前已恢复的通过面不回退：
   - fresh-shell `npm run test:e2e`
   - Playwright `1 passed / 3 skipped`
   - CI 8 jobs success
   - integration / coverage artifact / rollback validate
