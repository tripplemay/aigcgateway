# BL-SEC-INFRA-GUARD 验收用例（待执行）

- 批次：`BL-SEC-INFRA-GUARD`
- 阶段：`verifying` / `reverifying`
- 目标功能：`F-IG-07`（`executor: codex`）
- 当前状态：**仅准备用例，不执行测试**

## 验收范围

1. admin PATCH 白名单与 baseUrl 协议防护（5 项）。
2. scheduler/model-sync 分布式锁行为（2 项）。
3. 脚本 shell 注入防护（1 项）。
4. MCP 权限一致性（2 项）。
5. 告警去重（1 项）。
6. 依赖升级与构建健全（3 项）。
7. 生产冒烟回归（1 项）。

## 前置条件（执行时）

1. Generator 已完成并推送 `F-IG-01` ~ `F-IG-06`。
2. 本地测试环境使用 Codex 端口：
1. `bash scripts/test/codex-setup.sh`
2. `bash scripts/test/codex-wait.sh`
3. 需可访问 Redis（用于锁与告警去重验证）。
4. 生产项需要你明确授权后执行（含 SSH 与最小必要写操作）。

## L1 本地验收矩阵

### TC-IG-01 providerConfig PATCH 禁止敏感字段透传
- 目的：验证 `apiKey/id` 等敏感字段不允许 mass assignment。
- 步骤：
1. 对 provider config PATCH 发送恶意 body（含 `apiKey`、`id`）。
2. 观察响应与数据库实际写入。
- 期望：
1. 请求被拒（400）或敏感字段被 schema 丢弃。
2. DB 中敏感字段无未授权变化。

### TC-IG-02 channel PATCH 白名单校验
- 目的：验证 channel 更新仅允许 schema 白名单字段。
- 步骤：
1. PATCH body 含非法字段（如 `createdAt`、越权状态值等）。
- 期望：
1. 非白名单字段被拒绝/忽略，返回结构符合约定。

### TC-IG-03 model POST/PATCH 禁止越权字段
- 目的：验证 model create/update 不接受 `projectId` 等不应出现字段。
- 步骤：
1. 对 model POST/PATCH 注入 `projectId` 等恶意字段。
- 期望：
1. 非法字段被拒绝或丢弃，且不影响目标实体权限边界。

### TC-IG-04 provider PATCH baseUrl 协议校验（file://）
- 目的：验证 `baseUrl=file://...` 被拦截。
- 步骤：
1. 调用 provider PATCH，设置 `baseUrl='file:///etc/passwd'`。
- 期望：
1. 返回 400（含校验错误信息）。

### TC-IG-05 provider PATCH baseUrl 协议校验（javascript:）
- 目的：验证 `baseUrl=javascript:...` 被拦截。
- 步骤：
1. 调用 provider PATCH，设置 `baseUrl='javascript:alert(1)'`。
- 期望：
1. 返回 400（含校验错误信息）。

### TC-IG-06 双实例下 scheduler 单主运行
- 目的：验证分布式锁生效，仅一个实例执行 scheduler。
- 步骤：
1. 启动两个本地实例（不同端口）。
2. 观察日志与任务执行痕迹。
- 期望：
1. 同一时刻仅一个实例持有 leader 并执行 scheduler/model-sync。

### TC-IG-07 Redis 不可用 fallback 行为
- 目的：验证 Redis 不可用时降级逻辑与警告日志。
- 步骤：
1. 停止 Redis 后启动服务。
2. 观察日志与行为。
- 期望：
1. 出现明确 warn 日志。
2. 服务可运行（按本地 fallback 逻辑）。

### TC-IG-08 stress-test shell 注入防护
- 目的：验证 `scripts/stress-test.ts` 不执行环境变量注入命令。
- 步骤：
1. 执行：`BASE_URL='; echo pwn >/tmp/rce-test' npx tsx scripts/stress-test.ts`
2. 检查 `/tmp/rce-test` 是否存在。
- 期望：
1. `/tmp/rce-test` 不存在。

### TC-IG-09 MCP fork-public-template 权限收敛
- 目的：验证 `projectInfo:false` key 无法 fork public template。
- 步骤：
1. 使用 `projectInfo:false` key 调用 fork 工具。
- 期望：
1. 返回 403（或等效未授权错误）。

### TC-IG-10 MCP 空白名单 key 拒绝访问
- 目的：验证空 IP whitelist 的 MCP key 明确拒绝。
- 步骤：
1. 使用空 whitelist 的 MCP key 调用任一工具。
- 期望：
1. 返回 401/未授权，且语义与 REST 层一致。

### TC-IG-11 balance 告警去重
- 目的：验证同用户同日同阈值只告警一次。
- 步骤：
1. 触发一次低余额告警。
2. 同日重复触发同阈值场景。
3. 检查 Redis 去重 key 与告警发送记录。
- 期望：
1. 首次触发发送成功。
2. 第二次被去重跳过。

### TC-IG-12 npm audit 结果
- 目的：验证依赖升级后高危告警清零。
- 步骤：
1. `npm audit --production`
- 期望：
1. `high=0` 且 `critical=0`。

### TC-IG-13 构建健全
- 目的：验证升级后构建与类型、测试通过。
- 步骤：
1. `npm run build`
2. `npx tsc --noEmit`
3. `npx vitest run`
- 期望：
1. 三项通过。

## L2 生产冒烟（执行前需你授权）

### TC-IG-14 生产登录与 dashboard 回归
- 目的：验证核心登录链路无回归。
- 步骤：
1. 生产登录。
2. 访问 dashboard 核心页面。
- 期望：
1. 登录成功，dashboard 正常渲染。

### TC-IG-15 生产 AI 调用回归
- 目的：验证升级后核心 API 调用链路可用。
- 步骤：
1. 发起一次最小成本 `/v1/chat/completions` 调用。
2. 检查返回与日志。
- 期望：
1. 请求成功且无新增异常回归。

## 执行输出（执行时）

1. 本地验证报告（建议）：
`docs/test-reports/bl-sec-infra-guard-verifying-local-2026-04-18.md`
2. 全量通过后 signoff：
`docs/test-reports/BL-SEC-INFRA-GUARD-signoff-2026-04-18.md`

## 备注

1. 当前仅完成用例准备，未执行任何测试命令。
2. 收到你“开始测试”指令后，按本用例逐项执行并附证据。
