---
name: project-aigcgateway
description: AIGC Gateway 项目当前阶段、技术架构和开发状态
type: project
---

## 项目概况

AIGC Gateway — AI 服务商管理中台。统一 API 调用抽象（兼容 OpenAI 格式）、7 家服务商适配、全链路审计、预充值计费、健康检查自动降级、MCP 服务器、控制台中英文双语。

**Tech Stack:** Next.js 14 (App Router) + TypeScript + PostgreSQL + Prisma + Redis + shadcn/ui + @modelcontextprotocol/sdk + next-intl

## 当前开发状态（截至 2026-04-06）

**最新完成批次：** `ui-redesign-templates-actions`（9/9 PASS，fix_rounds=3）
**Harness 状态：** done
**签收报告：** `docs/test-reports/ui-redesign-templates-actions-local-signoff-2026-04-06.md`

### 当前进行中批次

- `dx-provider-fixes`
  - 当前阶段：`fixing`
  - 最近一次 Evaluator 复验结论：本地 L1 部分通过
  - 通过：`F-DPF-01` 上游错误脱敏、`F-DPF-03` capabilities unknown 清理、`F-DPF-04` MCP description 去除硬编码模型名、`F-DPF-05` 新项目 API Key 下 `list_models` 恢复返回 14 个模型
  - 失败：`F-DPF-02` 4 个 Provider 本地 sync 仍报 401，未创建 Channel
  - 复验报告：`docs/test-reports/dx-provider-fixes-local-reverification-2026-04-06.md`

### 里程碑总览

- P1：项目骨架 + 7 家服务商 + API 网关 + 健康检查 + SDK + 认证计费支付 + 控制台 17 页
- P1 优化补丁：模型自动同步 + Stitch UI 重构（16/18 页，Login/Register 待办）+ 性能优化 14 项
- P2：MCP 服务器 (13 Tools) + 控制台国际化 (20页 + 259 key) + 集成测试
- P3-1：Prompt 模板治理（25/25 PASS）→ 后重构为 Action + Template 两层架构（p4-action-template 18/18 PASS）
- mcp-dx-round2：白名单收紧至 28 模型 + list_models 去重 + capabilities 补全（10/10 PASS）
- bugfix-model-cleanup：孤立 Model 清理 + MCP 错误码修复（5/5 PASS）
- **ui-redesign-templates-actions：7 个模板/动作页面按 Stitch 设计稿 1:1 重构（9/9 PASS）**

### 本轮框架升级（2026-04-06）

1. **角色动态分配（方向 B）：** `.agent-id` 文件 + progress.json `role_assignments` 支持跨机器多 agent 分工
2. **`.agent-id` 结构化格式：** `cli: Andy` / `codex: Reviewer`，同机器区分 CLI 和 Codex
3. **记忆分层：** 共享层 `.auto-memory/`（git-tracked）存项目状态，本机层存用户偏好
4. **会话结束记忆检查点：** 所有角色、所有阶段、每次会话结束时检查并更新共享记忆
5. **Planner 增强：** §0a 读用户反馈 + §2.5 Stitch 设计稿检查 + §5 角色分配询问
6. **Generator 增强：** UI 重构必须先读原型 HTML 再编码（design-draft 是 source of truth）
7. **用户反馈目录：** `docs/test-reports/user_report/` 纳入 Planner 启动必读

## Backlog（5 条待处理）

| ID | 优先级 | 标题 |
|---|---|---|
| BL-020 | critical | 上游错误透传泄露供应商凭据 |
| BL-021 | critical | deepseek/zhipu/anthropic/siliconflow 四个 Provider sync 未创建 Channel |
| BL-022 | high | capabilities 存在 unknown 无意义值 |
| BL-023 | medium | chat 工具示例模型与 list_models 不一致 |
| BL-024 | medium | Action/Template MCP 缺 create/update/delete |

来源：`docs/test-reports/user_report/aigc-gateway-dx-audit-report-2026-04-06.md`

## 已知遗留问题

1. deepseek/zhipu/anthropic/siliconflow 四个 Provider Channel 数为 0（sync 从未成功创建）→ BL-021
2. 上游错误透传暴露凭据 → BL-020
3. SiliconFlow 价格补全未生效（aiEnriched=0）
4. Anthropic 直连 401
5. 同步耗时偏高（~264s）

## 已知限制（决定不修复）

- API Keys 搜索框：Chrome MCP 程序化设值不触发浏览器事件，仅影响自动化测试工具

## 生产环境

- 控制台：`https://aigc.guangai.ai`
- API：`https://aigc.guangai.ai/v1/`
- MCP：`https://aigc.guangai.ai/mcp`
- Stitch 设计稿项目 ID: 13523510089051052358

### 生产服务器（GCP）

| 项目 | 值 |
|---|---|
| 机型 | e2-highmem-2（2 vCPU，16GB RAM） |
| 地区 | asia-northeast1-b（东京） |
| 外网 IP | `34.180.93.185` |
| SSH | `ssh tripplezhou@34.180.93.185` |
| 部署路径 | `/opt/aigc-gateway` |
| 启动 | PM2（`ecosystem.config.cjs`） |
| CI/CD | GitHub Actions → SSH → `git pull + npm ci + build + pm2 restart` |

### 测试账号

- **Admin:** `codex-admin@aigc-gateway.local` / `Codex@2026!` / API Key: `pk_aa6b13...`
- **Developer:** `codex-dev@aigc-gateway.local` / `Codex@2026!` / API Key: `pk_1ec762...`

## Harness 框架

- **版本：** v0.3.0+（2026-04-06 增加角色动态分配）
- **executor 字段：** `generator` / `codex`
- **角色分配：** `.agent-id`（结构化，cli/codex 分行）+ `role_assignments`（progress.json）
- **记忆分层：** `.auto-memory/` 共享 + `~/.claude/.../memory/` 本机
- **铁律第 8 条：** role_assignments 存在时，agent 只执行分配给自己的角色

## 关键开发规则

- Schema 变更 + migration + 引用代码必须同一 commit
- git pull 后 schema 变了必须 `npx prisma generate`
- 设计稿存 `design-draft/{屏幕名}/index.html`，UI 重构必须先读原型再编码
- 生产部署不用 Docker，PM2 直接运行 `.next/standalone/server.js`
