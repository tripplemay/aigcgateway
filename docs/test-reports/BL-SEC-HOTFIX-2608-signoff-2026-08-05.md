# BL-SEC-HOTFIX-2608 签收报告

## 测试目标

对 `BL-SEC-HOTFIX-2608` 完成 `reverifying -> done` 最终验收，确认支付攻击链关闭、底层模型名计费旁路移除、SSE 跨 chunk 丢帧修复和 MCP Key 权限继承均满足规格要求。

## 测试环境

- 复验阶段：`reverifying`，`fix_rounds=1`。
- 代码基线：`5b7ef6c`；修复轮次仅执行生产 Action 数据迁移，无产品代码变更。
- L1：`localhost:3199`，由 `scripts/test/codex-setup.sh` + `scripts/test/codex-wait.sh` 启动。
- 生产：`ssh deploysvr` 连接 `aigc-gateway-postgres-1`，只读事务复核迁移结果；未执行其他生产写入。
- L2：真实 provider、AI 调用、计费扣款、图片生成未执行，需独立 staging 授权。

## 最终结果

| Feature | 结果 | 核心证据 |
|---|---|---|
| F-SH-01 | PASS | 部署前三组 SQL 已完成；零计费指纹报告记录 3,234 次、成本 `$5.35723988`；重复充值和无签名完成订单均 0 行；C1/C2 无利用证据 |
| F-SH-02 | PASS | payment gate 定向 33/33；三个关闭端点不触达入账/建单；本地认证充值和伪造 webhook 均 410；admin 充值 201；前端使用 `paymentDisabled` 双语文案 |
| F-SH-03 | PASS | `Response Generator` 已迁移到启用别名 `gpt-4o-mini`；仍可用未命中 Action=0；7 条 `deepseek/v3` 无 Model/alias，修复前后均 404；alias-only 单测通过 |
| F-SH-04 | PASS | spec A/B/C 分片、usage 末帧、逐字符、`[DONE]`、注释、event、多行 data、flush 全部通过 |
| F-SH-05 | PASS | 受限 Key 的 MCP 子 Key 实测保留 `chatCompletion=false`、`imageGeneration=false`、`logAccess=false`、`projectInfo=false`；MCP initialize/create 均 200 |

总计：**5 PASS / 0 PARTIAL / 0 FAIL**。

## 自动化与构建证据

- 定向：4 test files，33/33 passed。
- 全量：95 test files，788 passed，4 skipped。
- `npm run typecheck`：PASS。
- `npm run typecheck:scripts`：PASS。
- `npm run lint`：PASS，0 error（保留既有 warnings）。
- `npm run build`：由唯一 Codex setup 脚本执行并 PASS。

## 遗留风险与未覆盖范围

- 生产当前仍存在独立的别名卖价配置风险：最近 30 天 `gpt-5.5` 为 329 次成功调用，全部 `sellPrice=0`，上游成本 `$0.957505`，最近一次 `2026-08-04 11:45:25Z`。已进入 `BL-BILLING-ALIAS-SELLPRICE-GUARD`，不属于本批次修复范围；本签收不表示该风险已解决。
- 7 条 `deepseek/v3` Action 是既有失效测试残留，生产没有对应 Model/alias/channel；不构成 F-SH-03 新回归，后续另行清理。
- L2 真实 provider/计费/图片链路未执行，原因和边界已记录，不影响本轮 L1/代码 acceptance 签收。
- `npm run format:check` 报告 95 个既有格式文件，未列为本批次门槛。

## 最终结论

**PASS。** BL-SEC-HOTFIX-2608 五项功能已完成首轮修复、生产前置迁移和复验，可将 `progress.json.status` 置为 `done`。本报告作为 `progress.json.docs.signoff` 指向的正式签收凭证。
