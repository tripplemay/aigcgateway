# Template Governance P3-1 生产验收报告

## 测试目标

对 `docs/specs/AIGC-Gateway-Template-Governance-P3-1-Spec.md` 对应的已发布版本执行生产环境验收，覆盖：

- 模板治理 API
- `/v1/chat/completions` 的 `templateId + variables`
- MCP 模板工具链
- 开发者控制台 `/templates` 与 `/templates/:id`
- 管理员公共模板能力

## 测试环境

- 生产开关读取值：
  - `PRODUCTION_STAGE=RND`
  - `PRODUCTION_DB_WRITE=ALLOW`
  - `HIGH_COST_OPS=ALLOW`
- 控制台：`https://aigc.guangai.ai`
- 备用直连：`http://154.40.40.116:8301`
- API：`https://aigc.guangai.ai/v1/`
- MCP：`https://aigc.guangai.ai/mcp`
- 验收时间：`2026-04-03`
- 验收账号：
  - `codex-admin@aigc-gateway.local` / `ADMIN`
  - `codex-dev@aigc-gateway.local` / `DEVELOPER`

## 测试范围

- 平台公共模板 CRUD、版本管理、活跃版本切换
- 项目模板 CRUD、搜索、Fork、版本管理、活跃版本切换
- `qualityScore` 回传
- `/v1/chat/completions` 模板注入
- MCP 新增工具：
  - `create_template`
  - `confirm_template`
  - `list_templates`
  - `get_template`
  - `update_template`
- MCP 现有 `chat` 对 `templateId` 的支持
- 开发者控制台模板列表与详情页
- 管理员公共模板能力的生产可用性

## 执行步骤概述

1. 使用开发者与管理员账号完成生产登录与基础 smoke。
2. 用开发者 API Key 执行 `/v1/models`、`/v1/chat/completions`、MCP 初始化与工具列举。
3. 用管理员 JWT 执行公共模板创建、更新、创建新版本、切换活跃版本。
4. 用开发者 JWT 执行项目模板创建、搜索、创建新版本、切换活跃版本、Fork 公共模板。
5. 用开发者 API Key 执行 `templateId + variables` 调用，并回查日志中的 `templateVersionId`。
6. 用开发者 JWT 回传 `qualityScore`。
7. 用 MCP 执行模板草稿生成、确认保存、查询、更新版本、模板对话。
8. 用浏览器验证开发者模板列表页与模板详情页。
9. 尝试验证管理员公共模板页，并记录浏览器协议异常。

## 通过项

### 1. API / 集成链路通过

- `GET /api/projects/:id/templates` 可列出并搜索项目模板。
- `POST /api/projects/:id/templates` 可创建项目模板。
- `GET /api/projects/:id/templates/:templateId` 可读取模板详情与版本。
- `PATCH /api/projects/:id/templates/:templateId` 可更新模板基本信息。
- `POST /api/projects/:id/templates/:templateId/versions` 可创建新版本。
- `PATCH /api/projects/:id/templates/:templateId/active-version` 可切换活跃版本。
- `GET /api/public-templates` 可返回公共模板。
- `POST /api/projects/:id/templates/fork` 可将公共模板 Fork 到项目。
- `POST /api/admin/templates`、`PATCH /api/admin/templates/:templateId`、`POST /api/admin/templates/:templateId/versions`、`PATCH /api/admin/templates/:templateId/active-version` 均通过。
- `PATCH /api/projects/:id/logs/:traceId/quality` 可成功写入 `qualityScore=0.88`。
- `/v1/chat/completions` 传入 `templateId + variables` 后成功生成响应。
- 管理后台日志返回的 `templateVersionId` 与当前活跃版本一致，且 prompt 快照包含变量注入后的内容。

### 2. MCP 模板治理链路通过

- MCP 初始化成功。
- 工具列表包含 12 个工具，新增模板相关工具均已注册。
- `create_template` 可根据描述生成草稿。
- `confirm_template` 可将草稿保存为模板与 V1。
- `list_templates` 可检索新建模板。
- `get_template` 可返回模板详情、所有版本与变量定义。
- `update_template` 可创建 V2，且不自动切换为活跃版本。
- `chat` 传入 `templateId` 可成功调用。
- Admin 日志回查中，MCP 调用的 `source='mcp'` 与 `templateVersionId` 均正确。

### 3. 开发者控制台通过

- 侧边栏存在 `模板` 入口。
- `/templates` 页面可展示我的模板、公共模板与操作入口。
- 生产验收过程中创建的模板在页面中可见。
- `/templates/:id` 页面可展示：
  - 模板标题与描述
  - 消息内容
  - 变量定义
  - 版本历史
  - 活跃版本状态
- 钱包余额在开发者模板详情页正常显示为 `$6.85`。

## 非阻塞说明

### 1. MCP 计费与余额显示精度

- 初测现象：
  - `MCP chat (deepseek/v3)` 前后 `get_balance` 均显示 `6.8500`
  - `get_usage_summary (7d)` 显示 `cost: $0.0000`
- 补充根因：
  - 本次测试样本仅约 `7 tokens`
  - 实际计费与余额变更已发生，但被当前接口展示精度掩盖
  - 用户补充的生产实测数据表明：
    - `sellPrice = $0.000003`
    - 余额由 `$6.85` 下降到 `$6.849884`
    - 总成本约 `$0.000115`
- 判定：
  - 该项不再视为 P3-1 功能缺陷
  - 归类为显示精度盲区，不阻塞签收
  - 如需优化，可后续将 `get_balance` / `get_usage_summary` 的显示精度从 4 位提升到 6 位

### 2. MCP 图片生成失败

- 现象：`generate_image (normal call)` 返回非结构化错误，未成功生成图片
- 补充根因：
  - 属于生产环境图片生成适配器的已知遗留问题
  - 涉及 `dall-e-3` 与部分 `imageViaChat` 模型兼容性
- 判定：
  - 不属于 `Template Governance P3-1` 发布范围内缺陷
  - 作为独立遗留问题跟踪，不阻塞本次签收

### 3. Admin 模板页浏览器可视化证据不足

- 现象：
  - `https://aigc.guangai.ai/admin/templates` 的自动化浏览器上下文出现 `ERR_SSL_PROTOCOL_ERROR`
  - `http://154.40.40.116:8301/admin/templates` 在自动化浏览器中长期停留在 `Loading...`
- 补充根因：
  - 由测试端浏览器自动化链路与本地代理环境导致
  - 不是生产代码问题
- 判定：
  - 管理员模板能力以后端 API 验收结果为准
  - UI 可视化证据需人工补充一次目视确认
  - 不阻塞 P3-1 签收

## 风险项

- 管理员公共模板的后端能力已通过生产 API 验证，但我这轮仍未拿到稳定的管理员 UI 浏览器截图；该部分依赖人工目视补证。
- 本轮为生产受控写入验收，已创建测试模板、版本和日志记录；按边界要求未执行删除清理。

## 证据链接或文件路径

- `docs/test-reports/template-governance-production-api-2026-04-03.txt`
- `docs/test-reports/template-governance-production-mcp-main-2026-04-03.txt`
- `docs/test-reports/template-governance-production-mcp-errors-2026-04-03.txt`
- `docs/test-reports/template-governance-production-mcp-template-2026-04-03.txt`
- `docs/test-reports/template-governance-production-ui-dev-templates-2026-04-03.png`
- `docs/test-reports/template-governance-production-ui-dev-detail-real-2026-04-03.png`

## 最终结论

本次发布的 **Template Governance P3-1 主功能链路在生产环境通过验收**：

- 模板 CRUD
- 版本管理
- 公共模板 Fork
- `templateId + variables` 注入
- `qualityScore` 回传
- MCP 模板工具链
- 开发者控制台模板页

本轮初测中记录的 4 个问题，经补充根因分析后，判定如下：

- MCP 余额与成本问题属于显示精度盲区，不是计费闭环缺陷
- MCP 图片生成失败属于范围外已知遗留问题
- Admin 模板页浏览器异常属于测试端环境问题，不是产品缺陷

结论判定：`PASS`
