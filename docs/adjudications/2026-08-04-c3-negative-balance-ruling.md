# 裁决记录：C3 扣费失败的处理方向改为「允许扣成负数」

**日期：** 2026-08-04
**裁决人：** 用户
**提出人：** Kimi（Planner，全量后端审查 `docs/code-review/backend-fullscan-2026-08-04.md` C3）
**实施批次：** `BL-SEC-BILLING-GATE`（非本次 hotfix 批次）
**状态：** 已裁决，待实施

---

## 被推翻的既有决策

`docs/specs/BL-SEC-BILLING-AI-spec.md:245` 原文：

> 不引入业务层 FAILED callLog（余额不足时 callLog 被回滚丢弃是当前行为，保持）

该决策在当时的语境下是合理的：它针对的场景是「余额耗尽边界上的并发竞态」（spec 的场景建模是 10 个并发 $0.15 请求打 $1 余额，最终应有 6 次成功），此时丢掉少量边界 CallLog 被认为可接受。

## 为什么推翻

全量审查发现该行为可被**单线程、确定性、无限次**地重放，而非仅出现在并发边界：

- `src/lib/api/balance-middleware.ts:18-36` 的入口预检只判断 `balance > 0`，**完全不预估本次请求成本**
- `prisma/migrations/20260418_deduct_balance_for_update/migration.sql:30-32` 在余额不足时 `RAISE EXCEPTION`
- `src/lib/api/post-process.ts:404-415`（及 image / embedding 两条同构路径）把 `callLog.create` 与 `deductBalance` 包在同一 `$transaction` 里，异常导致**两者一起回滚**
- 外层只有 `.catch(err => console.error(...))`，异常被吞

净效果：用户把余额停在 $0.01，就能无限次拿到真实模型输出，且调用完全不落库——既无计费也无审计轨迹，`admin/finance` 汇总与 `bill_reconciliation` 对账都看不见。这已经从「边界个案」变成「可持续利用的免费通道」，超出了原决策的适用前提。

## 裁决内容

**采用「允许扣成负数」方案：** 修改 `deduct_balance` SQL 函数，使其在余额不足时**不再 `RAISE EXCEPTION`**，而是正常完成扣减（余额可为负）；入口预检维持 `balance > 0` 不变。

**效果：**
- 每个用户最多欠一次调用的钱，下一次请求因 `balance <= 0` 被预检拒绝
- `CallLog` 与 `Transaction` 永远成对落库，审计链不断
- 扣费路径不再有异常分支，`recordSpending`（消费速率限流）也不再被跳过

## 为什么不选另外两个方案

**方案 B：预检时预估成本并比较。** 否决理由——流式与图片生成的成本本质上事前估不准（token 数事后才知道，图片按次计价但尺寸/质量影响档位）。估高了误杀正常请求，估低了防不住，且要在三条后处理路径各维护一套估算逻辑。

**方案 C：扣费失败时在事务外补写 FAILED CallLog。** 否决理由——要在 chat / image / embedding 三处各写一遍补偿逻辑，补偿本身也可能失败，反而更容易引入新的不一致；且它只解决审计断档，不解决「免费拿到模型输出」这一半问题。

方案 A 的改动集中在**一个 SQL 函数**里，是三者中面最小的。

## 实施注意事项

1. 该 migration 需保持函数签名与返回类型不变（沿用 `20260410120000` / `20260418` 的约定），使 `post-process.ts` 调用方无需改动
2. 负余额出现后，`checkBalance` 的拒绝文案应能区分「余额为 0」与「余额为负（欠费）」，便于用户理解
3. 需核查依赖 `balance >= 0` 假设的下游：余额告警（`src/lib/billing/scheduler.ts` 的 `checkBalanceAlerts`）、admin finance 汇总、对账 job，确认负值不会导致展示或统计异常
4. 需要一条覆盖「余额 $0.01 + 成本 $0.20 的请求」的回归测试，断言：调用成功、余额变为负、CallLog 与 Transaction 均已落库

## 关联

- 审查报告：`docs/code-review/backend-fullscan-2026-08-04.md` C3
- 被修订的 spec：`docs/specs/BL-SEC-BILLING-AI-spec.md:245`（实施时应同步更新该行，注明被本裁决取代）
- 同批次相关项：C4（模板测试通道绕过余额检查）——两者都属「计费门收敛」，在 `BL-SEC-BILLING-GATE` 一起做
