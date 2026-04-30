# Admin Model Capabilities Verifying Report — 2026-04-08

## Environment
- Stage: L1 (localhost)
- Base URL: `http://localhost:3099`
- Setup: `bash scripts/test/codex-setup.sh` + `bash scripts/test/codex-wait.sh`

## Executed Artifacts
- Test script: `scripts/test/_archive_2026Q1Q2/admin-model-capabilities-e2e-2026-04-08.ts`
- Evidence JSON: `docs/test-reports/admin-model-capabilities-e2e-2026-04-08.json`

## Result Summary
- PASS: 4
- FAIL: 1
- PARTIAL: 0

## Acceptance Check
1. AC1 Admin 页面可查看启用模型: **PASS**
2. AC2 修改 capabilities 后 list_models 返回更新: **PASS**
3. AC3 修改 supportedSizes 后 list_models 返回更新: **PASS**
4. AC4 非 Admin 无法访问页面: **PASS**
5. AC5 gpt-4o capabilities 不为空: **FAIL**

## Failure Detail
- Observed:
  - `GET /v1/models?modality=text` 中 `openai/gpt-4o` 的 `capabilities` 为空对象 `{}`。
  - 证据见 `admin-model-capabilities-e2e-2026-04-08.json` 的 `AC5` 步骤。
- Impact:
  - 违反验收标准 AC5。
  - 用户侧消费 `/v1/models` 时无法获得 gpt-4o 能力标签，影响模型能力展示与调用策略判断。
- Suspected root cause:
  - 迁移 SQL 按 `name LIKE 'gpt-4o%'` 写入能力，但当前模型名为 `openai/gpt-4o`，未命中数据迁移规则。

## Conclusion
- 当前批次进入 **fixing**。
- 建议 Generator 修复 gpt-4o（及同类 provider 前缀模型）的 capability 数据写入策略后再进入 reverifying。
