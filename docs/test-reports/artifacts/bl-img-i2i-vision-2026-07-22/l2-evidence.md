# BL-IMG-I2I-VISION L2 Evidence

**Date:** 2026-07-22
**Evaluator:** Reviewer
**Environment:** local gateway `http://localhost:3199`, isolated PostgreSQL, real Volcengine/OpenRouter/Qwen providers, real GCS persistence
**Authorization:** user explicitly authorized L2 provider calls on 2026-07-22

No provider keys, service-account material, source-image base64, or signed proxy secrets are stored in this artifact.

## Commands

```bash
bash scripts/test/codex-setup.sh
bash scripts/test/codex-wait.sh
npx tsx scripts/test/bl-img-i2i-vision-verifying-e2e-2026-07-22.ts --setup
npx tsx scripts/test/bl-img-i2i-vision-l2-2026-07-22.ts --setup-real
npx tsx scripts/provision-i2i-capabilities.ts --apply
npx tsx scripts/test/bl-img-i2i-vision-l2-2026-07-22.ts --run
npx tsc --noEmit
npm run test
npx prettier --check scripts/test/bl-img-i2i-vision-l2-2026-07-22.ts
```

The first L2 pass exposed four evaluator-script assertions rather than product failures: local proxy host normalization, the intentionally absent `source_images_count` on pure t2i, asynchronous billing settlement, and the Prisma `CallStatus.ERROR` enum name. After correcting those assertions, the affected cases passed. No product implementation was modified.

## Real Provider Results

| Case | Result | Evidence |
|---|---:|---|
| Seedream URL i2i | PASS | `trc_ubzozrqja75v052o2q5ojbdl`; JPEG 1,712,152 B; GCS `images/bl_iiv_l1_project/trc_ubzozrqja75v052o2q5ojbdl/0.jpg`; source count 1; sell `$0.03288` |
| Seedream base64 i2i | PASS | `trc_cfxqlz0clssfwalxw3epdh30`; JPEG 1,909,331 B; GCS persisted; source count 1; base64 sanitized; sell `$0.03288` |
| Edits, one file | PASS | `trc_phq1z4lyid5p2svgt48batlx`; JPEG 1,016,314 B; GCS persisted; source count 1; sell `$0.03288` |
| Edits, two files | PASS | `trc_o1at4yhfxscil77pjue6e1nj`; JPEG 1,286,051 B; GCS persisted; source count 2; sell `$0.03288` |
| MCP generate_image i2i | PASS | `trc_eepe8m7l6esxspnbusmxfsfz`; proxy 200 `image/jpeg`, 1,579,593 B; GCS persisted; sell `$0.03288` |
| MCP vision | PASS | `trc_m3twju6m6gtsqxtvm5gt362r`; Qwen answer `Dog` |
| REST vision | PASS | Qwen answer `Dog` |
| REST t2i regression | PASS | `trc_kb3cgzs7veixrtj68pmspjxy`; proxy 200 `image/jpeg`, 667,895 B; GCS persisted; sell `$0.03288` |
| MCP t2i regression | PASS | `trc_dmxtg1dmp8wku12boc1s3yte`; proxy 200 `image/jpeg`, 158,241 B; GCS persisted; sell `$0.03288` |
| REST text regression | PASS | Qwen answer `OK` |
| MCP text regression | PASS | `trc_l56ygpwpe6ihkejegbuf3qn4`; answer `OK` |
| Upstream failure no-charge | PASS | `trc_h94d30mu62sfmhwftdvuauk0`; HTTP 400; CallLog `ERROR`; cost/sell 0; balance unchanged `99.66893296`; no transaction |
| OpenRouter gpt-image i2i | PASS for generation/usage | `trc_e1q9seaazr86acnqfnb364lu`; PNG 2,390,954 B; GCS persisted; usage 1297/4829; upstream cost `$0.18651` |
| OpenRouter gemini-3-pro-image i2i | PASS for generation/usage | `trc_fu1gtbokxge4soboqaqdlgdj`; JPEG 865,131 B; GCS persisted; usage 267/1379; upstream cost `$0.136434` |

## Visual Inspection

The 512x512 source is a black puppy lying on wooden boards. Seedream URL/base64, edits, GPT Image, and Gemini outputs all preserve the black puppy, pose, board layout, and primary composition while applying the requested watercolor, ink, paper-cut, or pastel style. Images are nonblank, correctly decoded, and visually related to the source.

## Production Billing Evidence

Read-only production queries found a stable billing defect:

| Alias | Alias sell price | Active channel cost | Active channel sell |
|---|---|---|---|
| `gemini-3-pro-image` | `call / 0.08274` | `token / 2,12 per 1M` | `token / 2.4,14.4 per 1M` |
| `gpt-image` | `call / 0.082603` | `token / 10,10 per 1M` | `token / 12,12 per 1M` |

Recent production successes show nonzero cost but zero sell and no transaction:

| Trace | Model | Usage | Cost | Sell | Transactions |
|---|---|---:|---:|---:|---:|
| `trc_q98vo3tr6la357e23use9h7x` | gemini-3-pro-image | 217 / 1411 | `$0.138326` | `$0` | 0 |
| `trc_ntgwyf24r5a9myjknwbchckk` | gpt-image | 2225 / 5865 | `$0.20615` | `$0` | 0 |

The last 20 production `SUCCESS` image-via-chat rows inspected (19 Gemini, 1 GPT) all had nonzero cost and `sellPrice=0`.

Code-path evidence: `processImageResultAsync` chooses token pricing from `channel.costPrice.unit`, while `calculateTokenCost` unconditionally prefers any non-null `alias.sellPrice`. A call-priced alias therefore masks the token-priced channel sell object; `inputPer1M` and `outputPer1M` become undefined, `sellUsd` becomes zero, and the deduction branch is skipped.

## Quality Gates

- Setup production build: PASS.
- `npx tsc --noEmit`: PASS.
- `npm run test`: PASS, 81 files; 670 passed / 4 skipped.
- L1 batch E2E: PASS, 44/44.
- L2 functional/provider cases: PASS, 14/14 after evaluator assertion corrections.
- F-IIV-08 OpenRouter production-equivalent billing: **FAIL**.
