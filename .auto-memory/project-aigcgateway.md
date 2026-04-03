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
- 性能优化：Redis 缓存迁移 + PM2 cluster 已签收 PASS
- MCP L2 集成：读类 Tools + 错误场景 PASS，写类链路（chat/image 计费）受定价数据缺失影响

## 最近修复（2026-04-03）

- `post-process.ts`: 成功调用但 sellUsd=0 时打印 console.warn 告警
- `openai-compat.ts imageViaChat`: 重写 — multimodal parts → base64 → URL 正则 → 全部失败抛错
- `list-logs.ts search`: 改为 jsonb_array_elements 提取纯文本匹配
- `keys/page.tsx search`: 改为 uncontrolled input（ref + searchTick），消除 DOM/State 不同步

## 已知遗留问题

1. SiliconFlow 价格补全未生效（aiEnriched=0）
2. Anthropic 直连 401
3. 同步耗时偏高（~264s）
4. Chat 计费 $0 — Channel sellPrice 为 {} 或 0，根因与 #1 同源（定价数据缺失），需管理员手动补充
5. 图片生成 — 代码已修复（抛错），但 Gemini via chat 的实际图片返回格式仍需验证

## 已知限制（决定不修复）

- API Keys 搜索框：Chrome MCP 程序化设值 `input.value=""` 不触发浏览器事件，导致自动化测试中清空搜索后列表不恢复。普通用户（键盘、鼠标、浏览器原生×按钮、close 按钮）不受影响。标记为"仅影响自动化测试工具"。

## Staging / 生产环境

- URL: https://aigc.guangai.ai
- Stitch 设计稿项目 ID: 13523510089051052358
- 有余额的 API Key 已配置，可用于 L2 测试

## 关键开发规则

- Schema 变更 + migration + 引用代码必须同一 commit，否则 CI tsc 会死锁
- git pull 后 schema 变了必须 `npx prisma generate`
- 设计稿从 Stitch MCP 下载后存到 `design-draft/{屏幕名}/code.html + screen.png`
- 前端页面重构必须按原型 code.html 1:1 复刻 DOM 结构和 class

**Why:** 以上状态供下次会话快速定位当前进度，避免重新梳理
**How to apply:** 开始新任务前先对照此文件确认当前阶段，继续未完成的工作
