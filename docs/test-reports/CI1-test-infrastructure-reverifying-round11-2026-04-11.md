# CI1-test-infrastructure Reverifying Round 11 Report 2026-04-11

## 结论

- 总体结论：**FAIL（回退 fixing）**
- 通过项：`vitest`、`mcp-finops-hardening`
- 失败项：`mcp-dx-round2`、`security-billing-polish` 各剩 1 项

## 环境

- 本地 L1：`http://localhost:3099`
- 启动方式：`bash scripts/test/codex-setup.sh` + `bash scripts/test/codex-wait.sh`
- 阶段：`reverifying`（fix round 11）

## 执行结果

1. `npx vitest run`
   - PASS：`11/11`

2. `npx tsx scripts/test/mcp-dx-round2-e2e-2026-04-06.ts`
   - FAIL：`10 passed / 1 failed`
   - 失败点：
     - `core tools callable (smoke)`：`[provider_error] Provider request failed: fetch failed`

3. `npx tsx scripts/test/mcp-finops-hardening-e2e-2026-04-07.ts`
   - PASS：`9 passed / 0 failed`

4. `npx tsx scripts/test/security-billing-polish-e2e-2026-04-07.ts`
   - FAIL：`4 passed / 1 failed`
   - 失败点：
     - `F-SB-02 chat call deducts balance`：`[provider_error] Provider request failed: fetch failed`

## 结论说明

- 断言漂移已基本清除，本轮剩余阻塞高度集中在同一类问题：`chat` 链路偶发 `provider_error(fetch failed)`。
- CI1 仍未达到“现有脚本改造后稳定通过”签收标准。
