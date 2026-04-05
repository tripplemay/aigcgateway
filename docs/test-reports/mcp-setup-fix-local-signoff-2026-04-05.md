# mcp-setup-fix local signoff 2026-04-05

## 测试目标

验证 `F-MSF-01`：MCP 设置页补全 4 个新 Tool、补齐 `mcpSetup` i18n、修复死按钮、去除硬编码文案，并满足 `lint` / `tsc` 验收条件。

## 测试环境

- 本地 L1：`http://localhost:3099`
- 启动方式：`bash scripts/test/codex-setup.sh` + `bash scripts/test/codex-wait.sh`
- 分支：`main`

## 测试范围

- `TOOLS` 运行态展示是否包含 11 个 Tool
- `mcpSetup` 中英文文案是否齐全并在页面生效
- `Create New Key` 是否已改为多语言 key
- `Finalize Installation` 是否具备真实跳转行为
- `npm run lint`
- `npx tsc --noEmit`

## 执行步骤概述

1. 执行 `git pull --ff-only origin main`
2. 读取 `progress.json`、`features.json`、`AGENTS.md`、`harness-rules.md`
3. 重建本地测试环境并确认 `http://localhost:3099/v1/models` 返回 `200`
4. 登录本地控制台并打开 `/mcp-setup`
5. 验证英文页面 Tool 列表和按钮
6. 切换中文，验证新增 i18n key 的页面表现
7. 点击 `Finalize Installation`，确认跳转到 `/dashboard`
8. 运行 `npm run lint`
9. 运行 `npx tsc --noEmit`

## 通过项

- 页面运行态显示 11 个 Tool，包含：
  - `list_actions`
  - `run_action`
  - `list_templates`
  - `run_template`
- `Create New Key` 已从硬编码改为多语言文本：
  - 英文：`Create New Key`
  - 中文：`创建新密钥`
- 中英文 `mcpSetup` 命名空间已生效，新增 4 个 Tool 描述均正常展示
- `Finalize Installation` 为真实链接，点击后成功跳转到 `/dashboard`
- `npm run lint` 退出码为 `0`
- `npx tsc --noEmit` 退出码为 `0`

## 失败项

- 无

## 风险项

- `npm run lint` 仍存在历史 warning，但不阻塞本轮验收：
  - `react-hooks/exhaustive-deps` 相关 warning
  - `@next/next/no-page-custom-font` warning
- 本轮为本地 `L1` 验收，不包含生产环境验证

## 证据链接或文件路径

- 截图：[mcp-setup-page-local-2026-04-05.png](/Users/yixingzhou/project/aigcgateway/docs/test-reports/mcp-setup-page-local-2026-04-05.png)
- 截图：[mcp-setup-finalize-local-2026-04-05.png](/Users/yixingzhou/project/aigcgateway/docs/test-reports/mcp-setup-finalize-local-2026-04-05.png)
- 状态机：[progress.json](/Users/yixingzhou/project/aigcgateway/progress.json)
- 功能状态：[features.json](/Users/yixingzhou/project/aigcgateway/features.json)

## 最终结论

`F-MSF-01` 本地首轮验收通过，批次可推进为 `done`。
