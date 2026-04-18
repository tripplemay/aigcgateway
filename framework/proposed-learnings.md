# Framework 提案暂存区

> Generator 和 Evaluator 在工作中发现值得沉淀的经验时，追加到本文件。
> Planner 在 done 阶段读取本文件，逐条提交给用户确认。
> 确认后由 Planner 正式写入 `framework/` 对应文件，并在 `CHANGELOG.md` 追加记录，最后从本文件移除已确认条目。
> 已闭环条目归档到 `framework/archive/proposed-learnings-archive-vX.Y.md`。

---

<!-- 待确认的提案出现在此处，示例格式：

## [YYYY-MM-DD] [角色] — 来源：F-XXX

**类型：** 新规律 / 新坑 / 模板修订 / 铁律补充

**内容：** [一句话描述]

**建议写入：** `framework/README.md` §经验教训 / `framework/harness/xxx.md` / 其他

**状态：** 待确认

-->

## [2026-04-18] Planner — 来源：BL-SEC-BILLING-AI spec 编写偏差

**类型：** 铁律补充

**内容：** Planner 写 spec 时，若涉及具体函数签名/返回/异常语义等代码细节，**必须先 Read 对应文件核实**，不得只凭 code-review 报告或记忆推断。本次 BL-SEC-BILLING-AI 初稿 spec 把 `deduct_balance(TEXT, DECIMAL) RETURNS BOOLEAN` 写错（实为 6 参 RETURNS TABLE RAISE EXCEPTION），且错误地要求在事务内额外 `tx.transaction.create()`（函数内已 INSERT），被 Generator 开工前规格核查捕获。若 Generator 未核查就实施，会产生重复 DEDUCTION 记录破坏对账。

**建议写入：** `framework/harness/planner.md` —— 新增"spec 编写前核查清单"：
- 任何 migration 变更 → 先 Read 现存 migration 文件确认当前 schema/函数
- 任何 API 改造 → 先 Read 相关 handler + 调用方确认参数传递
- Code Review 报告是"线索"不是"真相"，涉及代码细节的结论必须 cross-check 源码
- 规格中引用实际代码签名时优先用 ` ```sql` / ` ```ts` 块贴实际代码片段 + 行号引用

**建议铁律：** "Planner 写 spec 涉及具体代码细节时，必须提供 `file:line` 引用与源码片段；Generator 可在开工前做规格核查，发现偏差的在代码开工前必须先澄清。"

**状态：** 待确认

## [2026-04-18] Planner — 来源：BL-SEC-BILLING-AI F-BA-03 生产部署失败 / BILLING-CHECK-FOLLOWUP 启动

**类型：** 铁律补充（上一条的专项延伸）

**内容：** Code Review 报告的**事实性断言**（特别是符号/类型/约束/枚举值类）不是真相，**必须用生产数据 + 源码代码双路交叉验证**。本次 H-16 报告声称 `Transaction.amount 的 DEDUCTION/REFUND 应 <0`，但实际代码 `scripts/refund-zero-image-audit.ts:102` 存 `+sellPrice` 为正数；7 行生产 REFUND amount>0 是业务正确的。基于错误断言写的 CHECK migration 在生产 `prisma migrate deploy` 失败，需 hotfix 回滚 + 开新批次修正。

**建议写入：** `framework/harness/planner.md` —— "spec 编写前核查清单"补充：
- Code Review 报告的断言（符号/类型/约束/枚举/常量）按"线索"对待，**不按"真相"采信**
- 符号/类型/约束断言的核验步骤：
  1. `grep` / `Read` 找到所有 INSERT/CREATE/UPDATE 写入点
  2. `ssh prod-db` 采样几行现网数据验证断言
  3. 两路交叉验证一致再写进 spec
- 规格中引用 Code Review 发现时，标注 "已核实" / "待核实" 状态

**建议铁律：** "Planner 引用 Code Review 报告的符号/类型/约束/枚举断言时，必须标注核验来源（生产数据抽样 + 源码行号），否则 Generator 开工前有权拒绝。"

**状态：** 待确认
