# CI1-test-infrastructure Reverifying Round 10 Report 2026-04-11

## 结论

- 总体结论：**FAIL（回退 fixing）**
- 通过项：`vitest`、`mcp-finops-hardening`
- 失败项：`mcp-dx-round2`、`security-billing-polish`

## 环境

- 本地 L1：`http://localhost:3099`
- 启动方式：`bash scripts/test/codex-setup.sh` + `bash scripts/test/codex-wait.sh`
- 阶段：`reverifying`（fix round 10）

## 执行结果

1. `npx vitest run`
   - PASS：`11/11`

2. `npx tsx scripts/test/mcp-dx-round2-e2e-2026-04-06.ts`
   - FAIL：`9 passed / 2 failed`
   - 失败点：
     - `core tools callable (smoke)`：`[provider_error] Provider request failed: fetch failed`
     - `error: rate limit exceeded`：返回了 `[rate_limited] ...` 但脚本仍判失败

3. `npx tsx scripts/test/mcp-finops-hardening-e2e-2026-04-07.ts`
   - PASS：`9 passed / 0 failed`

4. `npx tsx scripts/test/security-billing-polish-e2e-2026-04-07.ts`
   - FAIL：`3 passed / 2 failed`
   - 失败点：
     - `F-SB-01 MCP generate_image invalid size sanitized`：`expected error`
     - `F-SB-02 chat call deducts balance`：`[provider_error] Provider request failed: fetch failed`

## 影响

- CI1 仍未满足“改造后脚本稳定通过”验收标准。
- 需 Generator 继续修复脚本/本地 mock 链路后再复验。
