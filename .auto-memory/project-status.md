---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-INFRA-RESILIENCE：`fixing`**（Codex 首轮验收完成，F-IR-04 未过）
- Path A 进度 8/11

## 本轮验收结论（2026-04-19）
- L1 结果：`PARTIAL`
- 通过：11（含 build/tsc/vitest 全绿）
- 失败：1（stream cancel 动态探针）
- 部分：2（生产 rpm Lua EVAL 证据不足；post-process 去重缺运行计数）

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
