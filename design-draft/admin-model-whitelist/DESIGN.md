# Admin Model Whitelist — Design Notes

## Ignore (fabricated)
- "New" badge on recently added models — no isNew field or logic
- Provider logos/icons — no logo URL stored, use text name
- "New Deployment" sidebar button — no deployment management API

## Needs backend work
- Pagination — GET /admin/models returns all models, no page/limit params. Implement client-side pagination as workaround.
- GET single model detail — /admin/models/:id only has PATCH, no GET handler. Use data from list response.

## Partial support
- Stats cards (Total/Enabled/Providers) — derive client-side from full model list
- Provider dropdown filter — filter param exists but no endpoint returns provider list. Hardcode or derive from data.
- Cost price display — only available via /admin/channels or /admin/models-channels, not in /admin/models response
- Health status column — must fetch separately from /admin/health

## Fully supported
- Enable/disable toggle (PATCH /admin/models/:id with enabled:true/false), sell price edit, modality filter, search, model name/context/modality display
