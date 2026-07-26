# BL-DEEPSEEK-V4-HOTFIX 首轮验收报告

- 批次：`BL-DEEPSEEK-V4-HOTFIX`
- 阶段：`verifying`
- Evaluator：`Reviewer`
- 日期：2026-07-25（生产证据时间为 UTC 2026-07-26）
- 最终结论：**FAIL，退回 fixing**
- Signoff：**未签收**（`docs.signoff` 保持 `null`）

## 1. 测试范围与依据

- 规格：`docs/specs/BL-DEEPSEEK-V4-HOTFIX-spec.md` §3 F-DSV4-01 至 F-DSV4-06
- 用例：`docs/test-cases/BL-DEEPSEEK-V4-HOTFIX-verifying-cases-2026-07-25.md`
- L1：Codex 独立测试栈 `http://localhost:3199`
- L2：`https://aigc.guangai.ai` + deploysvr 生产 PostgreSQL 只读查询
- 明确未执行：生产部署、migration、174 行通知偏好回填、通知外发、删除、批量修改

## 2. 覆盖摘要

| 结果 | 数量 | 用例 |
|---|---:|---|
| PASS | 9 | TC-001/002/003/005/006/007/008/009/012 |
| FAIL | 1 | TC-004 |
| BLOCKED | 3 | TC-010/011/013 |
| NOT RUN | 0 | — |

## 3. 执行结果

| ID | 结果 | 证据摘要 |
|---|---|---|
| TC-DSV4-001 | PASS | `codex-setup.sh` 完成 65 个 migration、seed、build；`codex-wait.sh` 首次检查 ready；`GET /v1/models` HTTP 200 |
| TC-DSV4-002 | PASS | Evaluator 新增止血脚本测试 5/5 PASS；拉取失败/空集合均零写入，dry-run 零写入，只处理陈旧 live 通道，幂等重跑 0；生产旧通道 3 条均 DISABLED |
| TC-DSV4-003 | PASS | `scheduler-leadership.test.ts` 8/8 PASS；丢锁、待命、重抢失败/成功、多轮恢复与无锁不 probe 均覆盖 |
| TC-DSV4-004 | **FAIL** | 护栏单元测试通过，但真实启动顺序中通知回填前已占用 24h 去重键，回填后首次有效通知仍被抑制；见 DSV4-DEF-01 |
| TC-DSV4-005 | PASS | enum/seed 结构测试通过；本地 dry-run 待补 7 行，`--apply` 新增 7 行，紧接着 dry-run 为 0 |
| TC-DSV4-006 | PASS | `internal-llm.test.ts` 7/7 PASS；生产三别名 enabled 且 ACTIVE 通道数为 4/4/5；v4 两个 realModelId 各唯一对应一个 model |
| TC-DSV4-007 | PASS | 真实上游模型名错误文案映射 + failover + 原文保留测试通过 |
| TC-DSV4-008 | PASS | 参数类 400 仍为 `INVALID_REQUEST`，第二通道 0 调用 |
| TC-DSV4-009 | PASS | `typecheck` PASS；setup 内 `build` PASS；全量 Vitest 86 files、725 PASS、4 SKIP |
| TC-DSV4-010 | BLOCKED | `e2e-test.ts` 17/30、`e2e-errors.ts` 11/13；失败由 L1 空模型/provider key及既有脚本漂移触发，无法声明脚本全绿 |
| TC-DSV4-011 | BLOCKED | 有效项目/余额下 `test-mcp.ts` 29/46、`test-mcp-errors.ts` 8/11；L1 无模型及脚本内部状态污染导致剩余失败 |
| TC-DSV4-012 | PASS | 生产四别名 HTTP 200；四条 CallLog SUCCESS、`sellPrice>0`；四条 COMPLETED DEDUCTION 金额与 sellPrice 一致 |
| TC-DSV4-013 | BLOCKED | 生产仍为 2026-07-12 旧容器，F-DSV4-02/03/04/05 未部署；health_checks 仍停在 2026-07-23 05:12:32Z，新通知 enum 不存在 |

## 4. 生产调用与计费证据

为本轮创建临时测试 key `pk_374f8...`（ID `cms19ysn436yaqu01ruheqas4`），到期时间 `2026-07-26T06:05:19.477Z`；原文 key 未写入报告。

| alias | HTTP / CallLog | provider / realModelId | tokens | sellPrice | Transaction |
|---|---|---|---:|---:|---:|
| `deepseek-v3` | 200 / SUCCESS | volcengine / `deepseek-v3-ark` | 10 | 0.00000037 | -0.00000037 |
| `deepseek-r1` | 200 / SUCCESS | openrouter / `deepseek/deepseek-r1` | 18 | 0.00002170 | -0.00002170 |
| `deepseek-v4-pro` | 200 / SUCCESS | qwen / `deepseek-v4-pro` | 18 | 0.00004698 | -0.00004698 |
| `deepseek-v4-flash` | 200 / SUCCESS | qwen / `deepseek-v4-flash` | 18 | 0.00000378 | -0.00000378 |

traceId：

- `trc_p17jok3xt1pe388ii9yctyev`
- `trc_h5z8f08rp001izb9ld9ce6vy`
- `trc_mh85othptgo4ip40xdoiyp58`
- `trc_slecmg8bbu2cqpo896w9xjnr`

## 5. 缺陷

### DSV4-DEF-01 [High] 部署后首次护栏通知会被回填时序吞掉 24 小时

- 影响 feature：`F-DSV4-03`
- 环境：L1 fresh DB，真实 `codex-setup.sh` 启动顺序
- 稳定复现：是
- 实际结果：应用启动后的 initial sync 先命中 `openai/siliconflow:zero_models`，Redis 已创建 `alert:sync_reconcile_skipped:*` 去重键；当时旧管理员尚无新事件偏好，dispatcher 静默返回，通知数为 0。随后执行回填，偏好已齐全，但再次触发仍因 NX key 被拦截。
- 预期结果：只有实际进入通知投递路径后才占用 24h 去重窗口；回填后的第一次有效事件必须生成管理员通知。
- 影响：新事件上线后的首个护栏告警可被抑制约 24 小时，直接削弱本 feature 的可见化目标。SystemLog 仍可见，但管理员通知验收不成立。

复现证据：

```text
回填前 initial sync 后：
  Redis keys:
    alert:sync_reconcile_skipped:openai:zero_models
    alert:sync_reconcile_skipped:siliconflow:zero_models
  SYNC_RECONCILE_SKIPPED notifications = 0

本地回填：已新增 7 行；再次 dry-run = 0

回填后、Redis ready 条件下再次触发 siliconflow：
  key TTL ≈ 85,498 秒
  notifications 中仍没有 providerName=siliconflow 的记录
```

代码定位：

- `src/lib/notifications/triggers.ts`：先 `SET ... NX EX 86400`，之后才查询管理员并调用 dispatcher。
- `src/lib/notifications/dispatcher.ts`：偏好不存在时静默 `return`，且不返回是否实际投递。
- spec §6.5：部署后才运行回填；但容器启动立即执行 initial sync，形成确定性的竞态窗口。

修复验收建议：把回填放到应用启动前，或让去重键仅在至少一名管理员实际创建通知后提交；新增“无偏好首次触发 → 回填 → 再触发必须投递”的回归测试。

## 6. E2E 阻塞与既有风险

- `e2e-test.ts` 仍断言新项目 balance 为 0，当前 welcome bonus 实际为 1；随后使用已不存在的 `/api/projects/:id/keys` 路径，造成连锁 404/401。
- L1 seed 后 `/v1/models` 为空，正向 chat/image/MCP 真实调用按分层规则不可验证。
- `test-mcp.ts` 多处引用未定义的 `selectedTextModel`。
- `test-mcp-errors.ts` 在 burst 用例后未等待限流窗口恢复，后续 context/size 校验被 429 短路。
- 上述均不是本 hotfix 引入，但 F-DSV4-06.7 的“既有 E2E 脚本不回归”目前没有全绿证据。

## 7. 结论与复验入口

- `F-DSV4-01`：PASS
- `F-DSV4-02`：L1 PASS，生产恢复待部署复验
- `F-DSV4-03`：**FAIL（DSV4-DEF-01）**
- `F-DSV4-04`：L1 PASS，生产新链待部署复验
- `F-DSV4-05`：L1 PASS，生产新分类逻辑待部署复验
- `F-DSV4-06`：FAIL，保持 pending

下一轮最小复验：DSV4-DEF-01 新回归测试 + F-DSV4-03 专项 + 全量 Vitest；代码部署并完成回填后，再验 health_checks 持续推进、SystemLog/通知可见与节流，最后补签 signoff。
