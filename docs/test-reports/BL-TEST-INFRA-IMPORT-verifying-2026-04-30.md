# BL-TEST-INFRA-IMPORT Verifying Report（2026-04-30）

- 批次：`BL-TEST-INFRA-IMPORT`
- 阶段：`verifying`
- 执行人：Codex / Reviewer
- 环境：
  - L1 本地：macOS arm64, Node `v25.7.0`, Docker `29.2.1`（Colima）
  - CI：GitHub Actions run `25148437837`（head `410a9d0771bd1d7adc908c98ba72b7dfe540cd7f`）

## 结论

- 本轮验收结论：**FAIL**
- 可通过项已覆盖：`build` / `typecheck` / unit / coverage artifact / rollback validate / CI 8 jobs / Testcontainers 集成测 / Playwright artifact。
- 阻断项有 2 类：
  1. **E2E 验收未达标**：要求“3 个 spec 至少 1 个 PASS”，实际 **本地 0/3 PASS，CI 0/3 PASS**。
  2. **本地测试脚本可用性缺口**：当前 evaluator 环境下，`npm run test:integration`、`codex-setup.sh`、`npm run test:e2e` 都需要额外环境变量才能跑通，不满足“开箱即验”。

## F-TI-07 验收明细

1. `tsc + build + vitest unit + vitest integration`：**PARTIAL**
   - `npm run typecheck`：PASS
   - `npm run build`：PASS
   - `npm run test`：PASS（`68 files, 549 passed, 4 skipped`）
   - `npm run test:integration`：默认环境 FAIL；加 `DOCKER_HOST=unix:///Users/yixingzhou/.colima/default/docker.sock TESTCONTAINERS_RYUK_DISABLED=true` 后 PASS（`2/2`）
2. `coverage artifact 生成且 lcov.info 可读`：**PASS**
   - 本地 `coverage/lcov.info` 存在
   - CI coverage artifact 已上传
3. `validate-rollback-sql.sh 通过 64 migrations`：**PASS**
4. `CI 8 jobs 在 main push 全跑（5/8 必 PASS）`：**PASS**
   - 实际 8/8 jobs 结论均为 success
5. `deduct-balance-atomic 真跑通`：**PASS**
   - 本地（带 Colima 兼容变量）`2/2` 通过
   - CI integration job 也通过
6. `Testcontainers 启动 + migrate + cleanup ≤ 90s`：**PASS**
   - 本地：`real 2.96s`
   - CI：`Duration 10.71s`
7. `Playwright 跑 3 spec 至少 1 PASS`：**FAIL**
   - CI：`3 failed / 0 passed`
   - 本地：`3 failed / 0 passed`
8. `CI 上传 playwright-report artifact`：**PASS**
9. `tests/setup.ts 启用后单测无回归`：**PASS**
   - 本地 unit suite 通过；当前总数为 `553`（`549 passed + 4 skipped`）
10. `handlers.ts mock 4 个上游 untreated 请求 console warn`：**PASS（代码检查）**
    - `tests/setup.ts` 明确 `server.listen({ onUnhandledRequest: "warn" })`
    - `tests/mocks/handlers.ts` 已覆盖 OpenAI / OpenRouter / Anthropic / SiliconFlow
11. `signoff 报告`：**FAIL**
    - 本轮未达全 PASS，不能产出 signoff

## 关键失败项

### 1. E2E 验收基线未达标

- CI `E2E tests (Playwright)` job 虽为 success，但仅因 `continue-on-error`；实际 Playwright 输出为 `3 failed`。
- CI 失败摘要：
  - `balance-user-level-ui.spec.ts`：`POST /api/auth/register` 连接 `localhost:3199` 被拒绝
  - `project-switcher.spec.ts`：同上
  - `user-profile-center.spec.ts`：同上
- 本地在 3199 服务真实启动后，3 个 spec 仍全部失败：
  - `balance-user-level-ui.spec.ts`：`POST /api/projects/{id}/recharge` 期望 `201`，实际 `404`
  - `project-switcher.spec.ts`：`No project yet` 30s 内未出现
  - `user-profile-center.spec.ts`：`Security Log` 中未出现 `PlaywrightUICheck`

### 2. 本地测试脚本存在环境契约缺口

- `npm run test:integration` 在默认本地环境失败：
  - `Could not find a working container runtime strategy`
  - 根因是 Colima socket 不在 `/var/run/docker.sock`
- 补 `DOCKER_HOST=unix:///Users/yixingzhou/.colima/default/docker.sock` 后，Ryuk 仍尝试连 `/var/run/docker.sock`
- 只有再加 `TESTCONTAINERS_RYUK_DISABLED=true` 才能本地通过 integration
- `bash scripts/test/codex-setup.sh` 默认失败：
  - 首次失败：本机无 PostgreSQL socket
  - 用 `PGHOST/PGUSER/PGPASSWORD` 指向现有容器后，再次失败于 seed：缺 `ADMIN_SEED_PASSWORD`
- `npm run test:e2e` 在独立 shell 默认失败：
  - `Missing env: E2E_TEST_PASSWORD`

## 关键证据

- 本地日志：
  - `docs/test-reports/_artifacts/BL-TEST-INFRA-IMPORT/unit.log`
  - `docs/test-reports/_artifacts/BL-TEST-INFRA-IMPORT/coverage.log`
  - `docs/test-reports/_artifacts/BL-TEST-INFRA-IMPORT/integration.log`
  - `docs/test-reports/_artifacts/BL-TEST-INFRA-IMPORT/integration-colima-debug.log`
  - `docs/test-reports/_artifacts/BL-TEST-INFRA-IMPORT/integration-colima-noryuk.log`
  - `docs/test-reports/_artifacts/BL-TEST-INFRA-IMPORT/e2e-local.log`
- CI artifact：
  - `docs/test-reports/_artifacts/BL-TEST-INFRA-IMPORT/gh-run-25148437837/coverage/lcov.info`
  - `docs/test-reports/_artifacts/BL-TEST-INFRA-IMPORT/gh-run-25148437837/playwright-report/index.html`
- CI run：
  - `https://github.com/tripplemay/aigcgateway/actions/runs/25148437837`

## 建议修复方向（交 Generator）

1. 修正本地 test harness：
   - `scripts/test/codex-env.sh` 增加 `ADMIN_SEED_PASSWORD`、`ADMIN_TEST_PASSWORD`、`E2E_TEST_PASSWORD`
   - 针对 Colima / 非 `/var/run/docker.sock` 环境补 `DOCKER_HOST` / Testcontainers 兼容说明或脚本兜底
2. 修正 E2E CI 启动链：
   - 确认 Playwright webServer 在 CI 内确实能把应用拉起到 `localhost:3199`
   - 若依赖 `3199`，需要显式导出 `PORT` / `E2E_PORT`，避免 job 绿但 tests 全红
3. 修正现有 3 个 E2E spec 或其前置数据流：
   - `balance-user-level-ui` 的 recharge API 404
   - `project-switcher` 初始空态断言不成立
   - `user-profile-center` security log 断言不成立
