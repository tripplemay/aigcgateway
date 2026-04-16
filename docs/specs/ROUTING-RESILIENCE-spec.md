# ROUTING-RESILIENCE 批次规格文档

**批次代号：** ROUTING-RESILIENCE
**目标：** 从根本上消除"幽灵模型"问题——健康检查只覆盖有效 channel + 调用失败自动 failover
**规模：** 4 个 generator + 1 个 codex 验收 = 5 条

## 背景

生产诊断发现两个系统性架构缺陷：

1. **健康检查效率极低**：scheduler 每轮最多检查 5 个 channel，但 DB 中有 ~400 个 channel（其中 ~330 个是 model-sync 拉取但未挂到任何别名的"孤儿"）。真正需要检查的只有 ~71 个 aliased channel，但孤儿挤占了检查名额。

2. **无请求级 failover**：router 按 priority 选中一个 channel 后，如果调用失败（model_not_found / provider_error / timeout），直接返回错误给用户，不会自动重试下一个 channel。这意味着即使别名下有 8 个 channel、7 个健康，只要被选中的那 1 个坏了，用户就拿到报错。

## Features

| ID | 标题 | 优先级 | 验收 |
|----|------|--------|------|
| F-RR-01 | Scheduler 只检查 aliased channel | high | 1) runScheduledChecks 的 channel 查询增加 WHERE EXISTS (alias_model_links → enabled alias) 过滤，跳过孤儿 channel；2) 检查覆盖范围从 ~400 降到 ~71；3) 全覆盖时间从 ~15 分钟降到 ~4 分钟（71/20 轮）；4) 同步提高 MAX_CHECKS_PER_ROUND 从 5 到 20；5) MAX_PROBES_PER_ROUND 从 2 到 5；6) 孤儿 channel 的 health 状态不影响任何路由决策（本来就不影响，但明确跳过节省资源）；7) tsc 通过 |
| F-RR-02 | 请求级 channel failover | high | 1) routeByAlias 返回排序后的全部候选 channel 列表（而非只返回第一个）；2) 调用层（chat/completions、images/generations、MCP tools）在收到可重试错误时（model_not_found / provider_error / timeout / 5xx），自动尝试下一个 channel；3) 最多重试 N 次（N = min(候选数, 3)）；4) 每次重试记录日志（SystemLog 或 console.warn）；5) 最终全部失败才返回错误给用户；6) 不重试的错误类型：400 参数错误 / 402 余额不足 / 429 限流（这些是确定性错误，换 channel 也不会好）；7) 重试时回滚已计入的 rate limit 计数（rollbackRateLimit）；8) 同 commit 补 regression test；9) tsc 通过 |
| F-RR-03 | RouteResult 改为返回候选列表 | high | 1) 新增 RouteResultList 类型或修改 routeByAlias 返回 { candidates: RouteResult[], best: RouteResult }；2) 现有调用方默认用 best（向后兼容）；3) failover 逻辑使用 candidates 迭代；4) 候选按 priority ASC + health PASS 优先排序（FAIL 的已被过滤，NULL 的排在 PASS 之后）；5) tsc 通过 |
| F-RR-04 | 孤儿 channel 批量清理（可选） | low | 1) 脚本 scripts/cleanup-orphan-channels.ts：找出所有 is_aliased=false 且 model.enabled=true 的 channel，输出列表；2) --apply 时将这些 model 的 enabled 设为 false（不删除，保留历史参考）；3) 幂等可重复执行；4) dry-run 默认 |
| F-RR-05 | ROUTING-RESILIENCE 全量验收 | high | codex 执行：1) 制造一个 channel 故障（临时 DISABLE priority 最高的 channel），调用该别名应自动 fallover 到下一个 channel 并成功；2) 恢复 channel 后调用仍正常；3) scheduler 日志确认只检查 aliased channel（无孤儿出现在检查日志中）；4) 全覆盖时间显著缩短；5) 签收报告生成 |
