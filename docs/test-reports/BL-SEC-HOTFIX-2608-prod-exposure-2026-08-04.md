# BL-SEC-HOTFIX-2608 生产暴露只读盘点

## 测试目标

在本批次修复部署前，按 spec §5 对生产库执行三组只读查询，量化 C6/H13 零计费指纹并检查 C1/C2 支付伪造、重复入账证据。

## 测试环境

- 生产数据库容器：`aigc-gateway-postgres-1`，数据库 `aigc_gateway`，通过 `ssh deploysvr` 连接。
- 查询时间：`2026-08-05 03:08:52.202365+00`（UTC，约 `2026-08-04 23:08:52 EDT`）。
- 代码 HEAD：`5b7ef6c`；生产 app 容器运行约 8 天，当前未部署本批次 HEAD。
- 安全约束：每条 SQL 均以 `BEGIN; SET TRANSACTION READ ONLY;` 开始并 `COMMIT`，未执行 `UPDATE`、`DELETE` 或其他写操作。

## 原始查询

```sql
-- (a) C6 / H13 零计费指纹
SELECT "modelName", COUNT(*) AS calls, SUM("costPrice") AS total_cost_usd,
       MIN("createdAt") AS first_seen, MAX("createdAt") AS last_seen
FROM call_logs
WHERE status = 'SUCCESS' AND "sellPrice" = 0 AND "costPrice" > 0
GROUP BY "modelName" ORDER BY calls DESC;

-- (b) 同一 paymentOrderId 的重复充值交易
SELECT "paymentOrderId", COUNT(*) AS n, SUM(amount) AS total
FROM transactions
WHERE type = 'RECHARGE' AND "paymentOrderId" IS NOT NULL
GROUP BY "paymentOrderId" HAVING COUNT(*) > 1;

-- (c) 已完成但 paymentRaw 缺少 sign 的充值订单
SELECT id, "userId", amount, "paymentMethod", "paidAt",
       "paymentRaw" ? 'sign' AS has_sign
FROM recharge_orders WHERE status = 'COMPLETED'
ORDER BY "paidAt" DESC LIMIT 100;
```

## 结果

### (a) 零计费指纹

共 **3,234** 次 `SUCCESS` 调用，`costPrice` 合计 **$5.35723988**，首次出现 `2026-07-05 05:07:25.667`，最近出现 `2026-07-27 22:55:32.833`。按 `modelName` 的 15 行原始结果如下：

| modelName | calls | total_cost_usd | first_seen | last_seen |
|---|---:|---:|---|---|
| anthropic/claude-opus-4.7 | 656 | 0.30504000 | 2026-07-05 05:07:25.667 | 2026-07-27 22:28:18.956 |
| deepseek-v4-pro | 629 | 0.01012690 | 2026-07-05 05:51:25.869 | 2026-07-23 05:10:54.951 |
| deepseek-v4-flash | 214 | 0.00110852 | 2026-07-05 05:33:25.616 | 2026-07-23 03:22:32.016 |
| openai/gpt-5.5 | 208 | 0.08786000 | 2026-07-05 05:33:30.390 | 2026-07-27 22:38:33.147 |
| xiaomi/mimo-v2.5 | 179 | 0.00177874 | 2026-07-05 06:42:27.320 | 2026-07-27 22:46:21.681 |
| deepseek/deepseek-v4-pro | 179 | 0.00993885 | 2026-07-05 06:42:52.062 | 2026-07-27 22:46:23.812 |
| tencent/hy3-preview | 179 | 0.00080782 | 2026-07-05 06:42:49.213 | 2026-07-27 22:46:29.284 |
| xiaomi/mimo-v2.5-pro | 178 | 0.01228356 | 2026-07-05 06:43:04.337 | 2026-07-27 22:46:49.955 |
| ~moonshotai/kimi-latest | 177 | 0.02338654 | 2026-07-05 06:43:03.337 | 2026-07-27 22:48:31.416 |
| deepseek/deepseek-v4-flash | 177 | 0.00102115 | 2026-07-05 06:43:02.002 | 2026-07-27 22:55:32.833 |
| qwen/qwen3.5-plus-20260420 | 174 | 0.06891480 | 2026-07-05 06:43:10.329 | 2026-07-27 22:48:46.693 |
| anthropic/claude-opus-4.7-fast | 155 | 0.43245000 | 2026-07-05 06:43:05.413 | 2026-07-23 03:53:39.160 |
| gpt-5.5 | 106 | 0.95750500 | 2026-07-12 14:00:15.039 | 2026-07-17 13:00:16.093 |
| gemini-3-pro-image | 19 | 2.62117800 | 2026-07-12 23:12:11.555 | 2026-07-13 04:50:16.088 |
| gpt-image | 4 | 0.82384000 | 2026-07-11 02:39:47.222 | 2026-07-11 02:48:06.236 |

结论：**已存在历史零计费损失指纹，估算上游成本至少 $5.35723988；该结果不是支付伪造利用证据。**

### (b) 重复充值交易

查询返回 **0 行**。未发现同一非空 `paymentOrderId` 对应多条 `RECHARGE` 交易。

### (c) 无签名的已完成充值订单

查询返回 **0 行**。未发现 `status=COMPLETED` 且 `paymentRaw` 不含 `sign` 字段的充值订单。

## C1/C2 利用判定

**否：截至本次全量只读查询，没有发现 C1 支付伪造或 C2 重放重复入账已被实际利用的数据库证据。** 该结论仅表示未命中两组利用指纹，不证明攻击者绝对没有尝试；(a) 的零计费历史损失仍需按上游账单进一步归因。

## 发布阻塞（F-SH-03 前置条件）

同一只读事务核验 `actions.model` 后，仍有 8 条 Action 未命中启用别名：`openai/gpt-4o-mini` 1 条、`deepseek/v3` 7 条；`template_steps` 关联的模板未命中（0 个模板、0 个步骤）。因此部署移除 fallback 前必须先按 Generator 提供的迁移脚本完成这 1 条可自动迁移项，并人工处理 7 条无对应启用别名的历史项。Codex 未执行生产写入，等待单独授权/运维处理。
