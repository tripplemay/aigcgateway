# template-new-page signoff - 2026-04-05

## 测试目标

验证 `F-TPL-01`：新增 `/templates/new` 创建模板页，修复路由 404，并满足创建模板页的核心交互与提交链路要求。

## 测试环境

- L1 本地基础设施层
- 应用地址：`http://localhost:3099`
- 启动方式：`bash scripts/test/codex-setup.sh` + `bash scripts/test/codex-wait.sh`
- 浏览器：Chrome DevTools
- 账号：本地种子管理员 `admin@aigc-gateway.local`

## 测试范围

- `/templates/new` 路由命中与页面渲染
- 模板基础字段、消息块、变量区渲染与动态增减
- 创建请求的接口契约
- 成功跳转到 `/templates/{newId}`
- 失败 toast 展示
- i18n 文案接入
- 与设计稿的一致性做页面级核对

## 执行步骤概述

1. 重建本地测试环境并确认 `3099` 就绪。
2. 登录本地控制台，创建最小测试项目。
3. 从模板列表进入 `/templates/new`，确认不再被动态路由误捕获。
4. 在运行时验证消息块和变量行的新增能力。
5. 通过浏览器实际提交创建模板，确认成功跳转到模板详情页。
6. 通过本地 API 直接创建模板，核对 `messages` 和 `variables` 的请求/持久化契约。
7. 在浏览器注入 POST 500 失败响应，确认页面展示错误 toast 且不崩溃。
8. 复核 `useTranslations('templates')` 与中英文文案文件。

## 通过项

- `src/app/(console)/templates/new/page.tsx` 已存在，`/templates/new` 运行时可正常打开，路由 404 已消失。
- 页面包含 `name`、`description`、消息编辑器、变量定义区，且默认带至少一个 message block。
- 运行时支持新增 message block、删除 message block、新增变量行、删除变量行。
- 提交逻辑调用 `POST /api/projects/{id}/templates`，请求体字段为 `name`、`description`、`messages`、`variables`。
- 成功创建后跳转到 `/templates/{newId}`。
- 失败注入时页面保留在创建页，并展示 toast：`Request failed: 500`。
- 页面使用 `useTranslations('templates')`，`en.json` 与 `zh-CN.json` 已补齐对应文案。
- 页面结构与设计稿的核心布局一致：顶部标题与操作区、左侧消息编辑器、右侧变量定义区。

## 失败项

- 无。

## 风险项

- 浏览器自动化填充动态变量行时存在工具噪音，因此变量持久化的最终确认同时使用了直接 API 验证；未发现产品缺陷。

## 证据

- 页面成功渲染截图：`docs/test-reports/template-new-page-form-2026-04-05.png`
- 失败 toast 截图：`docs/test-reports/template-new-page-failure-toast-2026-04-05.png`
- 本地实现文件：`src/app/(console)/templates/new/page.tsx`

## 最终结论

- `F-TPL-01`: PASS
- 本批次结论：PASS
