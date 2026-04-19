# BL-INFRA-RESILIENCE Reverifying Report (Round 2)

## 结论
- 总体：`PARTIAL (BLOCKED by production deploy)`
- 通过：14
- 阻断：1

## 执行摘要
- 原 Round 1 FAIL（stream cancel）已复验通过。
- 本地 L1 验收项全部通过（含动态探针、targeted/full vitest、tsc、build）。
- 唯一阻断项是生产验收 #8：线上代码仍为旧版 `rpm pipeline`，未具备 Lua EVAL 实现，无法完成“生产 Lua smoke 通过”的签收条件。

## 15 项验收结果
1. PASS — fetchWithTimeout 单测通过。
2. PASS — dispatcher webhook hang 10s 超时。
3. PASS — health alert webhook hang 10s 超时。
4. PASS — openai-compat stream body 挂起后超时触发。
5. PASS — stream 异常路径 reader.cancel 存在且生效。
6. PASS — stream cancel 级联上游关闭（Round 1 FAIL 已修复）。
7. PASS — rpm 并发限流 5/10 行为正确（单测通过）。
8. BLOCKED — 生产验证未通过：线上 `rate-limit.ts` 仍为 pipeline 实现，非 Lua EVAL。
9. PASS — reconcile batch 契约测试通过。
10. PASS — list-actions versions `take:10` 验证通过。
11. PASS — post-process 单次 success 仅 1 次 `project.findUnique`（动态探针）。
12. PASS — `npm run build` 通过。
13. PASS — `npx tsc --noEmit` 通过。
14. PASS — `npx vitest run` 全量 148/148 通过。
15. N/A — 因 #8 阻断，本轮不生成 signoff。

## 阻断详情（#8）
- 生产探针输出：`eval_calls_delta=0`。
- 生产代码抽样：`/opt/aigc-gateway/src/lib/api/rate-limit.ts` 仍存在 `redis.pipeline + zcard + zadd` 路径。
- 结论：当前生产机未部署本批次 Lua 原子化代码，故无法完成该条生产验收。

## 证据
- `docs/test-reports/artifacts/bl-infra-resilience-dynamic-probe-2026-04-19-r2.json`
- `docs/test-reports/artifacts/bl-infra-resilience-post-process-probe-2026-04-19-r2.json`
- `docs/test-reports/artifacts/bl-infra-resilience-targeted-vitest-2026-04-19-r2.log`
- `docs/test-reports/artifacts/bl-infra-resilience-full-vitest-2026-04-19-r2.log`
- `docs/test-reports/artifacts/bl-infra-resilience-tsc-2026-04-19-r2.log`
- `docs/test-reports/artifacts/bl-infra-resilience-build-2026-04-19-r2.log`
- `docs/test-reports/artifacts/bl-infra-resilience-prod-rpm-probe-2026-04-19-r2.txt`
- `docs/test-reports/artifacts/bl-infra-resilience-prod-rate-limit-grep-2026-04-19-r2.txt`
