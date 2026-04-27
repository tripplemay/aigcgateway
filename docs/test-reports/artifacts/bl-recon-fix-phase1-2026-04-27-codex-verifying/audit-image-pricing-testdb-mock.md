# Image Pricing Audit (2026-04-27)

BL-RECON-FIX-PHASE1 F-RF-03 — read-only audit of image-modality models and their channel cost configurations.

## Summary

- Image modality models: **1**
- Channels using token-priced costPrice (⚠️ suspect for image modality): **1**
- Channels using perCall costPrice (reasonable): **0**
- Channels with other / unknown costPrice shape: **0**

Window for 30-day call_logs aggregates: `2026-03-28T06:50:29.884Z` → `2026-04-27T06:50:29.884Z`

⚠️ marker means: modality=IMAGE AND channel.costPrice.unit==='token'. Image models charged by token may undercount when upstream bills per-call (e.g. openrouter image models).

## Per-Model Breakdown

### `codex-mock-image-token-flag` (Codex Mock Image Token Flag)

- Modality: `IMAGE`
- Enabled: `true`
- Channels: 1

| Provider | Channel ID | costPrice | sellPrice | Status | Marker |
|---|---|---|---|---|---|
| openrouter | `cmogu8hlk00029ykxb0dx1or6` | `{unit:'token', in/1M:0.3, out/1M:2.5}` | `{perCall:0.04}` | ACTIVE | ⚠️ token-priced image |

**30-day call_logs:**

- Total calls: `2`
- Sum costPrice: `$0.0340`
- Sum sellPrice: `$0.0800`
- Avg costPrice/call: `$0.0170`
- Avg sellPrice/call: `$0.0400`

---

## Notes

- This script is **read-only**: it only invokes `prisma.*.findMany / aggregate`.
- Phase 2 decision: review each ⚠️ row and confirm whether the upstream provider charges per-call (translate to `{perCall:N}`) or actually charges by token (no change required).
- Sources of truth for upstream pricing:
  - openrouter: https://openrouter.ai/models — shows per-image price for image-via-chat models
  - volcengine ark: per-resolution flat fee (configured via SystemConfig)
  - chatanywhere / siliconflow: provider docs
