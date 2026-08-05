# BL-SEC-HOTFIX-2608 复验报告

## 测试目标与范围

复验首轮唯一阻塞 F-SH-03 的生产 Action 迁移，并确认首轮通过的 F-SH-01、F-SH-02、F-SH-04、F-SH-05 无回归。复验阶段：`reverifying`，`fix_rounds=1`，代码基线自 `5b7ef6c` 起未变化。

## F-SH-03 生产前置复核

- 只读 SQL 复核：未命中启用别名且仍有启用底层模型 + ACTIVE 通道的 Action 数量为 **0**。
- 仍未命中启用别名的仅为 `deepseek/v3` 的 **7** 条既有 Action；生产 `models.name='deepseek/v3'` 为 0 行，`model_aliases.alias='deepseek/v3'` 为 0 行，因此移除 fallback 前后均已 404，不构成此次回归。
- `Response Generator`（`cmnnvatcx00fxbn2be48u2wcc`）已从 `openai/gpt-4o-mini` 迁移为 `gpt-4o-mini`，更新时间 `2026-08-05 05:56:03.036`。
- 目标别名 `gpt-4o-mini`：`enabled=true`，卖价 `inputPer1M=0.18 / outputPer1M=0.72`，TEXT 模态；关联 `openai/gpt-4o-mini` 的通道为 `DEGRADED`，仍属于 `routeByAlias` 候选池，停用/不存在别名不会回退底层模型名。
- `Response Generator` 未被任何 `template_steps` 引用；迁移不会留下模板断链。

结论：**F-SH-03 PASS**。部署移除 fallback 不会使仍可用的存量 Action 新增 404。

## L1 复验环境

- 按规则运行 `bash scripts/test/codex-setup.sh`，测试数据库重置、65 条 migration、seed、Next build 和服务启动均通过。
- 服务：`http://localhost:3199`；`bash scripts/test/codex-wait.sh` 首次探测就绪。
- 本地无真实 provider key；provider/reconcile 启动报错属于 L1 已知限制，不据此判定产品失败。

## L1 结果

| 项目 | 结果 |
|---|---|
| 定向 Vitest（payment gate、alias-only、SSE、MCP permissions） | 4 files，33/33 PASS |
| 全量 Vitest | 95 files，788 passed，4 skipped |
| `npm run typecheck` | PASS |
| `npm run typecheck:scripts` | PASS |
| `npm run lint` | PASS，0 error，仅既有 warning |
| setup 内 `npm run build` | PASS |
| HTTP payment/recharge smoke | 认证用户 recharge 410 `payment_disabled`；支付宝/微信伪造回调 410；admin recharge 201 |
| MCP HTTP smoke | 受限 Key `initialize=200`、`create_api_key=200`；子 Key 的 4 个禁止位保持 `false` |

## L2 与未覆盖项

- 真实 provider AI 调用、真实计费扣款、图片生成：本轮未执行，未获 staging 授权且本地无真实 provider key。
- `npm run format:check` 仍报告 95 个既有格式文件；不是本批次 acceptance 门槛，未进行产品文件格式化。

## 范围外风险

复验时的生产只读查询还确认：最近 30 天 `gpt-5.5` 有 **329** 次 `SUCCESS`，全部 `sellPrice=0`，上游成本 **$0.957505**，最近一次 `2026-08-04 11:45:25.153Z`。这是启用别名缺少 `sellPrice` 的独立配置缺口，不由 F-SH-03 fallback 或 F-SH-04 解析器修复覆盖，已记录到需求池 `BL-BILLING-ALIAS-SELLPRICE-GUARD`。该风险不改变本批次五项 acceptance 的判定，但部署后仍会持续漏计费，需单独批次处理。

## 结论

**5/5 features PASS，首轮阻塞已解除，本批次可以签收并置 `done`。**
