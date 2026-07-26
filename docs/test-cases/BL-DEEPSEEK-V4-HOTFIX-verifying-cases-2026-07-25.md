# BL-DEEPSEEK-V4-HOTFIX 验收测试用例

- 批次：`BL-DEEPSEEK-V4-HOTFIX`
- 阶段：`verifying`
- Evaluator：`Reviewer`
- 日期：2026-07-25
- 需求来源：`docs/specs/BL-DEEPSEEK-V4-HOTFIX-spec.md` §3 F-DSV4-01 至 F-DSV4-06
- 环境：L1 `http://localhost:3199`；L2 `https://aigc.guangai.ai`

## 范围与假设

- 先执行 L1 smoke、功能专项测试和既有 E2E 回归，再执行规格明确要求的最小 L2 生产验证。
- L2 允许四次最小真实文本调用及相应测试账号扣费；不执行部署、migration、通知外发、批量回填或删除。
- 健康检查恢复与生产告警可见性依赖新代码部署。若生产仍运行旧版本，则相关生产项记为 `BLOCKED`，不把未部署行为误判为代码缺陷。

## 测试用例

### TC-DSV4-001 L1 环境 smoke

- Priority: Critical
- Requirement Source: AGENTS.md §3、§7；F-DSV4-06.7
- Preconditions: PostgreSQL / Redis 可用。
- Steps:
  1. 在持久 PTY 前台运行 `bash scripts/test/codex-setup.sh`。
  2. 在另一 shell 运行 `bash scripts/test/codex-wait.sh`。
  3. 请求 `GET /v1/models`。
- Expected Result: 数据库重置、migration、seed、build 和 `:3199` 启动成功；wait ready；接口可响应。

### TC-DSV4-002 止血脚本 dry-run 与幂等

- Priority: Critical
- Requirement Source: F-DSV4-01、F-DSV4-06.2
- Preconditions: 本地 seed 数据库；脚本默认 dry-run。
- Steps:
  1. 使用本地测试数据库运行 `scripts/hotfix-deepseek-v4-retire-legacy.ts`，不传 `--apply`。
  2. 检查脚本在上游拉取失败、空模型集合、无陈旧 ACTIVE 通道时的处理。
  3. 对照生产既有执行证据，并在 L2 只读查询当前通道状态。
- Expected Result: dry-run 不写库；失败或空集合 fail closed；生产无 ACTIVE 陈旧 `realModelId`；重跑待变更为 0。

### TC-DSV4-003 调度器丢锁后自动重抢

- Priority: Critical
- Requirement Source: F-DSV4-02、F-DSV4-06.3
- Preconditions: Vitest；leader-lock / probe / SystemLog 可 mock。
- Steps:
  1. 运行 `scheduler-leadership.test.ts`。
  2. 验证丢锁后不 probe、转入 standby。
  3. 验证重抢失败继续 standby；重抢成功后恢复 probe。
  4. 验证同一时刻只有持锁者 probe，并检查状态迁移日志断言。
- Expected Result: 全部断言 PASS；无 leadership 时绝不 probe。

### TC-DSV4-004 缩水护栏告警与节流

- Priority: High
- Requirement Source: F-DSV4-03、F-DSV4-06.4
- Preconditions: Vitest；SystemLog / Notification 可 mock。
- Steps:
  1. 运行 `reconcile-skip-alert.test.ts`。
  2. 分别触发 `<50%` 和 `0 models` 护栏。
  3. 连续触发同 provider 同问题。
  4. 运行未命中护栏场景。
- Expected Result: 首次命中各产生一条 SYNC/WARN SystemLog 与管理员通知；连续命中不轰炸；未命中不写告警。

### TC-DSV4-005 通知偏好结构覆盖与回填 dry-run

- Priority: High
- Requirement Source: F-DSV4-03 补充交付、spec §6.5
- Preconditions: migration 已在 L1 数据库落地。
- Steps:
  1. 运行 `notification-preference-coverage.test.ts`。
  2. 在本地数据库运行 `scripts/backfill-notification-preferences.ts` dry-run。
  3. 检查 dry-run 不写库且枚举全集被 seed 覆盖。
- Expected Result: 结构约束 PASS；dry-run 可执行且无写入。

### TC-DSV4-006 sync LLM 新链首与无重复 model 风险

- Priority: Medium
- Requirement Source: F-DSV4-04、F-DSV4-06.5
- Preconditions: Vitest；本地 seed 数据。
- Steps:
  1. 运行 `internal-llm.test.ts`。
  2. 断言链为 `deepseek-v4-flash -> glm-5 -> doubao-pro`，首项成功时不访问后续别名。
  3. 检查 DeepSeek adapter 与 canonical-name 匹配逻辑。
  4. 查询本地/生产同 `realModelId` 重复 model 风险。
- Expected Result: 链首直接命中；fallback 与 chain-rot 告警正常；sync 命名不会创建重复 model。

### TC-DSV4-007 模型名类 400 正向 failover

- Priority: High
- Requirement Source: F-DSV4-05、F-DSV4-06.6
- Preconditions: Vitest。
- Steps:
  1. 运行 `unsupported-model-failover.test.ts`。
  2. 输入已实测的模型不存在响应文案。
  3. 验证错误映射为 `MODEL_NOT_FOUND` 并尝试下一通道。
  4. 验证全部候选失败时仍保留上游原文。
- Expected Result: 自动跨通道成功；最终错误可定位。

### TC-DSV4-008 参数类 400 反向不 failover

- Priority: Critical
- Requirement Source: F-DSV4-05 D4、F-DSV4-06.6
- Preconditions: Vitest。
- Steps:
  1. 输入 temperature / 参数非法类 400。
  2. 记录第二通道调用次数。
- Expected Result: 映射仍为 `INVALID_REQUEST`；第二通道调用次数为 0。

### TC-DSV4-009 全量静态与单元回归

- Priority: Critical
- Requirement Source: F-DSV4-02 至 F-DSV4-06.7
- Preconditions: 依赖、Prisma client 已生成。
- Steps:
  1. 运行 `npm run typecheck`。
  2. 运行 `npm run build`。
  3. 运行 `npm test -- --run`。
- Expected Result: 三项全绿；skip 项仅为仓库既有受控 skip。

### TC-DSV4-010 既有 API E2E 回归

- Priority: High
- Requirement Source: F-DSV4-06.7
- Preconditions: L1 服务 ready。
- Steps:
  1. 运行 `BASE_URL=http://localhost:3199 npx tsx scripts/e2e-test.ts`。
  2. 运行 `BASE_URL=http://localhost:3199 npx tsx scripts/e2e-errors.ts`。
- Expected Result: 两个脚本无新增回归；L1 PLACEHOLDER key 导致的真实 AI 502 按分层规则识别，不误报产品缺陷。

### TC-DSV4-011 既有 MCP E2E 回归

- Priority: High
- Requirement Source: F-DSV4-06.7
- Preconditions: 从 L1 seed 数据获取测试 API key。
- Steps:
  1. 运行 `scripts/test-mcp.ts`。
  2. 运行 `scripts/test-mcp-errors.ts`。
- Expected Result: MCP 协议、认证、Tools 与错误语义无新增回归；真实 AI 调用限制按 L1 规则记录。

### TC-DSV4-012 L2 四别名真实调用与计费

- Priority: Critical
- Requirement Source: F-DSV4-01、F-DSV4-06.1
- Preconditions: 生产测试 API key 可用；记录调用前余额。
- Steps:
  1. 分别最小调用 `deepseek-v3`、`deepseek-r1`、`deepseek-v4-pro`、`deepseek-v4-flash`。
  2. 记录 traceId、返回状态与调用后余额。
  3. 只读查询对应 CallLog 与 Transaction。
- Expected Result: 四次均 SUCCESS；`sellPrice > 0`；每次存在对应 `DEDUCTION` Transaction，金额与 CallLog 一致。

### TC-DSV4-013 L2 生产数据与调度恢复只读检查

- Priority: Critical
- Requirement Source: F-DSV4-02、F-DSV4-03、F-DSV4-04、F-DSV4-06.2-.5
- Preconditions: SSH 只读访问生产 PostgreSQL；明确区分已部署与未部署代码。
- Steps:
  1. 查询 deepseek provider ACTIVE 通道及上游 `/models` 集合。
  2. 查询 `health_checks.max(createdAt)` 与近期写入分布。
  3. 查询近期 `SystemLog(category=SYNC, level=WARN)` 和通知节流证据。
  4. 查询新 sync LLM 三别名 enabled 状态与 DeepSeek model/channel 重复项。
- Expected Result: 无 ACTIVE 陈旧通道；健康检查持续推进；已部署后护栏告警可见且节流；链首 enabled 且无重复 model。

## 判定规则

- `PASS`：行为完全符合规格。
- `FAIL`：已执行且行为违反规格，必须记录可复现证据。
- `BLOCKED`：受未部署、环境、权限或数据前置条件阻塞，不替代为 PASS。
- 任一 Critical 用例 FAIL/PARTIAL，则批次返回 `fixing`；全部验收项 PASS 且签收报告存在后才可置 `done`。
