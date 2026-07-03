# BL-SYNC-ADAPTERTYPE-FALLBACK 首轮验收报告

## Summary

- Scope: `openai-compat` 通用适配器、`runModelSync` adapter 派发、生产 `guangtech` 同步结果、既有 provider 回归。
- Documents: `docs/specs/BL-SYNC-ADAPTERTYPE-FALLBACK-spec.md`, `docs/test-cases/BL-SYNC-ADAPTERTYPE-FALLBACK-verifying-cases-2026-07-03.md`
- Environment:
  - Local: `/Users/yixingzhou/project/aigcgateway`, `main@0cd5a3e`
  - Production: `https://aigc.guangai.ai`, `/opt/aigc-gateway`, `main@0cd5a3e`, PM2 `aigc-gateway` online x4
- Result totals: PASS 5, FAIL 1, BLOCKED 1
- Final conclusion: FAIL. `guangtech` adapterType fallback 已生效并完成生产同步，但验收要求的 `guangtech/<modelId>` DB 模型命名未达成，当前 `models.name` 仍为裸 `modelId`，存在跨 provider 撞名风险。

## Scenario Coverage

- TC-GT-01 通用 `openai-compat` 适配器解析标准 OpenAI `/models` - PASS
- TC-GT-02 `runModelSync` 对未知 name + `adapterType=openai-compat` 回退通用适配器 - PASS
- TC-GT-03 name 优先保护既有 named provider - PASS
- TC-GT-04 未知 adapterType 保留失败路径并输出可诊断错误 - PASS
- TC-GT-05 本地构建与 smoke - PARTIAL：单测/typecheck/build PASS；3199 smoke 因本机 PostgreSQL/Docker daemon 不可用阻塞。
- TC-GT-06 生产 guangtech 同步与 DB 副作用验收 - FAIL：同步成功，但 DB 模型命名不符合 `guangtech/<modelId>`。

## Execution Evidence

### Local Commands

- `npm run test -- tests/unit/sync/openai-compat-adapter.test.ts tests/unit/sync/model-sync-adapter-dispatch.test.ts`
  - Result: PASS, 2 files, 7 tests.
- `npm run test`
  - Result: PASS, 81 files, 669 passed, 4 skipped.
- `npx tsc --noEmit`
  - Result: PASS.
- `npm run build`
  - Result: PASS. Only existing ESLint warnings observed in console pages/log image usage/auth terminal.
- `bash scripts/test/codex-setup.sh`
  - Result: BLOCKED by environment:
    - `ERROR: docker 命令存在但 daemon 未运行。`
    - No reachable PostgreSQL fallback; did not start `localhost:3199`.

### Production Read-Only Checks

- Deploy state:
  - `/opt/aigc-gateway` commit: `0cd5a3e3b0fcf666a14e394bb40a11ccf688a980`
  - Branch: `main`
  - PM2: `aigc-gateway` online x4
- Public smoke:
  - `GET https://aigc.guangai.ai/v1/models`
  - Result: 200 JSON, 35 models.
- Upstream `guangtech /models`:
  - Result: HTTP 200, 9 ids:
    - TEXT-like: `gpt-5.5`, `gpt-5.4`, `gpt-5.4-mini`, `gpt-5.3-codex`, `gpt-5.3-codex-spark`, `gpt-5.2`
    - IMAGE-like: `gpt-image-1`, `gpt-image-1.5`, `gpt-image-2`
- `LAST_SYNC_RESULT` at `2026-07-03T08:44:17.990Z`:
  - `guangtech`: `success=true`, `apiModels=9`, `modelCount=9`, `newChannels=6`, `skippedImageChannels=3`, `disabledChannels=0`.
  - Regression providers:
    - `deepseek`: success, API 2, modelCount 2.
    - `zhipu`: success, API 8, modelCount 16.
    - `qwen`: success, API 194, modelCount 194.
    - `siliconflow`: success, API 73, modelCount 90.
    - `volcengine`: success, API 14, modelCount 14.
    - `openrouter`: success, API 312, modelCount 312.
    - `minimax`: success, API 8, modelCount 8.
  - Known unrelated provider:
    - `xiaomi-mimo`: warning/failure `API fetch failed: xiaomi-mimo /models returned 401`, existing channels preserved. This issue is explicitly out of scope in spec §3.

## Defects

- [High] `guangtech` synced channels attach to bare canonical model names, not `guangtech/<modelId>`.
  - Impact: Spec D2 and F-GT-02 acceptance #3 require guangtech model naming as `guangtech/<modelId>` to avoid cross-provider name collisions. Production DB currently stores/links models as bare ids such as `gpt-5.5`, so future providers returning the same upstream ids can collide.
  - Trigger path: production sync result after F-GT-01 deploy.
  - Evidence:
    - `LAST_SYNC_RESULT.guangtech.newChannels` shows labels like `guangtech/gpt-5.5 → gpt-5.5`.
    - Production channel query:
      - `realModelId=gpt-5.5`, `model.name=gpt-5.5`, modality `TEXT`.
      - `realModelId=gpt-5.4`, `model.name=gpt-5.4`, modality `TEXT`.
      - `realModelId=gpt-5.3-codex`, `model.name=gpt-5.3-codex`, modality `TEXT`.
    - Code path: `openaiCompatAdapter.fetchModels()` creates `name: ${provider.name}/${m.id}`, but `reconcile()` computes canonical names via `resolveCanonicalName(modelId)` and never uses `SyncedModel.name`.
  - Expected: For generic `openai-compat` fallback providers, DB model/channel naming must preserve provider prefix, or the spec/acceptance must be formally revised with a replacement collision-avoidance design.

## Blocked / Untested

- Local `localhost:3199` smoke was not executed because `scripts/test/codex-setup.sh` could not obtain PostgreSQL and Docker daemon was not running. This is an environment blocker, not a product behavior failure.
- I did not manually trigger `POST /api/admin/sync-models`; a post-deploy production sync had already run and persisted evidence. Manual triggering would be a production write/batch mutation and was unnecessary for the observed defect.

## Assumptions

- `xiaomi-mimo` 401 remains out of scope per spec §3 and was not counted as a regression for this batch.
- Existing `deepseek` "SKIPPED reconcile — model count 2 < 50% of existing 5" is treated as existing safety behavior because `LAST_SYNC_RESULT` reports provider success and no new failure was introduced by this batch.
