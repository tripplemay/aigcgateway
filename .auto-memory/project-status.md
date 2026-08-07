---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-IMG-GUANGTECH-CHANNEL**（**done**，fix_rounds=1）— 2026-08-07 Codex 复验签收；
  首验 4 条缺陷全部关闭，复现脚本 3/6 → 6/6 PASS，全量 vitest 813 passed/4 skipped。
- 生产正向链路已证实：`gpt-image-1/1.5/2` 均可真实生图、代理 PNG 可读，CallLog
  成本/售价 `$0.068836/$0.082603`，扣费各 `$0.082603`；REST/MCP 均可发现。
- 修复要点：失败 probe 现阻断 apply 并非零退出；priority/supportedSizes 复跑收敛；
  新增图片头解析取真实像素——上游实回 **PNG 1254x1254**（非请求的 1024x1024），
  故三个 alias 均**不声明** `supported_sizes`，生产虚假元数据已清除；
  存量偏好回填改为数据迁移 `20260807_backfill_notification_preferences`（部署即自动跑）。
- 验收临时生产 Key 已吊销；签收：`docs/test-reports/BL-IMG-GUANGTECH-CHANNEL-signoff-2026-08-07.md`。
## 既有部署风险
- **本批次代码 + BL-SEC-HOTFIX-2608 均未部署**：生产 app 启动于 2026-07-27，C1 支付伪造、
  C6 零计费旁路、H13 SSE 丢帧仍暴露；F-GTI-02 的 migration/通知/UI 也未上线。
  下次 Deploy 会一并带上两批，需用户手动触发。

## 挂起批次
- **BL-IMG-I2I-VISION**（8/9）归档于 `docs/archive/{features,progress}-BL-IMG-I2I-VISION-parked-2026-08-04.json`；
  还原前需解 seedream-4-5 DISABLED、OpenRouter 欠费、provision 未跑三项阻塞。

## 后续
- 安全审查余项见 `docs/code-review/backend-fullscan-2026-08-04.md`；C3/C4/H1/H2/H9 进入
  `BL-SEC-BILLING-GATE`，其余进入 `BL-SEC-GUARDRAIL-PARITY`。
- OpenRouter 仍欠费；生产 admin 密码仍需用户轮换并清理共享记忆中的明文。
- Admin UI 渲染验证仍是缺口（Codex 两轮均无可用浏览器实例）；待裁决（见 proposed-learnings）：
  dispatcher 无偏好行时回退角色默认值，根治「新事件类型需回填」。
