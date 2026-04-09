# Admin Model Capabilities — Design Notes

## Ignore (fabricated)
- "Capability Utilization 84%" stat card — no backend computation
- "Enabled Functions 112" stat card — derive client-side if needed
- "Safety Sync" stat card — no safety sync concept
- "Bulk Update" button — no bulk update API
- "LAST SYNC: 2 MINS AGO" — no sync timestamp for capabilities

## Fully supported
- Model list with capability toggle switches (streaming, json_mode, function_calling, vision, reasoning, search)
- Supported Sizes chips for Image models (add/remove)
- Search + Modality filter
- Pagination (client-side)
- All via PATCH /api/admin/models/:id
