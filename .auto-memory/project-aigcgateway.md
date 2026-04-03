---
name: project-aigcgateway
description: AIGC Gateway 项目当前阶段、技术架构和开发状态
type: project
---

## 项目概况

AIGC Gateway — AI 服务商管理中台。统一 API 调用抽象（兼容 OpenAI 格式）、7 家服务商适配、全链路审计、预充值计费、健康检查自动降级、MCP 服务器、控制台中英文双语。

**Tech Stack:** Next.js 14 (App Router) + TypeScript + PostgreSQL + Prisma + Redis + shadcn/ui + @modelcontextprotocol/sdk + next-intl

**仓库目录:** aigcgateway（已连接为 Cowork 工作目录）

## 当前开发状态（截至 2026-04-03）

- P1 完成：项目骨架 + 7 家服务商 + API 网关 + 健康检查 + SDK + 认证计费支付 + 控制台 17 页
- P1 优化补丁完成：模型自动同步引擎 + 模型/通道 UI 重构 + API Keys 权限扩展 + 全站性能优化（14项）+ 全站 UI 重构（Stitch 设计稿，16/18 页已完成，Login/Register 待办）
- P2 完成：MCP 服务器 (7 Tools) + 控制台国际化 (20页 + 259 key) + 集成测试

## 最近已修复的 Bug（2026-04-03）

**Bug 1 — list-logs.ts 搜索列错误**
- 文件：`src/lib/mcp/tools/list-logs.ts` line 56
- 原因：search SQL 搜 `traceId` / `modelName` 而非 prompt 内容
- 修复：改为 `"promptSnapshot"::text ILIKE ... OR "responseContent" ILIKE ...`

**Bug 2 — imageViaChat URL 正则过严**
- 文件：`src/lib/engine/openai-compat.ts` imageViaChat 方法
- 原因：正则只匹配带 `.png/.jpg/.jpeg/.webp/.gif` 扩展名的 URL，Gemini/Google Storage 返回无扩展名链接导致 `images: []`
- 修复：三层降级匹配（带扩展名 URL → 任意 HTTPS URL → 空则返回 `data: []`）

**Config 问题（未修复，需手动处理）**
- deepseek/v3 channel 在生产库的 `sellPrice.inputPer1M` / `outputPer1M` = 0
- 需要管理员在控制台 → Channels 里手动填写正确价格

## Staging 环境

- URL: https://aigc.guangai.ai
- 有余额的 API Key 已配置在生产环境，可用于 L2 测试

**Why:** 以上状态供下次会话快速定位当前进度，避免重新梳理
**How to apply:** 开始新任务前先对照此文件确认当前阶段，继续未完成的工作
