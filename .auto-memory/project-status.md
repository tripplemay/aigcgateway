---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-INFRA-RESILIENCE：`reverifying`**（fix_rounds=1；stream cancel 闭包修 + 2 regression test）
- Path A 进度 8/11

## round 1 fix（2026-04-19 19:20）
- FAIL 修复：openai-compat wrapper cancel — 把 innerReader 提到 closure，outer.cancel 调 innerReader.cancel（避免 upstream locked）
- +2 regression test（stream-cancel-pattern.test.ts）
- 本地 tsc / vitest 148/148 / build 全过
- PARTIAL 2 项（非代码缺陷，由 Codex 补证）

## 关键发现
- `chat/completions` 流取消链路在动态探针中触发 `Invalid state: ReadableStream is locked`，且上游连接未关闭。
- timeout 修复链路已验证有效：dispatcher/health/openai-stream 均可触发超时收敛。

## 产物
- 用例：`docs/test-cases/bl-infra-resilience-verifying-cases-2026-04-19.md`
- 报告：`docs/test-reports/BL-INFRA-RESILIENCE-verifying-local-2026-04-19.md`
- 动态证据：`docs/test-reports/artifacts/bl-infra-resilience-dynamic-probe-2026-04-19.json`

## 待修复/补证
- 修复 stream cancel 运行期失败并补回归证据。
- 生产补 `rpm Lua` 的 EVAL 命令计数前后对比证据。
- 补 post-process 单请求 `project.findUnique` 计数证据。
