# ui-1to1-restoration Local Reverification 2026-04-06

## 测试目标

- 批次：`ui-1to1-restoration`
- 阶段：`reverifying`
- 目标：复验上一轮失败项 `F-1TO1-01`、`F-1TO1-02`、`F-1TO1-05`、`F-1TO1-08`

## 测试环境

- 本地 L1：`http://localhost:3099`
- 代码提交：`5dddf8b`
- 启动方式：`bash scripts/test/codex-setup.sh` + `bash scripts/test/codex-wait.sh`

## 测试范围

- 原型：
  - [design-draft/Action List (v2)/index.html](/Users/yixingzhou/project/aigcgateway/design-draft/Action%20List%20(v2)/index.html)
  - [design-draft/Action Detail (v2)/index.html](/Users/yixingzhou/project/aigcgateway/design-draft/Action%20Detail%20(v2)/index.html)
  - [design-draft/Template Detail (v2)/index.html](/Users/yixingzhou/project/aigcgateway/design-draft/Template%20Detail%20(v2)/index.html)
- 实现：
  - [src/app/(console)/actions/page.tsx](/Users/yixingzhou/project/aigcgateway/src/app/(console)/actions/page.tsx)
  - [src/app/(console)/actions/[actionId]/page.tsx](/Users/yixingzhou/project/aigcgateway/src/app/(console)/actions/%5BactionId%5D/page.tsx)
  - [src/app/(console)/templates/[templateId]/page.tsx](/Users/yixingzhou/project/aigcgateway/src/app/(console)/templates/%5BtemplateId%5D/page.tsx)
- 脚本验证：
  - [scripts/test/_archive_2026Q1Q2/ui-redesign-templates-actions-e2e-2026-04-06.ts](/Users/yixingzhou/project/aigcgateway/scripts/test/_archive_2026Q1Q2/ui-redesign-templates-actions-e2e-2026-04-06.ts)
  - [docs/test-reports/ui-redesign-templates-actions-local-e2e-2026-04-06.json](/Users/yixingzhou/project/aigcgateway/docs/test-reports/ui-redesign-templates-actions-local-e2e-2026-04-06.json)

## 执行步骤概述

- 拉取最新 `origin/main`，确认状态机进入 `reverifying` 且 `fix_rounds=1`
- 重启 3099 本地测试环境到最新代码
- 重新执行 UI CRUD 脚本，确认基础功能未回归
- 对照原型 HTML 复验上一轮失败页面的关键区块

## 通过项

- `F-1TO1-01` PASS：`/actions` 已补回原型底部左右分页按钮
- `F-1TO1-05` PASS：`/templates/[templateId]` 已补回 `Add Orchestration Step` 和 `Pipeline Preview`
- L1 API/E2E PASS：`ui-redesign-templates-actions-e2e-2026-04-06.ts` 结果 `5/5`

## 失败项

- `F-1TO1-02` FAIL：`/actions/[actionId]` 右侧 `Performance Matrix` 仍与原型不一致
  - 原型要求：`Avg Latency`、`Token Cost`、`Success Rate`
  - 当前实现：`Versions`、`Model`
  - 证据：
    - 原型 [design-draft/Action Detail (v2)/index.html](/Users/yixingzhou/project/aigcgateway/design-draft/Action%20Detail%20(v2)/index.html)
    - 实现 [src/app/(console)/actions/[actionId]/page.tsx#L366](/Users/yixingzhou/project/aigcgateway/src/app/(console)/actions/%5BactionId%5D/page.tsx#L366)
- `F-1TO1-08` FAIL：原型对照验收仍未全通过，因此不能签收

## 风险项

- 本轮证据以代码对照和 L1 脚本为主，未做浏览器截图级像素比对
- `Action Detail` 的数据字段如果暂时缺少真实统计来源，Generator 仍需先按原型恢复占位结构，否则无法满足 1:1 验收

## 最终结论

- 结论：未通过
- 状态建议：`fixing`
- 说明：本轮只验证，不修改任何产品实现代码
