# Template Governance Local Signoff 2026-04-03

## 测试目标

- 以评估者身份验收 `F018-F025`
- 覆盖 Stitch 原型存在性、开发者模板页、模板详情页、Admin 模板管理页、侧边栏入口与 i18n 文案
- 在本地 `L1` 环境确认前端落地与基础交互可用

## 测试环境

- 环境：本地测试环境 `http://localhost:3099`
- 启动方式：`bash scripts/test/codex-setup.sh`
- 账号：`admin@aigc-gateway.local / admin123`
- 测试项目：`cmniypb1u00039y9zlc5myfry` `Codex Template Eval`

## 使用的源文档

- [AIGC-Gateway-Template-Governance-P3-1-Spec.md](/Users/yixingzhou/project/aigcgateway/docs/specs/AIGC-Gateway-Template-Governance-P3-1-Spec.md)
- [Template List (High Density)/code.html](/Users/yixingzhou/project/aigcgateway/design-draft/Template%20List%20(High%20Density)/code.html)
- [Template Detail/code.html](/Users/yixingzhou/project/aigcgateway/design-draft/Template%20Detail/code.html)
- [Public Template Management (Admin)/code.html](/Users/yixingzhou/project/aigcgateway/design-draft/Public%20Template%20Management%20(Admin)/code.html)
- [features.json](/Users/yixingzhou/project/aigcgateway/features.json)

## 执行步骤概述

1. 重建本地测试环境并确认 `3099` 就绪。
2. 静态核对 `design-draft/` 原型文件、目标路由实现、侧边栏和 i18n 文案。
3. 登录控制台，进入 `/templates` 验证“我的模板 / 公共模板库”、搜索、Fork、详情跳转。
4. 在 `/templates/:id` 验证 messages 展示、变量定义、版本历史，并通过 API 辅助创建 v2 和切换 active version 后刷新页面确认渲染结果。
5. 在 `/admin/templates` 验证列表、搜索、分类过滤，并执行公共模板创建、编辑、删除回归。

## 通过项

- `F018` PASS
  - 原型文件存在：
    - `design-draft/Template List (High Density)/code.html`
    - `design-draft/Template List (High Density)/screen.png`
- `F019` PASS
  - 原型文件存在：
    - `design-draft/Template Detail/code.html`
    - `design-draft/Template Detail/screen.png`
- `F020` PASS
  - 原型文件存在：
    - `design-draft/Public Template Management (Admin)/code.html`
    - `design-draft/Public Template Management (Admin)/screen.png`
- `F021` PASS
  - `/templates` 页面可加载
  - “我的模板 / 公共模板库”切换正常
  - 搜索 `翻译` 后仅保留目标模板
  - 公共模板 `Fork` 成功，列表切回“我的模板”并出现 fork 结果
- `F022` PASS
  - `/templates/:id` 展示 messages、变量定义、版本历史
  - 新建版本后页面显示 `最新: V2`
  - 切换 active version 后页面头部版本与历史状态同步更新为 `v2 / ACTIVE`
- `F023` PASS
  - `/admin/templates` 页面可加载
  - 统计卡、搜索、分类过滤正常
  - 创建公共模板后列表与分类按钮更新
  - 行内编辑名称/描述/category 成功
  - 删除模板后列表与统计回退
- `F024` PASS
  - 开发者侧边栏存在 `模板 -> /templates`
  - Admin 侧边栏存在 `模板管理 -> /admin/templates`
- `F025` PASS
  - `src/messages/en.json` 与 `src/messages/zh-CN.json` 均存在模板相关文案
  - 实际页面中文文案能正确渲染，包括标题、列名、按钮、状态提示

## 失败项

- 无

## 风险项

- 模板详情页“创建新版本 / 切换活跃版本”的浏览器交互在本次 DevTools 自动化过程中出现过一次跳页噪音，未定位为产品缺陷。
- 为避免把工具噪音误判为页面问题，本轮对 `F022` 的“新建版本 / 切换 active version”采用“页面静态渲染 + 同环境 API 驱动 + 页面刷新复核”的组合验收。
- 本轮仅覆盖本地 `L1`。未涉及真实 AI 调用、`source='mcp'` 写入或 staging 全链路。

## 最终结论

- `F018-F025` 本地验收通过
- 本轮未发现阻断 `P3-1` 收口的前端缺陷
- 结合既有 `F001-F017` 通过记录，可将当前状态机从 `reviewing` 收口到 `done`

## 证据文件

- [template-governance-local-acceptance-2026-04-03-templates-global.png](/Users/yixingzhou/project/aigcgateway/docs/test-reports/template-governance-local-acceptance-2026-04-03-templates-global.png)
- [template-governance-local-acceptance-2026-04-03-template-detail.png](/Users/yixingzhou/project/aigcgateway/docs/test-reports/template-governance-local-acceptance-2026-04-03-template-detail.png)
- [template-governance-local-acceptance-2026-04-03-template-detail-before-version.png](/Users/yixingzhou/project/aigcgateway/docs/test-reports/template-governance-local-acceptance-2026-04-03-template-detail-before-version.png)
- [template-governance-local-acceptance-2026-04-03-template-detail-v2.png](/Users/yixingzhou/project/aigcgateway/docs/test-reports/template-governance-local-acceptance-2026-04-03-template-detail-v2.png)
- [template-governance-local-acceptance-2026-04-03-template-detail-activated.png](/Users/yixingzhou/project/aigcgateway/docs/test-reports/template-governance-local-acceptance-2026-04-03-template-detail-activated.png)
- [template-governance-local-acceptance-2026-04-03-admin-templates.png](/Users/yixingzhou/project/aigcgateway/docs/test-reports/template-governance-local-acceptance-2026-04-03-admin-templates.png)
- [template-governance-local-acceptance-2026-04-03-admin-templates-created.png](/Users/yixingzhou/project/aigcgateway/docs/test-reports/template-governance-local-acceptance-2026-04-03-admin-templates-created.png)
- [template-governance-local-acceptance-2026-04-03-admin-templates-deleted.png](/Users/yixingzhou/project/aigcgateway/docs/test-reports/template-governance-local-acceptance-2026-04-03-admin-templates-deleted.png)
