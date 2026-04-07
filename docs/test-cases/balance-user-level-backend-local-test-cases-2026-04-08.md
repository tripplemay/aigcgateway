Summary
- Scope: balance-user-level-backend batch (F-BU-01~08) L1 local verification focusing on user-level wallet migration (DB/SQL/API/MCP/UI)
- Documents:
  - `features.json` (F-BU-01~08)
  - `docs/specs/billing-architecture.md` (余额/交易背景)
- Environment:
  - Local Codex stack via `bash scripts/test/codex-setup.sh` on `http://localhost:3099`
  - Fresh PostgreSQL test DB seeded by setup script
- Result totals:
  - 待执行

Scenario Coverage
- Scenario A – Multi-project user balance consistency + deduction + transaction filtering
- Scenario B – Admin recharge propagates to user-level balance
- Scenario C – MCP `get_balance` Tool reflects user-level balance, REST transactions remain project-filtered
- Scenario D – Sidebar wallet balance stays constant when switching projects

可执行测试用例

ID: BU-L1-01
Title: Multi-project balance shared & deduction propagates
Priority: Critical
Requirement Source: `F-BU-08`
Preconditions:
- Test user注册并创建至少两个项目
- Admin 已为该用户充值 > $10
Steps:
1. 调用 `GET /api/projects`，记录项目 A/B 的 `balance`（预期相等）。
2. 以项目 A 的 API Key 调用 `/v1/chat/completions`（使用 mock provider），触发扣费。
3. 再次 `GET /api/projects`，确认项目 A/B 的 `balance` 同步减少且仍相等。
4. 调用 `/api/projects/<A>/transactions`，应出现 `type=DEDUCTION` 记录；调用 `/api/projects/<B>/transactions` 应为空。
State Assertions:
- 任意项目查询到的余额均来自 User.balance
- 扣费来源项目触发 Transaction 记录，其余项目无记录
Cleanup:
- 无，后续用例复用同一用户
Notes / Risks:
- 需将 OpenAI provider baseUrl 指向本地 mock 以避免真实调用

ID: BU-L1-02
Title: Admin recharge updates user-level balance
Priority: High
Requirement Source: `F-BU-08`
Preconditions:
- 承接 BU-L1-01
Steps:
1. 管理员调用 `POST /api/admin/users/:userId/projects/:projectId/recharge`，给项目 B 充值 `$20`。
2. `GET /api/projects`，确认两项目余额都增加 `$20`。
State Assertions:
- Recharge 接口写入 User.balance，不再区分项目
Cleanup:
- 无
Notes / Risks:
- 充值接口仍要求 projectId，仅用于审计

ID: BU-L1-03
Title: MCP get_balance 返回用户余额 + 交易过滤
Priority: High
Requirement Source: `F-BU-08`
Preconditions:
- 承接 BU-L1-01，API Key 已存在
Steps:
1. 调用 MCP `initialize` + `tools/call(get_balance, { include_transactions: true })`。
2. 解析返回的 JSON，确认 `balance` 与 `GET /api/projects` 一致。
3. 校验 `transactions` 仅包含当前 projectId 的记录。
State Assertions:
- MCP 输出的余额与 User.balance 同步
- 交易列表依旧按 projectId 过滤
Cleanup:
- 无
Notes / Risks:
- MCP 请求需使用同一 API Key

ID: BU-L1-04
Title: Sidebar wallet balance 不随项目切换而变化
Priority: Medium
Requirement Source: `F-BU-08`
Preconditions:
- 用户有两个项目且余额 > $0
Steps:
1. 登录 Web 控制台进入 `/dashboard`，记录 Sidebar 钱包显示文案。
2. 打开项目下拉，切换到另一个项目。
3. 再次读取 Sidebar 钱包文案，确认与步骤 1 完全一致。
State Assertions:
- Sidebar 使用 User.balance，不受 Project 切换影响
Cleanup:
- 无
Notes / Risks:
- 若项目余额过低，需先通过 Admin 充值
