# Action Detail — Design Notes

## Ignore (fabricated)
- "By Sarah Chen" version author — ActionVersion has no createdBy field
- "Deployed Oct 12, 2023" activation timestamp — no activatedAt field recorded
- Developer Quick-Link URL pattern `/v1/actions/intent-classifier/v3/run` — this URL pattern does not exist, Action has no slug field. Omit this section.
- Semantic version "v3" — display as "v{versionNumber}" (integer)

## Partial support
- "Rollback" button — use existing activate-version API (PUT /actions/:id/active-version)
- "Usage: 5 Templates" — API returns usedInTemplates count, supported

## Fully supported
- Active version display, system/user messages, variables configuration, version history, delete/edit/new version buttons
