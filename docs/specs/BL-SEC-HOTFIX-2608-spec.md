# BL-SEC-HOTFIX-2608 — 全量审查 P0 止血批次

**批次类型：** Bug 修复（混合批次：1 条 codex + 4 条 generator）
**来源：** `docs/code-review/backend-fullscan-2026-08-04.md`（6 Critical / 13 High / 14 Medium）
**用户裁决日期：** 2026-08-04
**部署要求：** 本批次验收通过后**立即单独部署**，不与后续批次合并发布。

---

## 1. 为什么是这五条

全量审查报出 6 个 Critical，本批次只取其中**改动小、能立刻止血、且不需要新设计**的部分：

| 审查编号 | 本批次 | 处理方式 |
|---|---|---|
| C1 支付 webhook 零验签 | F-SH-02 | 关闭端点（不实现验签，见 §2） |
| C2 支付回调幂等 TOCTOU | F-SH-02 | 随 C1 一并 defuse，真正修复留给未来支付批次 |
| C6 底层模型名零计费旁路 | F-SH-03 | 移除 fallback |
| H13 SSE 丢帧 | F-SH-04 | 提升变量作用域 |
| C5 MCP 权限提升 | F-SH-05 | 权限继承 |
| C3 扣费回滚白嫖 | ❌ 不在本批次 | 用户已裁决方向，见 `docs/adjudications/2026-08-04-c3-negative-balance-ruling.md`，在 `BL-SEC-BILLING-GATE` 实施 |
| C4 模板测试通道 | ❌ 不在本批次 | 与 C3 同属计费门收敛，一起做更省事 |

F-SH-01 是只读盘点，排在最前，目的是在修复部署**之前**把现状快照下来。

---

## 2. 关键设计决策：支付端点关闭而非实现验签

**事实依据（审查时逐项确认）：**

- `package.json` 无任何支付 SDK 依赖（alipay-sdk / wechatpay-node 等均不存在）
- `src/lib/env.ts:33-42` 中 `ALIPAY_*` / `WECHAT_*` 全部 `.optional()`，`.env.example` 中全部处于注释状态
- `src/app/api/projects/[id]/recharge/route.ts:52-56` 返回的 `paymentUrl` 是手工拼接字符串，缺 `app_id` / `sign` / `biz_content`，在支付宝侧无法完成任何真实支付
- 真实充值路径是 admin 后台的 `POST /api/admin/users/[id]/recharge`，不经过 webhook

**结论：** 这条支付链路从未接通，实现支付宝 RSA2 + 微信 WECHATPAY2-SHA256-RSA2048 验签与 AEAD-AES-256-GCM 解密是在为一条死链路投入数天工作，且需要商户凭证才能验证。**关闭端点是数量级更优的止血方式。**

**实现约束：**

- 用 `PAYMENT_ENABLED` env flag 控制，**默认关闭**（未显式设为 `"true"` 即视为关闭）
- 关闭时三个端点直接返回 410 Gone，**不得触达** `processPaymentCallback`，**不得创建** `RechargeOrder`
- `src/lib/billing/payment.ts` 与两个 webhook 里的验签 TODO 注释**全部保留**，不要删——未来支付批次要在此基础上实现
- admin 充值路径不受此 flag 影响

**未来重新开启支付时必须一并完成（写在此处防止遗忘）：**
1. 支付宝 RSA2 验签 + 微信 AEAD 解密验签
2. C2 的幂等 CAS：`processPaymentCallback` 的幂等判断移入事务，改 `updateMany({ where: { id, status: "PENDING" } })`，`count === 0` 则跳过。**验签无法替代这一条**——真实支付网关的重试会并发触达，两个根因独立。
3. `paymentUrl` 改为真实 SDK 生成

---

## 3. F-SH-03 的前置数据核验（不得跳过）

移除 fallback 后，任何「不是启用中别名、但曾经能通过底层模型名调通」的引用都会变成 404。改代码之前必须先确认没有存量引用：

```sql
-- Action 配置的模型串
SELECT DISTINCT a.model
FROM actions a
WHERE NOT EXISTS (
  SELECT 1 FROM model_aliases ma WHERE ma.alias = a.model AND ma.enabled = true
);
```

有落单项时：**先把这些 Action 的 model 迁移到对应别名，再改代码**。不得直接让存量 Action 404。核验结果（无论有无落单）写入 commit message 或交接说明。

---

## 4. F-SH-04 的三个必测分片场景

根因：`src/lib/engine/sse-parser.ts:30-31` 的 `currentEvent` / `dataLines` 声明在 `transform()` 内部，每个 chunk 重置；而 `buffer` 正确地在闭包里。导致「data 行已到齐、终止空行还没到」的事件被静默丢弃。

单测必须覆盖（括号内为修复前的实际表现）：

| 场景 | 输入 chunks | 期望解析出 |
|---|---|---|
| A 每帧独立到达 | `["data: {\"i\":1}\n\n", "data: {\"i\":2}\n\n"]` | `[1, 2]`（修复前也正确） |
| B 边界落在帧内两换行之间 | `["data: {\"i\":1}\n", "\ndata: {\"i\":2}\n\n"]` | `[1, 2]`（修复前丢 1） |
| C 多帧合并且以完整 data 行结尾 | `["data: {\"i\":1}\n\ndata: {\"i\":2}\n", "\ndata: {\"i\":3}\n\n"]` | `[1, 2, 3]`（修复前丢 2） |

同时保持不变：`[DONE]` 触发 `controller.terminate()`；`:` 开头的注释行（keepalive / OpenRouter processing）被忽略；`event:` 字段解析。

**为什么这条是 P0 而不是普通 bug：** 多数 OpenAI 兼容服务商把 `usage` 放在 `[DONE]` 之前的最后一个 data 帧。该帧被丢 → `route.ts` 的 `lastUsage` 为 null → `calculateTokenCost(null, …)` 返回 `{costUsd:0, sellUsd:0}` → `shouldDeduct=false` → **该次调用完全不计费**。所以它同时是内容正确性问题和计费问题。

---

## 5. F-SH-01 的三组只读查询

**严格只读。不得 UPDATE / DELETE / 不得改任何生产数据。**

```sql
-- (a) C6 / H13 共同指纹：成功调用但卖价 0，而成本 > 0
SELECT "modelName",
       COUNT(*)            AS calls,
       SUM("costPrice")    AS total_cost_usd,
       MIN("createdAt")    AS first_seen,
       MAX("createdAt")    AS last_seen
FROM call_logs
WHERE status = 'SUCCESS' AND "sellPrice" = 0 AND "costPrice" > 0
GROUP BY "modelName"
ORDER BY calls DESC;

-- (b) C1 / C2 指纹一：同一 paymentOrderId 出现多条 RECHARGE
SELECT "paymentOrderId", COUNT(*) AS n, SUM(amount) AS total
FROM transactions
WHERE type = 'RECHARGE' AND "paymentOrderId" IS NOT NULL
GROUP BY "paymentOrderId"
HAVING COUNT(*) > 1;

-- (c) C1 指纹二：已完成的充值订单里，paymentRaw 不含真实支付签名字段
SELECT id, "userId", amount, "paymentMethod", "paidAt",
       "paymentRaw" ? 'sign' AS has_sign
FROM recharge_orders
WHERE status = 'COMPLETED'
ORDER BY "paidAt" DESC
LIMIT 100;
```

**结论要求：** 报告必须对「C1 是否已被实际利用」给出明确的是/否判断，而不只是罗列数据。(a) 组的结果同时用于估算 C6/H13 造成的累计收入泄漏。

**时序要求：** 本条必须在 F-SH-02..05 的修复**部署到生产之前**完成。由于部署由用户在 done 阶段手动触发，Codex 在 verifying 阶段执行本条即可满足该时序。

---

## 6. 验收总门槛

- 四条 generator 功能各自独立 commit，CI 全绿（lint + tsc）
- `npm run build` PASS
- 全量 vitest PASS（本批次新增单测：F-SH-03 两条、F-SH-04 三条、F-SH-05 一条）
- F-SH-01 报告落 `docs/test-reports/`
- Codex 签收报告落 `docs/test-reports/BL-SEC-HOTFIX-2608-signoff-YYYY-MM-DD.md`

## 7. 不在本批次范围

明确不做，避免 scope 蔓延：

- C3 扣费回滚 / C4 模板测试通道 → `BL-SEC-BILLING-GATE`
- H1 XFF / H2 embeddings 权限门 / H9 JWT 失效 → `BL-SEC-BILLING-GATE`
- H3 / H4 / H5 / H6 / H7 / H8 / H10 / H11 / H12 + Medium → `BL-SEC-GUARDRAIL-PARITY`
- npm audit 17 项 high（含 next / undici）→ 独立依赖升级批次，须配完整 E2E 回归
- 生产 admin 密码轮换 + `.auto-memory/environment.md` 去明文 → 用户本人操作，不走状态机
