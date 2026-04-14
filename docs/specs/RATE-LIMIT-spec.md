# RATE-LIMIT 批次规格文档

**批次代号：** RATE-LIMIT
**目标：** 补齐限流体系的关键 gap，实现真正的突发攻击防护和消费速率保护
**触发时机：** AUDIT-CRITICAL-FIX 签收部署后立即启动
**规模：** 7 个 generator + 1 个 codex 验收 = 8 条
**来源：** reports-20260413 的 RL-001（无限流）+ RL-005（无突发消费保护）

## 背景

生产代码核实发现：
- `src/lib/api/rate-limit.ts` 已实现 **RPM 滑动窗口限流**（默认 60/min）
- REST `/v1/chat` `/v1/images/generations` `/v1/actions/run` `/v1/templates/run` + MCP 对应 4 个 tool 共 **8 个入口**都调用了 `checkRateLimit`
- `recordTokenUsage` 已实现但 **只写不读**（TPM 从未被检查）

**真正的 gap：**
1. TPM 只记录不检查（`recordTokenUsage` 存入 Redis 但没有 `checkTokenLimit`）
2. 只有项目级维度，缺 API Key 级和用户级
3. 无突发熔断（只有 60/min 滑窗，5 秒内 60 次也合法）
4. 无消费速率保护（单分钟 $X 阈值）
5. 默认值松且不可在管理端配置
6. 无管理员全局限流配置入口

## Features

### Phase 1：核心限流补齐

| ID | 标题 | 优先级 | 验收 |
|----|------|--------|------|
| F-RL-01 | TPM 检查启用（从只写改为写读） | high | 1) 新增 `checkTokenLimit(project)` 返回 ok/error；2) chat / actions / templates 入口在扣费前校验 TPM（非阻塞：先跑业务再检查 token 用量，超限则下次请求拒绝）；3) TPM 超限返回 429 `token_rate_limit_exceeded`；4) 同 commit 补 regression test；5) tsc 通过 |
| F-RL-02 | 多维度限流：API Key + User + Project 三层 | high | 1) `checkRateLimit` 签名扩展：同时检查 apiKey 级、user 级、project 级；2) 任一维度超限即 429（返回触发的维度名）；3) 默认配置：key 级 30 RPM、user 级 60 RPM、project 级保持现有逻辑；4) Redis key 命名 `rl:rpm:key:${keyId}` / `rl:rpm:user:${userId}` / `rl:rpm:project:${projectId}`；5) 同 commit 补 regression test |
| F-RL-03 | 突发熔断（burst protection） | high | 1) 新增 `checkBurst(identifier, windowSec=5, maxCount=20)`；2) 5 秒内超过 20 次 → 返回 429 `burst_limit_exceeded`，Retry-After 30；3) 与 RPM 限流并行（RPM 慢速滑窗，burst 快速防御）；4) 管理端默认可关闭（env `BURST_PROTECTION_ENABLED`）；5) 同 commit 补 regression test |
| F-RL-04 | 消费速率保护（spending rate protection） | high | 1) 每次扣费后记录到 Redis `spend:${userId}:${minute}`；2) 每分钟消费 > $DEFAULT_SPEND_LIMIT_PER_MIN（默认 $1）→ 下次请求返回 429 `spend_rate_exceeded`；3) User 或 Project 级别可配置阈值覆盖默认值；4) 超限时返回已消费金额和限额；5) 同 commit 补 regression test |

### Phase 2：管理端配置

| ID | 标题 | 优先级 | 验收 |
|----|------|--------|------|
| F-RL-05 | Project Settings 增加限流配置 UI | medium | 1) Settings Project tab 增加"限流"卡片：RPM / TPM / imageRPM / spendLimitPerMin 输入框；2) 保存到 `projects.rateLimit` JSON 字段；3) 空字段使用系统默认；4) 配置生效无需重启；5) i18n 中英文 |
| F-RL-06 | Admin 全局限流默认值配置 | medium | 1) SystemConfig 表增加 GLOBAL_DEFAULT_RPM / TPM / IMAGE_RPM / BURST_COUNT / SPEND_PER_MIN 键；2) 管理端 /admin/operations 页面增加"限流默认值"卡片编辑；3) rate-limit.ts 从 SystemConfig 读取（fallback 到 env，再 fallback 到硬编码）；4) i18n |

### Phase 3：可观测性

| ID | 标题 | 优先级 | 验收 |
|----|------|--------|------|
| F-RL-07 | 限流事件审计日志 + 429 指标统计 | medium | 1) 所有限流触发（RPM/TPM/burst/spend）写入 SystemLog 表（type='RATE_LIMIT'）；2) /admin/logs 系统日志 tab 可查看；3) usage_summary 增加 rateLimitedCount 字段；4) tsc 通过 |

### Phase 4：验收

| ID | 标题 | 优先级 | 验收 |
|----|------|--------|------|
| F-RL-08 | RATE-LIMIT 全量验收 | high | codex 执行：1) 15 并发 burst 测试 → 至少部分 429；2) TPM 超限测试 → 返回 429；3) 连续快速请求触发 burst 熔断；4) 单分钟消费超 $1 触发 spend_rate_exceeded；5) API Key / User / Project 三维度各验证一次；6) 管理端配置修改后立即生效；7) 限流事件写入 SystemLog；8) 签收报告生成 |

## 推荐执行顺序

1. **F-RL-01**（TPM 启用）— 最小改动，快速建立第二维度
2. **F-RL-02**（三层维度）— 在 F-RL-01 基础上扩展
3. **F-RL-03**（burst）— 独立新机制
4. **F-RL-04**（spend）— 业务含义最重要的保护
5. **F-RL-05/06**（管理端 UI）— 可配置化
6. **F-RL-07**（可观测性）— 收尾
7. **F-RL-08**（验收）

## 涉及的 backlog 清理

完成后关闭：
- BL-127 RATE-LIMIT → 本批次
- BL-073 高风险路径自动化测试覆盖 → F-RL-08 验收部分 + 各 feature 的 regression test

## 启动条件

- AUDIT-CRITICAL-FIX 签收 ✅
- 生产部署 ✅
- 历史退款执行 ✅
- 本规格转正为 features.json + progress.json（status: building）

## 备注

本批次**不涉及**支付侧相关的限流（如 webhook 限流）——那属于 PAYMENT-SECURITY 批次的一部分。
