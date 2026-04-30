# BL-ALIAS-MODEL-CASCADE-ENABLE Signoff

- Batch: `BL-ALIAS-MODEL-CASCADE-ENABLE`
- Evaluator: `Codex / Reviewer`
- Date: `2026-05-01 00:50:32 CST`
- Commit under test: `905f924`
- Conclusion: `PASS`

## Scope

- `F-ACE-01`: enabling alias cascades linked `model.enabled=true`
- `F-ACE-02`: `GET /api/admin/model-aliases` exposes `linkedModels[].modelEnabled` and `channels[].lastHealthResult`
- `F-ACE-03`: Admin UI warning badges and enable-time warning toast

## Environment

- Local L1 verification only
- App started with `bash scripts/test/codex-setup.sh`
- Readiness confirmed with `bash scripts/test/codex-wait.sh`
- App URL: `http://127.0.0.1:3199`
- Test PostgreSQL container host port: `62771`

## Results

### F-ACE-01 PASS

- Created and verified a temp alias `codex-ace-1777567188252`
- `PATCH /api/admin/model-aliases/:id` with non-enable change kept linked model disabled
- `PATCH /api/admin/model-aliases/:id` with `enabled=true` cascaded linked `model.enabled` from `false` to `true`
- `GET /api/v1/models` immediately exposed the enabled alias

Evidence:

```json
{
  "aliasId": "cmolplwxw000e9y6gsj21wvyk",
  "modelId": "cmolpl9dn00049y6gbe3ga8li",
  "linkedModelEnabledAfterBrand": false,
  "linkedModelEnabledAfterEnable": true,
  "lastHealthResults": [null],
  "aliasVisibleInV1Models": true,
  "v1ModelsShape": "data[]"
}
```

### F-ACE-02 PASS

- `GET /api/admin/model-aliases` returned:
  - `linkedModels[].modelEnabled`
  - `channels[].lastHealthResult`
- Verified actual values through local API responses:
  - `price` alias latest health: `PASS`
  - `fail` alias latest health: `FAIL`
  - `ok` alias latest health: `PASS`

### F-ACE-03 PASS

- Verified in Admin UI with Playwright under `lang="en"`
- Prepared 3 stable aliases:
  - `codex-ace-ui-price-1777567233833`: enabled + no sell price + healthy latest channel
  - `codex-ace-ui-fail-1777567233833`: disabled + sell price set + all latest channels `FAIL`
  - `codex-ace-ui-ok-1777567233833`: enabled + sell price set + latest channel `PASS`
- Observed UI behavior:
  - `price` row shows `Price Not Set`
  - `fail` row shows no warning badge while disabled
  - enabling `fail` row shows toast `Warning: all channels are failing — this alias may not work for users.`
  - enabled `fail` row then shows `All Channels Failing`
  - `ok` row shows no warning badge

Evidence:

```json
{
  "lang": "en",
  "priceText": "codex-ace-ui-price-1777567233833codexwarningPrice Not SetTEXT1 linked models—deletekeyboard_arrow_down",
  "failBeforeText": "codex-ace-ui-fail-1777567233833codexTEXT1 linked models—deletekeyboard_arrow_down",
  "failAfterText": "codex-ace-ui-fail-1777567233833codexerrorAll Channels FailingTEXT1 linked models—deletekeyboard_arrow_down",
  "okText": "codex-ace-ui-ok-1777567233833codexTEXT1 linked models—deletekeyboard_arrow_down",
  "toasts": [
    "Warning: all channels are failing — this alias may not work for users."
  ]
}
```

Screenshots:

- [price-row-before.png](/Users/yixingzhou/project/aigcgateway/docs/test-reports/_artifacts/BL-ALIAS-MODEL-CASCADE-ENABLE/local-ui-verify-2026-05-01/price-row-before.png)
- [fail-row-before.png](/Users/yixingzhou/project/aigcgateway/docs/test-reports/_artifacts/BL-ALIAS-MODEL-CASCADE-ENABLE/local-ui-verify-2026-05-01/fail-row-before.png)
- [ok-row-before.png](/Users/yixingzhou/project/aigcgateway/docs/test-reports/_artifacts/BL-ALIAS-MODEL-CASCADE-ENABLE/local-ui-verify-2026-05-01/ok-row-before.png)
- [fail-row-after-enable.png](/Users/yixingzhou/project/aigcgateway/docs/test-reports/_artifacts/BL-ALIAS-MODEL-CASCADE-ENABLE/local-ui-verify-2026-05-01/fail-row-after-enable.png)
- [page-after-enable.png](/Users/yixingzhou/project/aigcgateway/docs/test-reports/_artifacts/BL-ALIAS-MODEL-CASCADE-ENABLE/local-ui-verify-2026-05-01/page-after-enable.png)

## Regression

- `npm run typecheck`: PASS
- `npm run build`: PASS
  - Build completed with pre-existing ESLint warnings only; no blocking build errors

## Risks

- UI verification ran in English locale. The Chinese keys were code-reviewed and present in `src/messages/zh-CN.json`, but this round did not render the Chinese locale in-browser.
- Verification data includes temporary aliases created for this batch and left in the test database only.

## Signoff

- All 3 features accepted
- `progress.json.docs.signoff` may be set to this report
- Recommended next status: `done`
