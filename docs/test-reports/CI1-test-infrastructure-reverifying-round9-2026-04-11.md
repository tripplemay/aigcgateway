# CI1-test-infrastructure Reverifying Round 9 Report 2026-04-11

## 结论

- 总体结论：**FAIL（回退 fixing）**
- 通过项：F-CI1-03（Vitest）、F-CI1-04、F-CI1-02（部分验收脚本）
- 失败项：F-CI1-01、F-CI1-05（仍有 E2E 断言失败）

## 环境

- 本地 L1：`http://localhost:3099`
- 启动方式：`bash scripts/test/codex-setup.sh` + `bash scripts/test/codex-wait.sh`
- 阶段：`reverifying`（fix round 9）

## 执行结果

1. `npx vitest run`
   - PASS：`11/11`

2. `npx tsx scripts/test/_archive_2026Q1Q2/mcp-dx-round2-e2e-2026-04-06.ts`
   - FAIL：`7 passed / 4 failed`
   - 失败点：
     - `generate_image tool description contains size guidance`（缺少 `openai/gpt-image-1` 文本）
     - `list_models quality gate`（`openai/dall-e-3` capabilities 为空）
     - `list_models show_all_channels=true`（缺少 channels 字段）
     - `error: rate limit exceeded`（返回了限流错误文本但被脚本判 FAIL）

3. `npx tsx scripts/test/_archive_2026Q1Q2/mcp-finops-hardening-e2e-2026-04-07.ts`
   - PASS：`9 passed / 0 failed`

4. `npx tsx scripts/test/_archive_2026Q1Q2/security-billing-polish-e2e-2026-04-07.ts`
   - FAIL：`3 passed / 2 failed`
   - 失败点：
     - `F-SB-01 REST generate_image empty prompt sanitized`（预期错误，实际 200）
     - `F-SB-02 MIN_CHARGE applied on 1-token call`（预期 `~1e-8`，实际 `0.00000336`）

## 备注

- 并发执行 3 个 E2E 时曾短暂出现 `aliasModelLink.upsert` 的 `P2002` 唯一键冲突；串行重跑后未复现，属于并发竞争噪音，不作为本轮主阻塞结论。

## 影响

- CI1 尚不满足“改造后脚本稳定通过”。
- 需 Generator 继续修复脚本断言与当前实现/计费行为不一致问题，再进入下一轮复验。
