# CI1-test-infrastructure Reverifying Round 7 Report 2026-04-11

## 结论

- 总体结论：**FAIL（回退 fixing）**
- 通过项：无（本轮在前置注册/查库阶段中断）
- 失败项：F-CI1-01、F-CI1-02

## 环境

- 本地 L1：`http://localhost:3099`
- 启动方式：`bash scripts/test/codex-setup.sh` + `bash scripts/test/codex-wait.sh`
- 阶段：`reverifying`（fix round 7）

## 执行结果

1. `npx tsx scripts/test/mcp-dx-round2-e2e-2026-04-06.ts`
   - FAIL：`registerAndLogin: user not found in database`
   - 报错点：`scripts/test/mcp-dx-round2-e2e-2026-04-06.ts:123`

2. `npx tsx scripts/test/mcp-finops-hardening-e2e-2026-04-07.ts`
   - FAIL：`registerAndLogin: user not found in database`
   - 报错点：`scripts/test/mcp-finops-hardening-e2e-2026-04-07.ts:148`

3. `npx tsx scripts/test/security-billing-polish-e2e-2026-04-07.ts`
   - FAIL：`registerAndLogin: user not found in database`
   - 报错点：`scripts/test/security-billing-polish-e2e-2026-04-07.ts:158`

## 关键证据

- 执行脚本的 shell 环境中：`DATABASE_URL` 为空
- 仓库 `.env`：`DATABASE_URL=postgresql://yixingzhou@localhost:5432/aigc_gateway`
- `codex-setup.sh` 服务进程使用 `scripts/test/codex-env.sh` 指向测试库：`aigc_gateway_test`

## 根因判断

- 三个脚本均依赖“HTTP 注册后，脚本侧 Prisma 立刻按 email 查用户”。
- 当前复验中，脚本进程与服务进程数据库连接未对齐（脚本默认回落到 `.env` 的开发库），导致脚本侧查不到刚注册用户，统一在 `registerAndLogin` 失败。

## 影响

- F-CI1-01/F-CI1-02 仍未达到可复验通过状态。
- CI1 不能签收，需继续 fixing 后再复验。
