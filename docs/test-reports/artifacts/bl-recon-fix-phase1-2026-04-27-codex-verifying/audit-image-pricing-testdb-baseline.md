# Image Pricing Audit (2026-04-27)

BL-RECON-FIX-PHASE1 F-RF-03 — read-only audit of image-modality models and their channel cost configurations.

## Summary

- Image modality models: **0**
- Channels using token-priced costPrice (⚠️ suspect for image modality): **0**
- Channels using perCall costPrice (reasonable): **0**
- Channels with other / unknown costPrice shape: **0**

Window for 30-day call_logs aggregates: `2026-03-28T06:50:29.431Z` → `2026-04-27T06:50:29.431Z`

⚠️ marker means: modality=IMAGE AND channel.costPrice.unit==='token'. Image models charged by token may undercount when upstream bills per-call (e.g. openrouter image models).

## Per-Model Breakdown

_No image-modality models in this database._
