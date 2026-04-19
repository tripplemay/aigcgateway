# BL-INFRA-RESILIENCE Verifying Report (L1 Local)

## 结论
- 总体：`PARTIAL / 进入 fixing`
- 通过：11
- 部分通过（证据不足）：2
- 失败：1

## 执行环境
- 本地测试端口：`localhost:3099`
- 启动方式：`bash scripts/test/codex-setup.sh` + `bash scripts/test/codex-wait.sh`
- 关键动态证据：`docs/test-reports/artifacts/bl-infra-resilience-dynamic-probe-2026-04-19.json`

## 15 项验收结果
1. PASS — `fetchWithTimeout` 单测通过（targeted vitest）。
2. PASS — dispatcher webhook hang 在约 10s 自动超时关闭。
3. PASS — health alert webhook hang 在约 10s 返回。
4. PASS — openai-compat 流式场景（headers 已到达、body 挂起）仍触发 timeout。
5. PASS — chat stream 异常路径存在 `await reader.cancel(err)`（`route.ts:366`）。
6. FAIL — 动态探针中 `reader.cancel` 触发 `Invalid state: ReadableStream is locked`，且上游连接未观察到关闭（见动态证据 `stream-cancel-propagates-upstream=false`）。
7. PASS — rpm 并发 10 请求 limit=5，恰 5 过/5 拒（`rate-limit-rpm.test.ts`）。
8. PARTIAL — 生产 SSH smoke 可执行 `checkRateLimit`，但未形成“Redis EVAL 计数增长”的确定性证据，需补强。
9. PASS — reconcile batch 契约测试通过（DB round-trip 约束用 mock 计数验证）。
10. PASS — `list-actions` versions `take:10` 测试通过。
11. PARTIAL — `post-process` 代码已合并 project 查询（`post-process.ts:175-182`），但缺请求级运行期计数证据。
12. PASS — `npm run build` 通过。
13. PASS — `npx tsc --noEmit` 通过。
14. PASS — `npx vitest run` 全量 146/146 通过。
15. N/A — 本轮非全 PASS，不生成 signoff。

## 主要问题
- F-IR-02/F-IR-04（严重）
  - 现象：`stream cancel` 动态验证失败。
  - 证据：`docs/test-reports/artifacts/bl-infra-resilience-dynamic-probe-2026-04-19.json` 中：
    - `stream-cancel-propagates-upstream.pass=false`
    - `cancelError=Invalid state: ReadableStream is locked`
    - `requestSamples` 对应 `/stream-one-chunk` 的 `closedAt=null`
  - 影响：客户端取消后，上游流可能未及时释放，存在连接/资源泄漏风险。

## 证据清单
- `docs/test-reports/artifacts/bl-infra-resilience-dynamic-probe-2026-04-19.json`
- `docs/test-reports/artifacts/bl-infra-resilience-targeted-vitest-2026-04-19.log`
- `docs/test-reports/artifacts/bl-infra-resilience-full-vitest-2026-04-19.log`
- `docs/test-reports/artifacts/bl-infra-resilience-tsc-2026-04-19.log`
- `docs/test-reports/artifacts/bl-infra-resilience-build-2026-04-19.log`
