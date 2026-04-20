---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-IMAGE-PARSER-FIX：`done`**（Codex 已签收：本地 1-6/11 PASS，7-10 待部署后 smoke）
- 上一批次 BL-HEALTH-PROBE-LEAN：done（生产已部署，$15/day → ~$0.4/day 实测）
- Path A 主线 11/11 完成；EMERGENCY / LEAN / IMAGE-PARSER-FIX 独立 emergency 链

## 本批次交付（Generator）
- F-IPF-01 imageViaChat 新增 Stage 0 识别 message.images[]（OpenRouter 新协议）
- F-IPF-02 +6 单测（新路径 2 + Stage 1/2 回归 + 全失配 + images 空数组 fallback）
- 本地 tsc / vitest 222/222（+6）/ build 全过
- 预期部署后：gpt-5-image / gpt-5-image-mini / gemini-3-pro-image 三模型恢复可用

## 本批次根因（非猜测，证据链完整）
- 生产 pm2 logs [imageViaChat] extraction failed 覆盖 openrouter 三模型（gpt-5-image / gpt-5-image-mini / gemini-3-pro-image-preview）
- Provider config openrouter imageViaChat:true + image_via_chat_modalities quirk → 走 imageViaChat() 函数
- 直连 OpenRouter 实测三模型返回 message.images[{type:image_url,image_url:{url:data:image/png;base64,...}}]，usage.cost 确认扣费
- 源码 openai-compat.ts:411-542 imageViaChat 4 个 stage 未检查 msg.images 字段

## 修复方案（最小 10 行）
- F-IPF-01 imageViaChat 在 Stage 1 前插入 Stage 0 识别 msg.images[]
- F-IPF-02 单测 6 条（新路径 + 旧路径回归）
- F-IPF-03 Codex 11 项验收（含部署后 smoke test）

## 上一批次证据（LEAN 生效）
- 2026-04-21 2h 内 OpenRouter 账单 $1.08，其中 KOLMatrix 4 次失败 $0.65 + 直连测试 $0.38 + probe ~$0.05
- 换算 probe 日成本 ~$0.4，降幅 ~85%（baseline 04-16 $2.71/day）
- F-HPL-02 昂贵模型豁免生效：过去 5000 行日志无 gpt-4o-mini-search-preview probe

## Backlog 紧接
- **BL-BILLING-AUDIT**（1.5-2d，follows IMAGE-PARSER-FIX）：channelId 错位 / image costPrice / failover 中间审计 / auth_failed 告警 / 错误文本转译（本次发现的次生 bug 已归入）
- KOLMatrix 验证用 curl 已在 spec §F-IPF-03 步骤 7-9

## Framework 铁律（v0.7.3 → harness-template v0.9.3 已同步）
1. Planner spec 涉及代码细节 Read 源码 + file:line 引用
1.1. acceptance 的"实现形式"与"语义意图"分离
2. Code Review 断言按线索，源码+生产数据双路核实
2.1. 协议返回形式断言标明协议层

## 生产状态
- HEAD `2389de4`（LEAN signoff）已部署，pm2 起始 2026-04-20 14:38 UTC
- IMAGE-PARSER-FIX 已签收（本地 HEAD `88bc1d4`），待部署后补 7-10 smoke 证据
- KOLMatrix 每小时烧 ~$0.3 失败图片调用（直到 hotfix 部署）
