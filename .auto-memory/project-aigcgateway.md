---
name: project-aigcgateway
description: AIGC Gateway 项目当前阶段、技术架构和开发状态
type: project
---

## 项目概况

AIGC Gateway — AI 服务商管理中台。统一 API 调用抽象（兼容 OpenAI 格式）、7 家服务商适配、全链路审计、预充值计费、健康检查自动降级、MCP 服务器、控制台中英文双语。

**Tech Stack:** Next.js 14 (App Router) + TypeScript + PostgreSQL + Prisma + Redis + shadcn/ui + @modelcontextprotocol/sdk + next-intl

## 当前开发状态（截至 2026-04-08）

**最新完成批次：** `user-profile-center`（6/6 PASS，fix_rounds=0，Generator=Johnsong）
**Harness 状态：** done
**签收报告：** `docs/test-reports/user-profile-center-signoff-2026-04-08.md`

### 近期完成批次（2026-04-08 ~ 2026-04-06）

- `user-profile-center`（6/6 PASS）— Sidebar 用户信息 + 个人中心入口 + LoginHistory 表 + 安全日志展示
- `balance-user-level-backend`（8/8 PASS）— 余额从 Project 级改为 User 级全链路

- `balance-user-level-backend`（8/8 PASS）— 余额从 Project 级改为 User 级：DB migration + SQL 函数重写 + post-process 对齐 + 充值 API + MCP/REST + Sidebar/Dashboard/Admin
- `project-switcher-ui`（6/6 PASS）— ProjectProvider Context、Sidebar 项目下拉、创建后自动切换、余额联动

- `dx-metadata-enhancement`（7/7 PASS）— capabilities/contextWindow 补全、run_action dry_run、MCP 错误码结构统一、SDK 类型与 README 对齐
- `action-pages-design-restore`（5/5 PASS）— 按更新后的 Stitch 设计稿还原 Action List / Detail / Editor 三页
- `mcp-crud-chat-params`（12/12 PASS）— MCP 新增 Action/Template CRUD + chat function-calling 参数增强 + SDK 类型清理
- `page-cleanup-actions-templates`（9/9 PASS）— 清理 Actions/Templates 假数据面板、接入真实统计、补全分页/New Version/Admin 查看
- `whitelist-db-migration`（9/9 PASS）— 模型白名单从代码迁移到 DB，Admin 控制台手动管理，全量同步+按需启用
- `dx-provider-fixes`（5/5 PASS）— 上游错误脱敏 + sync 预检 + capabilities 清理 + MCP 示例更新
- `ui-redesign-templates-actions`（9/9 PASS）— 7 个模板/动作页面 Stitch 设计稿重构
- `ui-1to1-restoration`（8/8 PASS）— 上述 7 页面设计稿严格还原修复

### 里程碑总览

- P1：项目骨架 + 7 家服务商 + API 网关 + 健康检查 + SDK + 认证计费支付 + 控制台 17 页
- P1 优化补丁：模型自动同步 + Stitch UI 重构（16/18 页，Login/Register 待办）+ 性能优化 14 项
- P2：MCP 服务器 (13 Tools) + 控制台国际化 (20页 + 259 key) + 集成测试
- P3-1：Prompt 模板治理（25/25 PASS）→ 后重构为 Action + Template 两层架构（p4-action-template 18/18 PASS）
- mcp-dx-round2：白名单收紧至 28 模型 + list_models 去重 + capabilities 补全（10/10 PASS）
- bugfix-model-cleanup：孤立 Model 清理 + MCP 错误码修复（5/5 PASS）
- ui-redesign-templates-actions + ui-1to1-restoration：7 个模板/动作页面 Stitch 1:1 还原（9/9 + 8/8 PASS）
- dx-provider-fixes：上游错误脱敏 + sync 预检 + capabilities 清理（5/5 PASS）
- **action-pages-design-restore：Action List / Detail / Editor 三页按更新设计稿还原（5/5 PASS）**
- mcp-crud-chat-params：MCP 补齐 Action/Template CRUD，chat 增强 top_p/frequency_penalty/tools/tool_choice，SDK 清理 phantom 字段（12/12 PASS）
- page-cleanup-actions-templates：清理 Actions/Templates 假数据与装饰指标，改为真实统计并补全关键交互（9/9 PASS）
- whitelist-db-migration：模型白名单迁移到 DB + Admin 管理页 + usage 修复（9/9 PASS）

### 本轮框架升级（2026-04-06）

1. **角色动态分配（方向 B）：** `.agent-id` 文件 + progress.json `role_assignments` 支持跨机器多 agent 分工
2. **`.agent-id` 结构化格式：** `cli: Andy` / `codex: Reviewer`，同机器区分 CLI 和 Codex
3. **记忆分层：** 共享层 `.auto-memory/`（git-tracked）存项目状态，本机层存用户偏好
4. **会话结束记忆检查点：** 所有角色、所有阶段、每次会话结束时检查并更新共享记忆
5. **Planner 增强：** §0a 读用户反馈 + §2.5 Stitch 设计稿检查 + §5 角色分配询问 + 功能改造批次设计稿一致性 acceptance 要求
6. **Generator 增强：** UI 重构改为「完全还原 HTML 代码」+ JSON 禁止弯引号 + 设计稿页面保护规则（禁止擅自改变布局结构）
7. **Evaluator 增强：** UI 重构验收逐块核对 + 有设计稿页面修改后必须视觉一致性交叉校验
8. **用户反馈目录：** `docs/test-reports/user_report/` 纳入 Planner 启动必读
9. **Agent 注册表：** `.agents-registry`（git-tracked）列出项目所有 agent，Planner 角色分配时读取
10. **AGENTS.md 适配：** Codex 启动读 `.agent-id` codex 行 + role_assignments 判断

### Stitch 设计稿状态（2026-04-06 清理后）

Action 相关权威设计稿（3 个，已更新确认）：
- **Action List (Updated)** — 全宽表格，无统计卡片/假数据，底部 CTA
- **Action Detail (Updated)** — Delete 按钮 + 垂直时间线 + 仅 Insights + Quick-Link（无 Performance Matrix）
- **Action Editor (Updated)** — Model 下拉选择器（非文本输入），无 Auto-saved

状态：3 页设计稿还原已完成并通过验收（`action-pages-design-restore` 5/5 PASS）

## Backlog（1 条待处理）

| ID | 优先级 | 标题 |
|---|---|---|
| BL-059 | high | Template 创建 API 返回 500（生产环境） |

BL-024~058 已完成。

## 已知遗留问题

1. 白名单重构后需在生产部署并触发 sync，然后在 Admin 白名单页启用所需模型
2. 同步耗时偏高（~264s）

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
