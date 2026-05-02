# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Triad Workflow 规则（最高优先级）
读取并严格遵守 @harness-rules.md 中的所有规则。本项目采用的是 [Triad Workflow 框架](https://github.com/tripplemay/harness-template)（已独立为 `tripplemay/harness-template` repo）。

**每次会话启动必须执行（所有 agent 通用）：**
1. 读取 `.auto-memory/MEMORY.md`（项目记忆索引），按需加载记忆文件
2. 读取 `progress.json`，确认当前阶段，再加载对应角色文件（generator.md / evaluator.md / planner.md）

**分支规则：** 代码提交推 `main` 分支。部署由用户在 done 阶段通过 GitHub Actions 手动触发。

**记忆分层：** `.auto-memory/`（git-tracked）是跨 agent 共享记忆源。本机用户偏好记忆存储在 `~/.claude/projects/.../memory/` 中，不入 git。

**规格文档分级：** 新功能批次须有 `docs/specs/` 下的规格文档（硬性）；Bug 修复批次可省略（软性）。

**框架沉淀：** 发现值得沉淀的经验时追加到 `.auto-memory/proposed-learnings.md`（本地暂存）。done 阶段由 Planner 批量同步到 `~/project/harness-template` repo。**本项目不再维护 `framework/` 子目录**（v0.9.0 后已分离）。

---

## Project Overview

AIGC Gateway — AI 服务商管理中台。统一 API 调用抽象（兼容 OpenAI 格式）、11 家服务商适配（OpenAI / Anthropic / DeepSeek / Zhipu / Volcengine / SiliconFlow / OpenRouter / MiniMax / Moonshot / Qwen / StepFun）、全链路审计、预充值计费、健康检查自动降级、MCP 服务器（25 Tools）、控制台中英文双语。

**Tech Stack:** Next.js 14 (App Router) + TypeScript (strict) + PostgreSQL + Prisma + Redis + shadcn/ui + @modelcontextprotocol/sdk + next-intl

## Commands

```bash
# Development
npm run dev                  # Start dev server (default port 3000)
rm -rf .next && npm run dev  # Clean start (required after npm run build)

# Build
npm run build                # Production build (output: standalone)

# Database
npx prisma migrate dev --name <name>  # Create + apply migration
npx prisma generate                    # Regenerate Prisma Client
npx tsx prisma/seed.ts                 # Run seed data

# Lint & Format
npm run lint             # ESLint (next lint)
npm run format           # Prettier write
npx tsc --noEmit         # Full project type check

# SDK (separate package in sdk/)
cd sdk && npm run typecheck  # SDK type check
cd sdk && npm run build      # Build CJS + ESM + .d.ts

# Test Scripts (deterministic regression)
BASE_URL=http://localhost:3199 npx tsx scripts/e2e-test.ts           # Full E2E
BASE_URL=http://localhost:3199 npx tsx scripts/e2e-errors.ts         # Error scenarios
BASE_URL=http://localhost:3199 API_KEY=pk_xxx npx tsx scripts/test-mcp.ts       # MCP full journey
BASE_URL=http://localhost:3199 API_KEY=pk_xxx npx tsx scripts/test-mcp-errors.ts # MCP error scenarios

# MCP Exploratory Audit (discovers new issues)
cd tests/mcp-test && ./run_all_audits.sh    # 8-role audit, outputs reports + assertions JSON
```

**Important:** `npm run build` and `npx next dev` share `.next` directory. Always `rm -rf .next` when switching between them.

## Reference Documents（按需阅读）

涉及对应模块时再读，不需要每次启动都加载：

- **架构详情：** → `docs/dev/architecture.md`（四层 API、请求管道、MCP Server、引擎、认证、健康检查、i18n、数据库、SDK）
- **开发规则：** → `docs/dev/rules.md`（Migration 规则、MCP 开发规则、i18n 规则、设计决策、CI/CD）
- **测试流程：** → `docs/dev/test-lifecycle.md`（探索审计 → 断言沉淀 → 确定性回归，两层测试闭环）
- **规格文档：** → `docs/specs/`（开发时优先查阅）
- **服务商接入：** → `docs/provider/`（新增服务商时参考）
- **设计稿：** → `design-draft/`（UI 页面还原时参考）

## 前端工程纪律 — shadcn 渗透（2026-05-02 立）

新批次触及任何 admin / 用户面页面（修 bug / 加功能 / 重构）时，Generator **顺手将本批次实际触及的代码块内的 raw `<input>` / `<select>` / `<button>` / `<table>` 等替换为 shadcn 组件**（参 `src/components/ui/`，已安装 24 个）。

适用约束：
- 仅替换被本批次实际触及的代码块（**不扩 scope** 改未涉及区域；按"触及即替换"原则渐进改进）
- 替换后保持 design system tokens (`bg-ds-*` / `text-ds-*` / `text-on-*`) + i18n 文案 + a11y 属性 + 既有交互行为不变
- 不主动新建/重构布局，组件壳替换不变结构

退出条款：spec 显式声明 "skip shadcn 渗透" 时跳过（性能关键路径 / 第三方组件 portal/ref 透传等罕见场景）。

集中改造批次：`BL-FE-DS-SHADCN-MINI-A`（backlog medium，3 个 Critical 文件 0.5-1d）+ `BL-FE-DS-SHADCN`（backlog low-deferred，剩余 15+ 文件）。本工程纪律是"渐进路径"，与集中批次互补。
