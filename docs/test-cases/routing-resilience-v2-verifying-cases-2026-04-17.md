# ROUTING-RESILIENCE-V2 验收用例（待执行）

- 批次：`ROUTING-RESILIENCE-V2`
- 阶段：`verifying` / `reverifying`
- 目标功能：`F-RR2-04`（`executor: codex`）
- 当前状态：**仅准备用例，不执行测试**

## 验收范围

1. `provider-aware failover`：429/401/402 跨 provider 放行，同 provider 拒绝重试。
2. `NEVER_RETRY`：`CONTENT_FILTERED` / `INVALID_REQUEST` / `INVALID_SIZE` 不重试。
3. Redis 冷却池：失败通道写入 `channel:cooldown:*`（TTL=300s），路由降权不移除。
4. Redis 不可用降级：不阻断主流程，failover 仍可进行。
5. 生产烟测：429 场景自动切 provider，冷却 key 可观察，过期后可恢复参与。

## 前置条件（执行时）

1. 已由 Generator 完成 `F-RR2-01~F-RR2-03` 并推送。
2. 本地环境：
1. `bash scripts/test/codex-setup.sh`
2. `bash scripts/test/codex-wait.sh`
3. 测试账号：
1. `codex-dev@aigc-gateway.local / Codex@2026!`（生产烟测）
2. 本地 admin/dev 账号可用。
4. Redis 可访问（本地/生产）；若不可访问，需执行“Redis 降级”用例。

## L1 本地用例矩阵（9 条）

### TC-RR2-01 跨 provider 429 自动切换
- 输入：候选 A(provider-a) 抛 `RATE_LIMITED`，候选 B(provider-b) 正常。
- 期望：
1. 返回 B 结果。
2. 尝试次数 = 2。
3. A 对应 channel 写入 cooldown key。

### TC-RR2-02 跨 provider 401 自动切换
- 输入：A 抛 `AUTH_FAILED`，B 正常。
- 期望：同 TC-RR2-01。

### TC-RR2-03 跨 provider 402 自动切换
- 输入：A 抛 `INSUFFICIENT_BALANCE`，B 正常。
- 期望：同 TC-RR2-01。

### TC-RR2-04 5xx/PROVIDER_ERROR 自动切换
- 输入：A 抛 `PROVIDER_ERROR`（或 500），B 正常。
- 期望：同 TC-RR2-01。

### TC-RR2-05 timeout 自动切换
- 输入：A 抛 timeout/generic network error，B 正常。
- 期望：同 TC-RR2-01。

### TC-RR2-06 同 provider 429 不切换
- 输入：A/B 都是同 provider，A 抛 `RATE_LIMITED`。
- 期望：
1. 不执行到 B（直接抛错）。
2. 结果为失败（429 语义）。

### TC-RR2-07 CONTENT_FILTERED 永不重试
- 输入：A 抛 `CONTENT_FILTERED`，有可选 B。
- 期望：
1. 不重试 B。
2. 直接抛错。

### TC-RR2-08 INVALID_REQUEST 永不重试
- 输入：A 抛 `INVALID_REQUEST`，有可选 B。
- 期望：同 TC-RR2-07。

### TC-RR2-09 Redis 不可用降级
- 输入：模拟 Redis 不可用，A 抛 429，B 正常。
- 期望：
1. failover 仍成功切到 B。
2. 冷却写入失败仅告警，不中断主流程。

## 路由降权行为补充用例

### TC-RR2-10 冷却中通道降权但不移除
- 输入：同优先级候选含冷却 channel 与非冷却 channel。
- 期望：
1. 非冷却优先。
2. 冷却 channel 仍保留在候选列表（非空时可兜底）。

### TC-RR2-11 health 与 cooldown 组合排序
- 输入：候选 health=PASS / NULL 混合，部分冷却。
- 期望排序：`非冷却+PASS` > `非冷却+NULL` > `冷却+PASS` > `冷却+NULL`（在同 priority 内）。

## L2 生产烟测用例（待用户授权执行）

### TC-RR2-12 生产 429 触发跨 provider 切换
- 步骤：
1. 使用 `codex-dev` 高频触发 `glm-4.7-flash` 请求，制造 zhipu 429。
2. 观察 `call_logs` 后续 provider 是否切到 openrouter。
3. 扫描 Redis key：`channel:cooldown:*` 是否出现目标 zhipu channel。
4. 清 key 或等待 300s 后复测，确认恢复参与。
- 期望：
1. 429 期间自动切换成功。
2. 冷却 key 按预期出现并过期。

## 执行输出（执行时）

1. 本地结果报告：
`docs/test-reports/routing-resilience-v2-verifying-local-e2e-2026-04-17.json`
2. 生产烟测报告（若执行）：
`docs/test-reports/routing-resilience-v2-verifying-prod-smoke-2026-04-17.md`
3. 全量通过后 signoff：
`docs/test-reports/ROUTING-RESILIENCE-V2-signoff-2026-04-17.md`

## 备注

1. 当前仅完成测试用例准备，未启动任何测试执行。
2. 收到你的“开始测试”指令后，再按本用例逐项执行并产出报告。
