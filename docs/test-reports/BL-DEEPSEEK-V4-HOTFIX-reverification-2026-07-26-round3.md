# BL-DEEPSEEK-V4-HOTFIX fix round 3 复验报告

- 批次：`BL-DEEPSEEK-V4-HOTFIX`
- 阶段：`reverifying`
- Evaluator：`Reviewer`
- 日期：2026-07-26
- 被测提交：本地 HEAD `4ae3437`（产品修复 `618a661`）；生产 checkout `26b3272`
- 最终结论：**FAIL，退回 fixing**
- Signoff：**未签收**（`docs.signoff` 保持 `null`）

## 1. 测试范围与来源

- 源文档：`docs/specs/BL-DEEPSEEK-V4-HOTFIX-spec.md`、既有 13 个验收用例、fix round 3 部署证据。
- 范围：DSV4-DEF-03 恢复闸门、F-DSV4-01 至 07、生产止血持续性、别名语义、计费、调度、告警及全量回归。
- L1：按规定在持久 PTY 启动 `http://localhost:3199`，fresh PostgreSQL `localhost:63819`。
- L2：生产只读核验；本轮没有新增付费模型调用、生产写入或 live routing 修改。

## 2. 覆盖摘要

| 结果 | 数量 | 用例 |
|---|---:|---|
| PASS | 12 | TC-DSV4-001 至 008、010 至 013 |
| FAIL | 2 | TC-DSV4-009、014 |
| BLOCKED | 0 | - |

## 3. 通过项

- DSV4-DEF-03 目标场景与护栏专项：既有 8 个相关测试文件、90/90 PASS；覆盖 DeepSeek 两旧 ID 否决、v4 放行、EMBEDDING、endpointMap、无专属 adapter、目录失败/空目录及 leadership。
- 四组规范 L1 脚本 Overall PASS：`e2e-test` 21 PASS / 0 FAIL / 9 SKIP，`e2e-errors` 11/0/2，`test-mcp` 32/0/14，`test-mcp-errors` 8/0/3。
- 静态与构建：`npm run typecheck`、`npm run typecheck:scripts`、`npm run lint`、setup 内 `npm run build` 均通过；lint 仅有既有 warning。
- 生产部署：checkout `26b3272`，app 容器 running / healthy。
- 生产止血持续性：2026-07-26 19:49Z 查询时，DeepSeek 三条旧通道均为 DISABLED；v4-flash / v4-pro 为 ACTIVE。上游实时 `/models` 仍只列两条 v4。
- 生产闸门正反行为：19:19:35Z 否决 `deepseek-reasoner`，19:20:37Z 否决 `deepseek-chat`；同一恢复批次 19:18:35Z 正常放行 `volcengine/doubao-pro-128k`。
- 健康调度持续推进：查询时 `health_checks.max(createdAt)=19:46:34Z`，近 60 分钟 44 条。
- 别名语义与计费：`trc_ie3tolyga2tpbtieoycf2dx0` 的 `deepseek-v3` 落到 volcengine / `deepseek-v3-ark`；`trc_l6ref0pcn73fl3dvxffmqs72` 的 `deepseek-r1` 落到 openrouter / `deepseek/deepseek-r1`。两条均 SUCCESS、`sellPrice > 0`，DEDUCTION 金额精确相反。既有 v4 trace 也保持一致。
- 告警节流：两枚 `SYNC_RECONCILE_SKIPPED` Redis 去重键仍在，生产通知和管理员偏好证据未回归。

## 4. 失败项：DSV4-DEF-04 [High]

- 标题：恢复目录闸门误用于 DEGRADED 通道，真实模型 probe PASS 后仍无法恢复 ACTIVE
- 环境：本地 commit `4ae3437`，fresh L1；新增 evaluator 用例 `tests/unit/dsv4-recovery-veto-status.test.ts`
- 前置条件：TEXT 通道状态为 DEGRADED；provider 有专属 adapter，但 `/models` 目录不完整且不含该 `realModelId`；模型特定 full probe 已 PASS。
- 复现步骤：
  1. 运行 `npx vitest run tests/unit/dsv4-recovery-veto-status.test.ts`。
  2. 构造 DEGRADED 路由及仅返回两条 v4 的目录。
  3. 检查 `vetoRecovery` 返回值和 `executeCheckWithRetry` 的调用条件。
- 实际结果：用例 FAIL；日志输出 recovery veto，`prisma.channel.update({status: "ACTIVE"})` 调用次数为 0。调用方条件是 `route.channel.status !== "ACTIVE"`，因此 DEGRADED 也执行 veto 并提前 return，状态保持 DEGRADED。
- 预期结果：闸门仅处理 DSV4-DEF-03 的 DISABLED + API_REACHABILITY 场景。DEGRADED 通道执行的是模型特定 full probe，PASS 已直接证明该 realModelId 可调用，应恢复 ACTIVE。
- 证据：最终全量 Vitest 为 1 FAIL / 742 PASS / 3 SKIP（89 files）；失败断言收到目录 veto 而非 `null`。
- 影响范围：健康调度全局恢复语义。zhipu、openrouter、siliconflow 等目录不完整 provider 的可用通道若因瞬时故障进入 DEGRADED，即使后续真实 probe 成功，也会长期停留在降级路由带；spec 记录的已知取舍仅授权 DISABLED 通道不自动恢复，不包含 DEGRADED。
- 严重级别：High
- 是否稳定复现：是

## 5. 风险与未执行项

- 未新增生产付费调用：生产写入和扣费需要单独授权；本轮独立只读核验了 Generator 已授权调用产生的 trace、落点和 Transaction。
- 未在生产临时改造 DEGRADED 通道复现：该操作会影响 live routing；确定性回归测试与代码分支已完整复现。
- DeepSeek sync 已把 v4 成本价覆盖为 0，及多 provider 目录不完整/零成本价问题均为已记录遗留，不在本轮修复范围。
- `npm ci` 仍报告 35 个既有依赖漏洞（4 low / 15 moderate / 16 high）。

## 6. 最终结论

fix round 3 已修复生产事故本体，DeepSeek 止血、语义路由、调度、告警、计费和规范 L1 脚本均通过；但闸门对 DEGRADED 状态的越界造成新的全局恢复回归，使 TC-DSV4-009/014 FAIL。F-DSV4-01 退回 pending，F-DSV4-06 不签收，批次返回 `fixing`。
