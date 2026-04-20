# BL-HEALTH-PROBE-EMERGENCY Verifying Report（2026-04-20）

- 批次：`BL-HEALTH-PROBE-EMERGENCY`
- 阶段：`verifying`
- 执行人：Codex / Reviewer
- 环境：L1 本地（`http://localhost:3099`）

## 结论

- 本地验收结论：**PASS**
- `F-HPE-04` 验收项 1-7 全部通过。
- 验收项 8-9 按规格“可延后”处理：当前生产机仍为旧提交（`96e3ae1`），待该修复上线后执行 24h 账单观测。

## 验收明细（F-HPE-04）

1. `npm run build`：PASS
2. `npx tsc --noEmit`：PASS
3. `npx vitest run`：PASS（`183/183`）
4. disabled text aliased -> reachability：PASS
5. active text aliased -> full：PASS
6. `runScheduledCallProbes` 跳过 DISABLED：PASS
7. fix round 1 `DISABLED -> DEGRADED` 自动复活机制：PASS
8. 生产 24h `day_usage_details` 调用下降 >90%：DEFERRED（待部署后）
9. 生产 OpenAI 日开销 `< $1`：DEFERRED（待部署后）
10. 生成 signoff：PASS

## 关键证据

- `npm run build` 成功（仅历史 lint warning，无阻断错误）
- `npx tsc --noEmit` 成功
- `npx vitest run`：`28 files, 183 passed`
- `npx vitest run src/lib/health/__tests__/scheduler.test.ts --reporter=verbose`：
  - `aliased DISABLED text channel -> reachability + DISABLED_INTERVAL`
  - `aliased ACTIVE text channel -> full + ACTIVE_INTERVAL`
  - `does NOT probe aliased DISABLED text channel`
  - `DISABLED->DEGRADED transient branch` contract test 通过
- 生产部署检查：`ssh ... 'cd /opt/aigc-gateway && git rev-parse --short HEAD'` 返回 `96e3ae1`，低于本地验收提交 `488d1d8`

## 风险与后续

- 当前风险：生产尚未部署该修复，线上费用止血效果尚无动态证据。
- 后续动作（部署后）：
  1. 连续 24h 拉取 chatanywhere `day_usage_details`
  2. 与 `2026-04-16` 的 `535 calls / $11.71` 对比，确认调用降幅 >90%
  3. 确认 OpenAI 当日开销 `< $1`
