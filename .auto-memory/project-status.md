---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-IMAGE-PARSER-FIX：`reverifying`**（fix round 1 完成，F-IPF-04 透传 images + HTTP-layer mock 单测）
- 上一批次 BL-HEALTH-PROBE-LEAN：done（生产已部署，$15/day → ~$0.4/day 实测）
- Path A 主线 11/11 完成；EMERGENCY / LEAN / IMAGE-PARSER-FIX 独立 emergency 链

## round 1 fix（2026-04-21 01:21）
- openai-compat normalizeChatResponse 透传 images 字段（Array.isArray 保护）
- types.ts ChatChoice.message 补 images?: ChatMessageImage[]
- +2 HTTP-layer mock 单测（mock global.fetch 返回原始 OpenRouter body 验证全链路）
- 本地 tsc / vitest 224/224（+2）/ build 全过
- 踩坑记录：quirks config 必须是数组或 {flags:[...]}，单测首写用对象未命中 imageViaChat 分支 → 印证 HTTP 层 mock 能立即暴露 contract mismatch

## Fix Round 1 根因（非猜测，生产硬证据）
- 生产 HEAD cbcfb1e（Stage 0 代码已部署 16:51 UTC），pm2 logs 16:56-16:57 UTC 仍持续输出 `[imageViaChat] extraction failed`
- 真因：`src/lib/engine/openai-compat.ts:362-386` **normalizeChatResponse 剥掉 message.images 字段**，Stage 0 读 msg?.images 永远 undefined → fallback Stage 1-4 失败
- 次级：F-IPF-02 单测 mock chatCompletions 直接返回（已含 images），绕过 normalize 层 → 测试绿但生产红

## Fix Round 1 修复（F-IPF-04）
- normalizeChatResponse 透传 `...(Array.isArray(msg?.images) ? { images: msg.images } : {})`
- ChatCompletionResponse 类型补 `images?: Array<...>`
- 新单测从 HTTP 层 mock（`global.fetch` 或 `fetchWithProxy`）验证 images 字段穿透 normalize 全链路
- F-IPF-01 Stage 0 逻辑保留不动（normalize 修好后自动生效）
- F-IPF-03 重跑 11 项（含生产 smoke 7-10）

## Framework Learning（待沉淀 harness-template）
- 单测 mock 层级过高导致 "测试绿生产红"：涉及多层调用链（parser + normalize 等）的修复，单测必须从 HTTP/网络边界层 mock，而非中间层
- 已追加到 .auto-memory/proposed-learnings.md 待 done 阶段批量同步

## 次生 bug（已归入 BL-BILLING-AUDIT）
- trc_cvu84f channel=openai 但 errorMessage=openrouter 的 text-instead-of-image
- trc_kju9fxz5 channel=openrouter 但 errorMessage=chatanywhere 的 模型无返回结果
- 均为 channelId 错位 bug（failover 时 errorMessage 来自前一 attempt，channelId 记成后一 attempt）

## Framework 铁律（v0.7.3 → harness-template v0.9.3 已同步）
1. Planner spec 涉及代码细节 Read 源码 + file:line 引用
1.1. acceptance 的"实现形式"与"语义意图"分离
2. Code Review 断言按线索，源码+生产数据双路核实
2.1. 协议返回形式断言标明协议层

## 生产状态
- HEAD `cbcfb1e`（IMAGE-PARSER-FIX signoff）已部署但修复未真正生效
- KOLMatrix 三模型仍失败，每小时 ~$0.3 流血至 F-IPF-04 部署
