# BL-DEEPSEEK-V4-HOTFIX 签收报告

- 批次：`BL-DEEPSEEK-V4-HOTFIX`
- 阶段：fix round 4 `reverifying -> done`
- Evaluator：`Reviewer`
- 日期：2026-07-26（America/Los_Angeles）
- 被测提交：`401a7da`
- 生产 checkout：`26b3272`
- 最终结论：**PASS，签收**

## Summary

- Scope：F-DSV4-01 至 F-DSV4-07、DSV4-DEF-01 至 DSV4-DEF-04、14 条验收用例。
- Documents：`docs/specs/BL-DEEPSEEK-V4-HOTFIX-spec.md`、`docs/test-cases/BL-DEEPSEEK-V4-HOTFIX-verifying-cases-2026-07-25.md`、前序验证/部署报告。
- L1 Environment：`http://localhost:3199`，fresh PostgreSQL `localhost:63819`，按 `codex-setup.sh` 持久 PTY 前台启动。
- Production：`https://aigc.guangai.ai`，仅通过 SSH/SQL 做只读核验；未新增付费模型调用、生产写入或 live routing 修改。
- Result totals：14 PASS / 0 FAIL / 0 BLOCKED。

## Test Cases

- TC-DSV4-001 L1 环境 smoke - PASS
- TC-DSV4-002 止血脚本 dry-run 与幂等 - PASS
- TC-DSV4-003 调度器丢锁后自动重抢 - PASS
- TC-DSV4-004 缩水护栏告警与节流 - PASS
- TC-DSV4-005 通知偏好结构覆盖与回填 dry-run - PASS
- TC-DSV4-006 sync LLM 新链首与无重复 model 风险 - PASS
- TC-DSV4-007 模型名类 400 正向 failover - PASS
- TC-DSV4-008 参数类 400 反向不 failover - PASS
- TC-DSV4-009 全量静态与单元回归 - PASS
- TC-DSV4-010 既有 API E2E 回归 - PASS
- TC-DSV4-011 既有 MCP E2E 回归 - PASS
- TC-DSV4-012 L2 四别名真实调用与计费 - PASS
- TC-DSV4-013 L2 生产数据与调度恢复只读检查 - PASS
- TC-DSV4-014 DEGRADED 通道恢复不受目录闸门误拦 - PASS

## Execution Evidence

### DSV4-DEF-04 定向复验

- `tests/unit/dsv4-recovery-veto-status.test.ts` 与健康恢复相关 5 文件：44/44 PASS。
- 批次 12 个关键测试文件：103/103 PASS。
- DEGRADED + full probe PASS 后写回 ACTIVE；DISABLED + reachability 且目录缺失仍被 veto，并写 `AUTO_RECOVERY/WARN`；目录存在则正常恢复。

### 全量回归

- `npx vitest run`：90 files PASS；746 PASS / 3 SKIP / 0 FAIL。
- `npm run typecheck`：PASS。
- `npm run typecheck:scripts`：PASS。
- `npm run lint`：PASS，仅既有 warning。
- `npm run build`：PASS（由规定的 setup 流程执行）。
- `npm ci`：成功；报告 35 个既有依赖漏洞（4 low / 15 moderate / 16 high）。

### L1 规范脚本

- `e2e-test.ts`：21 PASS / 0 FAIL / 9 SKIP。
- `e2e-errors.ts`：11 PASS / 0 FAIL / 2 SKIP。
- `test-mcp.ts`：32 PASS / 0 FAIL / 14 SKIP。
- `test-mcp-errors.ts`：8 PASS / 0 FAIL / 3 SKIP。
- `scripts/test-all.sh`：Overall PASS；合计 72 PASS / 0 FAIL / 28 SKIP。
- SKIP 均来自 L1 无真实 provider key/模型，不影响协议、认证、错误语义、路由逻辑和脚本门禁结论。

### 生产只读证据

- app `running/healthy`；查询时 checkout `26b3272`，容器创建于 `2026-07-26T19:17:23Z`。
- DeepSeek 三条陈旧通道保持 DISABLED：`deepseek-chat` 两条、`deepseek-reasoner` 一条；`deepseek-v4-flash`、`deepseek-v4-pro` 为 ACTIVE。
- 健康检查持续推进：`max(createdAt)=2026-07-27 04:02:37Z`；近 10 分钟 12 条、近 60 分钟 51 条。
- `AUTO_RECOVERY/WARN` 持续否决 `deepseek-chat` / `deepseek-reasoner`；远端目录数仍为 2。
- `SYNC/WARN` 同时覆盖 zero-model 与 shrink-guard；`SYNC_RECONCILE_SKIPPED` 已有 10 条 SENT 通知，5 名 ADMIN 均有 enabled 偏好。
- sync LLM 三个候选别名 `deepseek-v4-flash` / `glm-5` / `doubao-pro` 均 enabled；精确 v4 model 名保持唯一。
- 8 条既有授权 trace 全部 SUCCESS；四个目标别名均有成功记录。`deepseek-v3` 落到 volcengine / `deepseek-v3-ark`，`deepseek-r1` 落到 openrouter / `deepseek/deepseek-r1`；每条 COMPLETED DEDUCTION 均与 `sellPrice` 精确相反。

## Defects

- 无新增未关闭缺陷。DSV4-DEF-04 已由 `401a7da` 修复并通过 evaluator 原始红灯及双向边界回归。

## Coverage Gaps / Risks

- `401a7da` 尚未部署；生产仍为 `26b3272`。本轮改动仅放宽 DEGRADED 的恢复路径，不改变已验证的 DeepSeek 止血状态。上线前需由用户按 Harness 触发 Deploy，部署后执行 checkout/health smoke。
- 未在生产把真实通道临时改为 DEGRADED：这会影响 live routing；使用确定性 `checkChannel` 回归覆盖该分支。
- 未新增生产付费调用：复核既有授权 trace 与 Transaction，避免额外扣费和统计污染。
- siliconflow 4 条、openrouter 2 条目录缺席通道将保持 DISABLED，需运维人工判断；这是已授权取舍。
- DeepSeek v4 `costPrice` 被 reconcile 覆盖为 0，及其他 provider 成本价缺失，属于已记录的批次外数据治理问题。
- `.auto-memory/environment.md` 记录的部署路径 `/opt/aigc-gateway` 已漂移；实际路径为 `/opt/apps/aigc-gateway`，应由 Planner 更新环境记忆。

## Open Questions

- 无阻断签收的规格缺口。部署后 smoke 与成本价治理进入后续运维/批次处理。

## Signoff

F-DSV4-06 七项验收范围及新增 DSV4-DEF-04 回归全部通过，批次签收为 **PASS**。`docs.signoff` 可指向本报告，状态可置为 `done`。
