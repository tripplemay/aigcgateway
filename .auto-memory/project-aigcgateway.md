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
- **P3-1 完成（2026-04-03）：** Prompt 模板治理 25/25 功能全部 PASS（数据模型、注入引擎、16 API 路由、MCP 5 新工具、控制台 3 页面、侧边栏、i18n）

## 最近修复（2026-04-03）

- `post-process.ts`: 成功调用但 sellUsd=0 时打印 console.warn 告警
- `openai-compat.ts imageViaChat`: 重写 — multimodal parts → base64 → URL 正则 → 全部失败抛错
- `list-logs.ts search`: 改为 jsonb_array_elements 提取纯文本匹配
- `keys/page.tsx search`: 改为 uncontrolled input（ref + searchTick），消除 DOM/State 不同步

## P3-1 交付记录

- 规格文档：`docs/specs/AIGC-Gateway-Template-Governance-P3-1-Spec.md`
- Harness 状态：`progress.json` status=done, 25/25 PASS
- 后端提交：`ea01617` feat: P3-1 Prompt 模板治理后端基建（F001-F017）
- 前端提交：`edbc55d` feat: P3-1 控制台模板治理前端（F018-F025）

## 已知遗留问题

1. SiliconFlow 价格补全未生效（aiEnriched=0）
2. Anthropic 直连 401
3. 同步耗时偏高（~264s）
4. Chat 计费 $0 — Channel sellPrice 为 {} 或 0，根因与 #1 同源（定价数据缺失），需管理员手动补充
5. 图片生成 — 代码已修复（抛错），但 Gemini via chat 的实际图片返回格式仍需验证

## 已知限制（决定不修复）

- API Keys 搜索框：Chrome MCP 程序化设值 `input.value=""` 不触发浏览器事件，导致自动化测试中清空搜索后列表不恢复。普通用户（键盘、鼠标、浏览器原生×按钮、close 按钮）不受影响。标记为"仅影响自动化测试工具"。

## 生产环境

- 控制台：`https://aigc.guangai.ai`（备用 `http://154.40.40.116:8301`）
- API：`https://aigc.guangai.ai/v1/`
- MCP：`https://aigc.guangai.ai/mcp`
- Stitch 设计稿项目 ID: 13523510089051052358

### Codex 测试账号（2026-04-03 创建，无需重复创建）

**Admin:** `codex-admin@aigc-gateway.local` / `Codex@2026!`
- API Key: `pk_aa6b13e75918e44a1b7247bb91b01777ac0446b7a5e8eaa2dedbfa0d6a5aaa03`

**Developer:** `codex-dev@aigc-gateway.local` / `Codex@2026!`
- Project ID: `codex-dev-project-001`
- API Key: `pk_1ec762a2f01e514a9880e45708a962b9434d804b4c5c1629939d93a3e40414e9`

两账号初始余额各 $6.85（≈50 CNY）

## 关键开发规则

- Schema 变更 + migration + 引用代码必须同一 commit，否则 CI tsc 会死锁
- git pull 后 schema 变了必须 `npx prisma generate`
- 设计稿从 Stitch MCP 下载后存到 `design-draft/{屏幕名}/code.html + screen.png`
- 前端页面重构必须按原型 code.html 1:1 复刻 DOM 结构和 class

**Why:** 以上状态供下次会话快速定位当前进度，避免重新梳理
**How to apply:** 开始新任务前先对照此文件确认当前阶段，继续未完成的工作
