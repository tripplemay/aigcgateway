---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-INFRA-RESILIENCE：`fixing`（reverifying round 2）**
- Path A 进度 8/11

## Round 2 复验（2026-04-19）
- L1 本地：14 项通过
- 已修复确认：stream cancel 动态证据通过（上游连接正常关闭）
- 已补证确认：post-process 单次 success 仅 1 次 project.findUnique
- 质量门禁：targeted vitest 14/14、full vitest 148/148、tsc/build 全通过

## 唯一阻断项
- 生产验收 #8（rpm Lua）阻断：
  - 生产机 `/opt/aigc-gateway/src/lib/api/rate-limit.ts` 仍是旧 `pipeline` 实现
  - 生产 smoke 探针 `eval_calls_delta=0`
  - 结论：生产未部署本批次 Lua 原子化代码，需部署后再复验

## 产物
- 复验报告：`docs/test-reports/BL-INFRA-RESILIENCE-reverifying-local-2026-04-19-round2.md`
- 动态证据：`docs/test-reports/artifacts/bl-infra-resilience-dynamic-probe-2026-04-19-r2.json`
- 生产阻断证据：`docs/test-reports/artifacts/bl-infra-resilience-prod-rpm-probe-2026-04-19-r2.txt`
