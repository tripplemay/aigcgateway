# Template Governance Local Acceptance 2026-04-03

- 测试目标：验收 `features.json` 中已标记为 `completed` 的模板治理功能 `F001-F017`
- 测试环境：本地 Codex 测试环境 `http://localhost:3099`
- 测试范围：数据模型、migration、seed、变量注入、Admin/Project 模板 CRUD、版本管理、`/v1/chat/completions` 扩展、`qualityScore` 回传、公共模板列表、MCP 模板工具、MCP chat 改造

## 执行步骤概述

1. 按 `AGENTS.md` 规则使用 `bash scripts/test/codex-setup.sh` 完整初始化测试环境
2. 轮询 `http://localhost:3099/v1/models` 确认服务 ready
3. 校验 Prisma schema、migration 落库结构、seed 公共模板数量
4. 用管理员账号和两名开发者测试账号执行 API 验收
5. 通过新建测试项目和 API Key 执行 `/v1/chat/completions` 与 MCP 模板链路
6. 通过数据库查询核对 `CallLog.templateVersionId`、`source`、`qualityScore`

## 通过项

- `F001` `F002` `F003`
  - `prisma/schema.prisma` 包含 `Template`、`TemplateVersion`、`CallLog.templateVersionId`
  - `20260403170000_add_template_governance` migration 已成功应用
  - `codex-setup.sh` 中 `prisma generate`、`prisma migrate deploy`、`npm run build` 全部通过
- `F004`
  - seed 后公共模板共 `3` 个
  - 公共模板活跃版本变量数量分别为 `2 / 3 / 3`
- `F005`
  - 通过 `/v1/chat/completions` 触发模板注入并从 `CallLog.promptSnapshot` 验证：
  - 必填缺失时报 `Missing required variables: question`
  - 同名占位符全局替换生效：`Role=lawyer RoleAgain=lawyer`
  - 非必填变量默认值生效：`Tone=formal`
- `F006`
  - `GET/POST/PATCH/DELETE /api/admin/templates`
  - `GET /api/admin/templates/:templateId`
  - `POST /api/admin/templates/:templateId/versions`
  - `PATCH /api/admin/templates/:templateId/active-version`
  - 非 Admin JWT 访问返回 `403 forbidden`
- `F007`
  - `GET/POST /api/projects/:id/templates`
  - `GET/PATCH/DELETE /api/projects/:id/templates/:templateId`
  - `POST /api/projects/:id/templates/:templateId/versions`
  - `PATCH /api/projects/:id/templates/:templateId/active-version`
  - `POST /api/projects/:id/templates/fork`
  - 非项目归属用户访问模板详情返回 `404`
- `F008`
  - 项目模板与 Admin 模板新版本均自增为 `v2`
  - `active-version` 切换成功
- `F009`
  - 传 `templateId` 时优先走模板链路，忽略传入的 `messages`
  - API 调用写入 `CallLog.templateVersionId`
  - 证据：`traceId=trc_abedhkdhfiipwih0q086dmyp`
- `F010`
  - `PATCH /api/projects/:id/logs/:traceId/quality` 成功回写 `qualityScore=0.85`
- `F011`
  - `GET /api/public-templates` 无需登录即可返回公共模板列表
- `F012`
  - MCP `create_template` 返回草稿 JSON，数据库模板数量未增加
- `F013`
  - MCP `confirm_template` 成功写入模板和初始版本
- `F014`
  - MCP `list_templates` 支持 `search`
  - `includePublic=false` 时不返回公共模板
- `F015`
  - MCP `get_template` 返回模板详情、版本列表、变量定义
- `F016`
  - MCP `update_template` 创建新版本且不自动切换活跃版本
- `F017`
  - MCP `chat` 支持 `templateId + variables`
  - 模板缺必填变量时返回模板错误
  - 真实调用记录写入 `source='mcp'` 和 `templateVersionId`
  - 证据：`traceId=trc_j9oa1s816hv2jd4dttff4xv2`

## 失败项

- 无

## 风险项

- 本轮仅执行本地 `L1` 验收，未执行 Staging `L2` 全链路验证
- 本地 provider key 为占位符，`/v1/chat/completions` 与 MCP `chat` 最终均返回上游 `auth_failed`，这是本地环境限制，不判定为本轮失败
- 运行期间 Redis 未连通，服务日志持续出现 `ioredis ECONNREFUSED`；限流逻辑按代码设计降级放行，未阻断本轮验收，但仍建议开发侧补齐本地 Redis 后复查一次

## 证据链接或文件路径

- 测试脚本：[scripts/test/template-governance-eval.mjs](/Users/zhouyixing/project/aigcgateway/scripts/test/template-governance-eval.mjs)
- 规格文档：[docs/specs/AIGC-Gateway-Template-Governance-P3-1-Spec.md](/Users/zhouyixing/project/aigcgateway/docs/specs/AIGC-Gateway-Template-Governance-P3-1-Spec.md)
- 迁移目录：[prisma/migrations/20260403170000_add_template_governance/migration.sql](/Users/zhouyixing/project/aigcgateway/prisma/migrations/20260403170000_add_template_governance/migration.sql)
- 数据模型：[prisma/schema.prisma](/Users/zhouyixing/project/aigcgateway/prisma/schema.prisma)

## 最终结论

- 本轮本地 `L1` 验收结论：`PASS`
- `F001-F017` 通过
- `F018-F025` 仍为 `pending`，不在本轮验收范围内
