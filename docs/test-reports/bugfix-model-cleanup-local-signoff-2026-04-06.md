# bugfix-model-cleanup Local Signoff 2026-04-06

## 测试目标
验证 `bugfix-model-cleanup` 批次的 5 个功能是否满足验收标准，重点执行 F-CLN-05（Codex E2E）。

## 测试环境
- 本地 L1：`http://localhost:3099`
- 启动方式：`bash scripts/test/codex-setup.sh` + `bash scripts/test/codex-wait.sh`
- E2E 脚本：`scripts/test/_archive_2026Q1Q2/bugfix-model-cleanup-e2e-2026-04-06.ts`

## 测试范围
- F-CLN-02：清理脚本 dry-run 输出校验
- F-CLN-01：sync 后白名单外 Model 清理校验
- F-CLN-03：MCP `chat` / `generate_image` 无可用渠道时错误分支校验
- F-CLN-04：`/api/admin/models` 的 `activeChannelCount` 与数据库对账

## 执行步骤概述
1. 注入一个白名单外测试模型与关联通道。
2. 执行 `npx tsx scripts/cleanup-orphan-models.ts`（dry-run），验证输出包含待删模型。
3. 调用 `POST /api/admin/sync-models`，轮询 `GET /api/admin/sync-status`，确认同步时间更新并验证孤立模型被删除。
4. 通过禁用目标模型所有通道，调用 MCP `chat`/`generate_image`，验证无可用渠道错误行为。
5. 调用 `GET /api/admin/models` 并与 DB `ACTIVE` 通道数进行对账。

## 通过项
- 清理脚本 dry-run 输出正确，能识别白名单外模型。
- 模型同步完成后，白名单外测试模型被物理清理。
- MCP 无可用渠道场景：
  - `chat` 返回 `isError=true` 且友好错误信息。
  - `generate_image` 返回 JSON 错误码 `channel_unavailable`。
- `activeChannelCount` 字段存在且与数据库一致。

## 失败项
- 无。

## 风险项
- 本轮为本地 L1 验证；不覆盖生产环境真实上游波动与真实计费行为。

## 证据
- E2E 结果：`docs/test-reports/bugfix-model-cleanup-local-e2e-2026-04-06.json`

## 最终结论
本轮 `bugfix-model-cleanup` 本地验收通过，结论：**PASS（5/5）**。
