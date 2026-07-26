# BL-DEEPSEEK-V4-HOTFIX fix round 1 复验报告

- 批次：`BL-DEEPSEEK-V4-HOTFIX`
- 阶段：`reverifying`
- Evaluator：`Reviewer`
- 日期：2026-07-26
- 最终结论：**FAIL，退回 fixing**
- Signoff：**未签收**（`docs.signoff` 保持 `null`）

## 1. 测试目标与环境

- 目标：复验 DSV4-DEF-01、F-DSV4-01 至 F-DSV4-07 及 F-DSV4-06 七项签收范围。
- L1：`bash scripts/test/codex-setup.sh` 前台 PTY，`http://localhost:3199`，fresh PostgreSQL `localhost:63819`。
- L2：生产 `https://aigc.guangai.ai` 与 `deploysvr`，仅执行调用记录、数据库、Redis、容器和日志的只读核验。
- 被测提交：本地 `609032b`；生产 checkout / app 镜像对应 `5f57af6`。

## 2. 覆盖摘要

| 结果 | 数量 | 用例 |
|---|---:|---|
| PASS | 11 | TC-001 至 TC-009、TC-012、TC-013 |
| FAIL | 2 | TC-010、TC-011 |
| BLOCKED | 0 | - |

## 3. 通过项

- DSV4-DEF-01 定向回归：缺陷核心场景及共享 trigger 回归在内的定向集合 `23/23 PASS`；调度器、sync LLM、400 正反 failover 另有 `40/40 PASS`。
- 静态与构建：`npm run typecheck`、`npm run typecheck:scripts`、`npm run lint`、setup 内 `npm run build` 均通过；lint 仅有仓库既有 warning。
- 全量回归（使用 L1 实际 `DATABASE_URL`）：`87 files / 733 PASS / 3 SKIP`。
- 通知偏好回填：fresh DB dry-run 待补 7 行，`--apply` 新增 7 行，再次 dry-run 为 0。
- 生产止血：DeepSeek provider 仅 v4-pro / v4-flash 两条 ACTIVE，陈旧 ACTIVE 通道计数为 0；两个 v4 realModelId 均只对应一个 model。
- 生产调度：`health_checks.max(createdAt)` 从部署前 2026-07-23 推进到 `2026-07-26 08:45:19Z`，查询时近 10 分钟 18 条、近 40 分钟 117 条。
- 生产告警：xiaomi-mimo `zero_models` 与 zhipu `shrink_guard` 均有 SYNC/WARN；回填后各向 5 名管理员投递，Redis 仅保留两枚成功投递后的 24h 去重键。
- 生产调用/计费：四别名既有四条独立验收 trace 及部署后两条 spot-check 均为 SUCCESS；每条 `sellPrice > 0`，对应 COMPLETED DEDUCTION 金额与 sellPrice 精确相反。
- sync LLM：生产 `deepseek-v4-flash` enabled 且有 4 条 ACTIVE 通道，日志无 `chain rot`；单测验证链首成功时不访问后续别名。

## 4. 失败项

| 脚本 | 结果 | 关键失败 |
|---|---:|---|
| `scripts/e2e-test.ts` | 20 PASS / 7 FAIL / 3 SKIP | AI 调用已 SKIP，但余额扣减、DEDUCTION、CallLog 等依赖断言继续 FAIL；另有模型列表、public template 401、abort 无日志等漂移 |
| `scripts/e2e-errors.ts` | 11 PASS / 1 FAIL / 1 SKIP | 无文本模型时余额不足用例仍回退不存在的 `deepseek-v3`，实际 404 而非预期 402 |
| `scripts/test-mcp.ts` | 32 PASS / 14 FAIL | `list_models` 返回 0 后没有 SKIP 传播，chat、余额、trace、billing、image 等依赖链继续 FAIL |
| `scripts/test-mcp-errors.ts` | 8 PASS / 3 FAIL | 无模型时仍硬依赖 `deepseek-v3`；31 秒 cooldown 后仍处于 60 秒限流窗口，后续 invalid-size 用例被 429 污染 |

四个脚本均以 exit code 1 退出，因此统一入口 `scripts/test-all.sh` 必然失败，TC-DSV4-010/011 不能签收。

## 5. 缺陷 DSV4-DEF-02 [High]

- 标题：F-DSV4-07 对无模型环境的 SKIP 处理不完整，四个规范 L1 回归脚本仍全部失败
- 环境：fresh L1，`localhost:3199`，provider key 未配置，`/v1/models` 无可用 text/image alias
- 前置条件：按规定完成 `codex-setup.sh` 与 `codex-wait.sh`；MCP 脚本使用本地创建且已充值的有效 key
- 复现步骤：依次执行 `e2e-test.ts`、`e2e-errors.ts`、`test-mcp.ts`、`test-mcp-errors.ts`
- 实际结果：四个脚本分别以 7、1、14、3 个失败项退出；详见 §4
- 预期结果：无真实模型所阻塞的调用及其依赖断言统一记 SKIP；与模型无关的协议/认证/错误语义继续验证；脚本 exit 0
- 影响范围：F-DSV4-07、F-DSV4-06、TC-DSV4-010、TC-DSV4-011；L1 统一回归入口无法作为可信门禁
- 严重级别：High
- 是否稳定复现：是
- 备注：`typecheck:scripts` 与 4 个脚本内旧 `deepseek/v3`（斜杠形式）清理均已通过，本缺陷是运行时状态传播和仍存脚本漂移，不是类型错误。

## 6. 风险与未执行项

- 未在生产临时篡改 live channel 的 `realModelId` 做动态 failover；正反行为由 `unsupported-model-failover.test.ts` 覆盖，避免在已有阻断缺陷时继续扰动生产路由。
- 本地 Redis DB 0 保留了上一轮同名去重键，真实启动态不适合作为独立缺陷复现；本轮以隔离 FakeRedis 回归和生产天然时序证据共同验收 DSV4-DEF-01。
- `npm ci` 报告 35 个依赖漏洞（4 low / 15 moderate / 16 high），为既有依赖风险，本批次未改依赖治理范围。

## 7. 结论

DSV4-DEF-01、生产部署、健康调度、护栏通知、四别名路由与计费均通过。F-DSV4-07 的运行时验收失败，故 F-DSV4-06 不签收，批次返回 `fixing`。
