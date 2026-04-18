# BL-SEC-CRED-HARDEN 验收用例（待执行）

- 批次：`BL-SEC-CRED-HARDEN`
- 阶段：`verifying` / `reverifying`
- 目标功能：`F-CH-04`（`executor: codex`）
- 当前状态：**仅准备用例，不执行测试**

## 验收范围

1. 清除代码中的硬编码密码与 secret fallback（允许 docs 引用，代码需清零）。
2. `image-proxy` secret 缺失时 fail-fast（启动或调用阶段立即报错）。
3. `scripts` 与 E2E 脚本改为 env 驱动，缺失时明确退出。
4. `.env.example` 补齐本批次新增变量。
5. 构建、类型检查、专项单测通过。

## 前置条件（执行时）

1. 已由 Generator 完成 `F-CH-01 ~ F-CH-03` 并推送。
2. 本地环境使用 Codex 端口：
1. `bash scripts/test/codex-setup.sh`
2. `bash scripts/test/codex-wait.sh`
3. Node 依赖已安装（`npm ci` 或 `npm install` 已完成）。
4. 需要可控测试 env（用于正反向验证）：
1. `ADMIN_TEST_PASSWORD`
2. `E2E_TEST_PASSWORD`
3. `ADMIN_SEED_PASSWORD`
4. `IMAGE_PROXY_SECRET`（可为空用于 fail-fast 验证）

## L1 本地验收矩阵

### TC-CH-01 硬编码凭证静态扫描清零
- 目的：确认代码层不再存在已知硬编码密码/secret。
- 步骤：
1. 运行：`git grep -n -i 'admin123' -- ':!docs/**'`
2. 运行：`git grep -n 'Codex@2026' -- ':!docs/**'`
3. 运行：`git grep -n 'Test1234' -- ':!docs/**'`
4. 运行：`git grep -n 'aigc-gateway-image-proxy-dev-secret' -- ':!docs/**'`
- 期望：
1. 四条命令均无命中（exit code=1 或空输出）。
2. 若 docs 中仍有历史引用，不计为失败。

### TC-CH-02 `.env.example` 变量完整性
- 目的：确认新增变量已文档化。
- 步骤：
1. 运行：`grep -nE '^(ADMIN_SEED_PASSWORD|ADMIN_TEST_PASSWORD|E2E_TEST_PASSWORD|IMAGE_PROXY_SECRET)=' .env.example`
- 期望：
1. 命中 4 条变量定义。
2. 变量名与 spec 完全一致。

### TC-CH-03 构建与类型检查
- 目的：确认批次改动未破坏基础可构建性。
- 步骤：
1. 运行：`npx tsc --noEmit`
2. 运行：`npm run build`
- 期望：
1. 两条命令均 exit code=0。
2. 无新增 TypeScript 错误。

### TC-CH-04 image-proxy 专项单测
- 目的：确认 secret fallback 改造的行为正确。
- 步骤：
1. 运行：`npx vitest run src/lib/api/__tests__/image-proxy.test.ts`
- 期望：
1. exit code=0。
2. 覆盖以下语义：
 - 三个 secret 全空时报错。
 - `IMAGE_PROXY_SECRET/AUTH_SECRET/NEXTAUTH_SECRET` 任一存在时可通过。

### TC-CH-05 image-proxy fail-fast（负向）
- 目的：确认无 secret 时不会静默退化运行。
- 步骤：
1. 临时清空：`IMAGE_PROXY_SECRET= AUTH_SECRET= NEXTAUTH_SECRET=`
2. 启动应用：`npm run dev`（或触发 image-proxy 相关调用）
- 期望：
1. 立即抛出明确错误（包含变量名提示）。
2. 进程退出或请求失败，不出现默认 dev secret 兜底。

### TC-CH-06 image-proxy fallback 链（正向）
- 目的：确认三级 env fallback 仍可工作（但无硬编码常量）。
- 步骤：
1. 仅设置 `NEXTAUTH_SECRET=xxx`，其余两项清空。
2. 运行相关单测或最小调用验证签名函数可正常执行。
- 期望：
1. 不报“缺失 secret”错误。
2. 功能路径可继续。

### TC-CH-07 admin-auth 缺失 env 退出（负向）
- 目的：确认脚本 requireEnv fail-fast。
- 步骤：
1. 清空 `ADMIN_TEST_PASSWORD`。
2. 运行：`npx tsx scripts/admin-auth.ts`
- 期望：
1. 非零退出码（exit 1）。
2. 输出包含 `Missing env: ADMIN_TEST_PASSWORD`。

### TC-CH-08 admin-auth 设置 env 可执行（正向）
- 目的：确认脚本在提供 env 后可正常工作。
- 步骤：
1. 设置 `ADMIN_TEST_PASSWORD=<valid-password>`。
2. 运行：`npx tsx scripts/admin-auth.ts`
- 期望：
1. exit code=0。
2. 输出 token 前缀（或等效成功标记）。

### TC-CH-09 seed 缺失 env 退出（负向）
- 目的：确认 seed 不再使用硬编码密码。
- 步骤：
1. 清空 `ADMIN_SEED_PASSWORD`。
2. 运行：`npx tsx prisma/seed.ts`
- 期望：
1. 非零退出。
2. 错误信息包含 `ADMIN_SEED_PASSWORD`。

### TC-CH-10 seed 幂等性与不重置密码（正向）
- 目的：确认改造后仍满足 seed 幂等，不误重置既有 admin 密码。
- 步骤：
1. 设置 `ADMIN_SEED_PASSWORD=<pwd-a>` 跑一次 seed。
2. 再次运行 seed（可改为 `<pwd-b>`）。
3. 检查 admin 用户记录是否保持既有 passwordHash（update 块未覆盖）。
- 期望：
1. seed 可重复执行。
2. 已存在 admin 密码哈希不被第二次 seed 重置。

### TC-CH-11 scripts 全量引用 requireEnv（静态）
- 目的：确认 `Codex@2026!` / `Test1234` 命中脚本均已改 env 读取。
- 步骤：
1. 用 `git grep -l` 枚举本批改动脚本。
2. 检查对应文件包含 `requireEnv('ADMIN_TEST_PASSWORD')` 或 `requireEnv('E2E_TEST_PASSWORD')`。
- 期望：
1. 历史命中文件均已完成替换。
2. 不再出现硬编码密码常量。

## 执行输出（执行时）

1. 验证报告（建议）：
`docs/test-reports/bl-sec-cred-harden-verifying-local-2026-04-18.md`
2. 全量通过后 signoff：
`docs/test-reports/BL-SEC-CRED-HARDEN-signoff-2026-04-18.md`

## 备注

1. 当前仅完成用例准备，未执行任何验收命令。
2. 收到你“开始测试”指令后，将按上述用例逐项执行并输出证据。
