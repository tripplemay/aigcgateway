---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-IMG-GUANGTECH-CHANNEL** 首验未通过，已交回 Generator 修复。
- 生产正向链路已证实：`gpt-image-1/1.5/2` 均可真实生图、代理 PNG 可读，
  CallLog 成本/售价为 `$0.068836/$0.082603`，扣费各 `$0.082603`；REST/MCP 均可发现。
- F-GTI-01 待修：失败 probe 仍会 apply；复跑不收敛 priority/supportedSizes；请求
  `1024x1024` 实际返回 `1254x1254`，probe 未验尺寸却声明支持 1024。
- F-GTI-02 待修：部署不自动回填新通知偏好；生产 5 个 ADMIN 中 0 个有新事件行，
  dispatcher 会静默丢弃通知。完整证据见首验报告。
- 验收临时生产 Key 已吊销；F-GTI-02 尚未部署。

## 既有部署风险
- **BL-SEC-HOTFIX-2608 已签收但尚未部署**：生产 app 仍跑修复前代码，C1 支付伪造、
  C6 零计费旁路、H13 SSE 丢帧仍暴露；需用户手动触发 Deploy。

## 挂起批次
- **BL-IMG-I2I-VISION**（8/9）归档于 `docs/archive/{features,progress}-BL-IMG-I2I-VISION-parked-2026-08-04.json`；
  还原前需解 seedream-4-5 DISABLED、OpenRouter 欠费、provision 未跑三项阻塞。

## 后续
- 安全审查余项见 `docs/code-review/backend-fullscan-2026-08-04.md`；C3/C4/H1/H2/H9 进入
  `BL-SEC-BILLING-GATE`，其余进入 `BL-SEC-GUARDRAIL-PARITY`。
- OpenRouter 仍欠费；生产 admin 密码仍需用户轮换并清理共享记忆中的明文。
