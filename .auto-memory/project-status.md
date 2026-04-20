---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-HEALTH-PROBE-EMERGENCY：`verifying`**（Generator 3/3 done，等 Codex F-HPE-04 10 项 + 生产 24h 观察）
- Path A 主线 11/11 已完成；本批次为独立 emergency 批次不计入 Path A

## 本批次交付（Generator）
- scheduler.ts 抽 pure fn：planChannelCheck + shouldCallProbeChannel 便于测试 + 审查
- F-HPE-01：DISABLED text aliased 从 'full'（真实 chat $$）→ 'reachability'（零成本 GET /models），interval 30min 不变
- F-HPE-02：shouldCallProbeChannel DISABLED 短路，防 CALL_PROBE 交叉漏洞
- F-HPE-03：+11 regression test 含 contract test 锁定 handleFailure 的 DISABLED→DEGRADED 分支不被误删
- 本地 tsc / vitest 183/183（+11）/ build 全过
- 预期：上游日开销从 $10+ 降到 < $1

## 紧急原因（2026-04-20）
- 排查 gpt-image bug 时查 chatanywhere 上游（sk-B2nJ* API key）发现 04-16 调用 535 次/$11.71，Gateway 只记 7 次
- 根因：health scheduler 对 DISABLED text channels 每 30min 真实 chat(max_tokens:200) 扣费
- 每 channel 48 次/天 × ~15 channels = 每天 $10+ 流血
- OpenAI 账户 04-19 告急正是这个原因耗尽

## 本批次止血目标
- scheduler.ts:267-275 DISABLED text channel 从 full check 降为 reachability check（零成本 GET /models）
- scheduler.ts:319-327 runScheduledCallProbes 跳过 DISABLED
- 保留 fix round 1 的 DISABLED→DEGRADED 自动复活机制不动
- 生产部署后 24h 观察 chatanywhere 调用数预期降 > 90%

## 紧急止血选项（上线前可选）
- `CALL_PROBE_ENABLED=false` env 临时关闭 probe
- 或用户判断自行重启暂停 scheduler

## Backlog 新增（post-path-a）
- **BL-BILLING-AUDIT**（1.5-2d，紧接本批次）：修 channelId 错位 / image costPrice 缺失 / failover 中间审计 / auth_failed 告警 / 错误文本转译

## Path A 主线（已完成 11 批 + 1 插入）
- ✅ P0 安全 5 批 / P0 前端 1 批 / P1 质量 1 批 / P1 数据 2 批 / P2 细节 2 批
- 延后候选：INFRA-GUARD-FOLLOWUP / FE-DS-SHADCN / FE-QUALITY-FOLLOWUP / PAY-DEFERRED

## Framework 铁律（v0.7.3 → harness-template v0.9.3 已同步）
1. Planner spec 涉及代码细节 Read 源码 + file:line 引用
1.1. acceptance 的"实现形式"与"语义意图"分离
2. Code Review 断言按线索，源码+生产数据双路核实
2.1. 协议返回形式断言标明协议层

## 生产状态
- HEAD `fcba598`（Path A 归档后）
- 10 批 Path A 代码待用户触发 deploy
- **每天 ~$10 health probe 流血直到本批次上线或紧急止血**
