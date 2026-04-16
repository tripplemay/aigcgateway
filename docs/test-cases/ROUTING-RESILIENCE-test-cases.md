# ROUTING-RESILIENCE 测试用例

## 测试分层

- **L1（代码审查+tsc）**：类型检查、逻辑路径分析
- **L2（生产验证）**：真实 API 调用验证 failover 行为

---

## F-RR-01: Scheduler 只检查 aliased channel

### TC-01-1: 孤儿 channel 不参与调度
- **前置**：生产 DB 有 ~400 channel，其中 ~330 孤儿
- **验证**：scheduler 日志中被检查的 channel 数量应 ≤ aliased channel 数（~71），不包含孤儿
- **方法**：L1 代码审查 WHERE 条件 + L2 检查 scheduler 日志

### TC-01-2: 参数提升确认
- **验证**：`MAX_CHECKS_PER_ROUND >= 20`，`MAX_PROBES_PER_ROUND >= 5`
- **方法**：L1 代码审查 scheduler.ts 常量

### TC-01-3: 全覆盖时间估算
- **验证**：~71 channels / 20 per round = ~4 rounds × 1min interval ≈ 4 分钟（相比之前 ~15 分钟）
- **方法**：L1 计算验证

---

## F-RR-02: 请求级 channel failover

### TC-02-1: 可重试错误自动 failover
- **前置**：别名下有多个 channel，priority 最高的返回 provider_error / model_not_found / timeout / 5xx
- **验证**：请求自动重试下一个 channel 并成功返回
- **方法**：L2 — 临时 disable 最高优先级 channel，发起调用，确认成功（走了 failover）

### TC-02-2: 确定性错误不重试
- **验证**：400 / 402 / 429 错误直接返回，不触发 failover
- **方法**：L1 代码审查 failover 逻辑中的错误分类判断

### TC-02-3: 最大重试次数限制
- **验证**：重试次数 = min(候选 channel 数, 3)
- **方法**：L1 代码审查

### TC-02-4: rate limit 回滚
- **验证**：failover 重试前回滚已计入的 rate limit 计数
- **方法**：L1 代码审查 rollbackRateLimit 调用

### TC-02-5: 重试日志记录
- **验证**：每次 failover 重试产生 console.warn 日志
- **方法**：L1 代码审查 + L2 检查服务器日志

### TC-02-6: 全部 channel 失败
- **验证**：所有候选 channel 均失败后，返回最后一个错误给用户
- **方法**：L1 代码审查

---

## F-RR-03: RouteResult 返回候选列表

### TC-03-1: routeByAlias 返回排序候选列表
- **验证**：返回类型包含 candidates 数组（或等效结构）
- **方法**：L1 代码审查 types.ts + router.ts

### TC-03-2: 排序规则
- **验证**：candidates 按 priority ASC 排序，health=PASS 优先于 health=NULL
- **方法**：L1 代码审查排序逻辑

### TC-03-3: 向后兼容
- **验证**：现有调用方（chat/image/MCP）仍正常工作
- **方法**：L2 生产验证正常调用不受影响

### TC-03-4: FAIL channel 已过滤
- **验证**：health=FAIL 的 channel 不出现在 candidates 中
- **方法**：L1 代码审查 WHERE 条件

---

## F-RR-04: 孤儿 channel 清理脚本

### TC-04-1: dry-run 模式
- **验证**：默认运行列出孤儿 channel，不修改数据
- **方法**：L2 生产执行 dry-run

### TC-04-2: --apply 模式
- **验证**：设置 enabled=false（不删除），幂等可重复
- **方法**：L1 代码审查

### TC-04-3: 输出合理数量
- **验证**：dry-run 输出 ~300 个孤儿（与诊断一致）
- **方法**：L2 生产 dry-run

---

## F-RR-05: 全量 L2 验收（核心场景）

### TC-05-1: Failover 端到端验证
1. 选一个有多 channel 的别名（如 glm-4.7-flash）
2. 通过 admin API 临时 DISABLE 最高优先级 channel
3. 发起 chat 调用 → 应成功（failover 到下一个 channel）
4. 检查响应中是否有 failover 痕迹（如 x-failover 头或日志）
5. 恢复 channel → 调用仍正常

### TC-05-2: 正常调用不受影响
- 对未改动的模型发起调用 → 正常返回，无多余延迟

### TC-05-3: Scheduler 行为验证
- 检查 scheduler 日志 → 只包含 aliased channel ID
- 单轮检查数量 ≤ 20

---

## 执行优先级

1. **tsc 通过**（阻塞一切）
2. **TC-02-1 + TC-05-1**（failover 是本批核心价值）
3. **TC-01-1 + TC-01-2**（scheduler 效率）
4. **TC-03-1~3**（RouteResult 结构）
5. **TC-04-1**（孤儿清理 dry-run）
6. 其余 L1 代码审查项
