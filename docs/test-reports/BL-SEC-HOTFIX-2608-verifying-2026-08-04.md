# BL-SEC-HOTFIX-2608 首轮验收报告

## 测试目标

验收 F-SH-01..05 的 acceptance，先完成部署前生产只读暴露盘点，再用干净本地环境回归支付关闭、别名路由、SSE 跨 chunk 解析和 MCP Key 权限继承。

## 测试环境

- 阶段：`verifying`；基线：`5b7ef6c`（四个 generator 修复分别为 `272bb57`、`6669dc8`、`847b63b`、`7b0c3b6`）。
- L1：`bash scripts/test/codex-setup.sh` + `bash scripts/test/codex-wait.sh`，服务 `http://localhost:3199`，PostgreSQL 使用脚本自动启动的测试容器。
- L2：未执行。真实 provider key、真实 AI 调用、计费扣款和图片生成需要 staging 授权，本轮不以本地缺 key 的 502 代替结论。
- 生产：只读事务，详见 `BL-SEC-HOTFIX-2608-prod-exposure-2026-08-04.md`。

## 执行结果

| Feature | 结果 | 证据 |
|---|---|---|
| F-SH-01 | PASS | 三组生产 SQL 已执行；3,234 条零卖价/正成本成功调用、成本 `$5.35723988`；重复 RECHARGE 0 行；无签名 COMPLETED recharge order 0 行；C1/C2 无数据库利用证据 |
| F-SH-02 | PASS | 定向 payment-gate `33/33`；未设置/`false`/空串/`TRUE` 均 410 且 mock 未触达；本地认证用户 recharge 410 `payment_disabled`；伪造支付宝/微信 410；admin 手动充值 HTTP `201` |
| F-SH-03 | FAIL（发布阻塞） | 单测正常别名及停用/底层模型名 404 通过；但生产仍有 1 条启用底层模型 `openai/gpt-4o-mini` 的 Action 未迁移，部署后会 404。另有 7 条 `deepseek/v3` 已无底层 Model/ACTIVE channel，属于既有失效配置 |
| F-SH-04 | PASS | `sse-parser.test.ts` 场景 A/B/C、逐字符、usage 末帧、`[DONE]`、注释、event、多行 data、无空行 flush 全通过 |
| F-SH-05 | PASS | 定向单测通过；MCP HTTP 实测受限父 Key 创建子 Key，子 Key 保留 `chatCompletion/imageGeneration/logAccess/projectInfo=false`，`initialize` 与 `create_api_key` 均 200 |

## 回归命令

- `npx vitest run src/app/api/webhooks/__tests__/payment-gate.test.ts src/lib/engine/resolve-engine-alias-only.test.ts src/lib/engine/sse-parser.test.ts src/lib/mcp/__tests__/derive-permissions.test.ts`：4 files，33/33 PASS。
- `npm test`：95 files，788 passed，4 skipped。
- `npm run typecheck`：PASS。
- `npm run typecheck:scripts`：PASS。
- `npm run lint`：PASS（0 error；仅既有 lint warnings）。
- `bash scripts/test/codex-setup.sh` 内 `npm run build`：PASS。
- `curl http://localhost:3199/v1/models`：HTTP 200；本地无 provider key，模型列表为空，符合 L1 限制。

`npm run format:check` 报告 95 个既有格式文件，未列入本批次 acceptance 门槛，也未自动改写产品文件。

## 失败项与修复要求

### F-SH-03（P0 发布阻塞）

**前置条件：** 先运行 Generator 提供的迁移脚本 dry-run，确认唯一可自动迁移项；在获得生产业务写入授权后将 `Response Generator` 的 `model` 从底层名迁到启用别名 `gpt-4o-mini`。7 条 `deepseek/v3` 无底层 Model/ACTIVE channel，需由业务决定删除、重建或保持失效，不能由 Codex 擅自修改。

**复验：** 迁移后重新执行 spec §3 SQL，确认所有仍可用的存量 Action 命中启用别名；再将状态转 `reverifying`，重跑 F-SH-03 定向单测和全量回归。

## 最终结论

**本轮不通过，状态置为 `fixing`。** 四项代码/运行时功能及生产盘点均通过，但 F-SH-03 的部署前存量迁移尚未完成，不能签收、不能置 `done`、不能部署本批次修复。
