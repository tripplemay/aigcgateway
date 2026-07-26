# BL-DEEPSEEK-V4-HOTFIX fix round 2 复验报告

- 批次：`BL-DEEPSEEK-V4-HOTFIX`
- 阶段：`reverifying`
- Evaluator：`Reviewer`
- 日期：2026-07-26
- 被测提交：本地 `bc975b5`；生产 `5f57af6`
- 最终结论：**FAIL，退回 fixing**
- Signoff：**未签收**（`docs.signoff` 保持 `null`）

## 1. 测试目标与环境

- 目标：复验 DSV4-DEF-02，并重新执行 F-DSV4-01 至 F-DSV4-07、F-DSV4-06 的 13 个验收用例。
- L1：按规定在持久 PTY 运行 `bash scripts/test/codex-setup.sh`，`http://localhost:3199`，fresh PostgreSQL `localhost:63819`。
- L2：生产 `https://aigc.guangai.ai` 与 `deploysvr`；本轮仅执行数据库、Redis、容器、上游 `/models` 的只读核验，没有修改生产数据。

## 2. 覆盖摘要

| 结果 | 数量 | 用例 |
|---|---:|---|
| PASS | 11 | TC-DSV4-001、003 至 012 |
| FAIL | 2 | TC-DSV4-002、013 |
| BLOCKED | 0 | - |

## 3. 本地复验结果

- DSV4-DEF-02 已通过：`scripts/test-all.sh` Overall PASS；`e2e-test` 21 PASS / 0 FAIL / 9 SKIP，`e2e-errors` 11/0/2，`test-mcp` 32/0/14，`test-mcp-errors` 8/0/3。SKIP 均为 fresh L1 无真实模型导致的调用链受阻，协议、认证、参数校验和错误语义仍实际执行。
- 全量 Vitest：87 files / 733 PASS / 3 SKIP / 0 FAIL。
- 本批次 7 个定向测试文件：63/63 PASS，覆盖告警去重、调度器 leadership、sync LLM、400 正反 failover、通知偏好与止血脚本。
- 静态与构建：`npm run typecheck`、`npm run typecheck:scripts`、`npm run lint`、setup 内 `npm run build` 均通过；lint 仅有仓库既有 warning。
- 通知偏好回填：dry-run 待补 7 行，`--apply` 新增 7 行，再次 dry-run 待补 0 行，幂等通过。

## 4. 生产通过项

- app 容器运行且 healthy，生产 checkout 为 `5f57af6`。
- 健康调度持续运行：2026-07-26 15:58:11Z 查询时，`health_checks.max(createdAt)=15:56:27Z`，近 10 分钟 5 条、近 60 分钟 30 条。
- 上游实时 `GET https://api.deepseek.com/models` 仍只返回 `deepseek-v4-flash`、`deepseek-v4-pro`。
- 护栏通知保持 10 条；5 名管理员均有 7/7 enabled 偏好；Redis 仅有 `xiaomi-mimo:zero_models`、`zhipu:shrink_guard` 两枚 24h 去重键。
- 六条验收 trace 均为 SUCCESS，`sellPrice > 0`，COMPLETED DEDUCTION 金额与 `sellPrice` 精确相反：
  - `trc_p17jok3xt1pe388ii9yctyev`、`trc_h5z8f08rp001izb9ld9ce6vy`
  - `trc_mh85othptgo4ip40xdoiyp58`、`trc_slecmg8bbu2cqpo896w9xjnr`
  - `trc_eoecssmhar9vod2fgkhi6gwh`、`trc_fya7u1iyhr3t4ocuegahwsp4`

## 5. 失败项：DSV4-DEF-03 [High]

- 标题：健康恢复任务会重新激活已按上游 `/models` 下架的 DeepSeek 陈旧通道
- 环境：生产 commit `5f57af6`，单副本 app healthy，健康调度器已恢复
- 前置条件：2026-07-25 止血脚本已把 3 条陈旧通道置为 DISABLED；上游 `/models` 仅有 v4-flash / v4-pro
- 复现步骤：
  1. 部署并启动健康调度器。
  2. 等待已启用别名下 DISABLED 文本通道进入恢复检查。
  3. 查询 `system_logs`、`health_checks` 和 DeepSeek provider 通道状态。
  4. 再次只读请求上游 `/models`，对比 ACTIVE 通道的 `realModelId`。
- 实际结果：
  - 08:44:21Z：`deepseek/deepseek-reasoner: DISABLED -> ACTIVE`，对应 `API_REACHABILITY PASS`。
  - 08:45:19Z：`deepseek/deepseek-v3: DISABLED -> ACTIVE`，对应 `API_REACHABILITY PASS`。
  - 当前两条均为 priority=1 ACTIVE，`realModelId` 分别是 `deepseek-reasoner`、`deepseek-chat`；它们均不在当前上游 `/models` 集合中。第三条未启用别名的 `deepseek-chat` 保持 DISABLED。
- 预期结果：按 F-DSV4-01 / F-DSV4-06.2，DeepSeek provider 下陈旧 `realModelId` 通道持续保持非 ACTIVE；止血不能被通用恢复任务撤销。
- 代码侧证据：DISABLED 且已挂 enabled alias 的文本通道只做零成本 reachability；reachability 仅验证 `/models` 响应存在 `data` 数组，不验证当前 `realModelId` 是否在数组中；该 PASS 随后无条件把通道更新为 ACTIVE。
- 影响范围：F-DSV4-01、F-DSV4-06、TC-DSV4-002/013。F-DSV4-05 目前可通过 failover 缓解用户可见失败，但 priority=1 的陈旧路由已重新进入候选集，止血状态不持久。
- 严重级别：High
- 是否稳定复现：是；两条 enabled alias 通道均在部署后首轮恢复窗口被激活，后续状态保持 ACTIVE。

## 6. 风险与未执行项

- 未再次执行生产真实模型调用：本轮失败由上游 `/models`、通道状态、健康记录和状态迁移日志完整证明；既有六条调用/计费证据仍一致，避免在已确认阻断项后增加生产调用与扣费。
- 未在生产临时构造错误 `realModelId`；正反 failover 由确定性测试覆盖，避免修改 live routing。
- `npm ci` 报告 35 个既有依赖漏洞（4 low / 15 moderate / 16 high），不属于本批次依赖治理范围。

## 7. 结论

DSV4-DEF-02 与本地回归已全部通过，生产健康调度、护栏通知和既有调用计费证据也正常；但恢复后的调度器撤销了 F-DSV4-01 的生产止血结果。TC-DSV4-002/013 为 Critical 且 FAIL，因此 F-DSV4-01 退回 pending，F-DSV4-06 不签收，批次返回 `fixing`。
