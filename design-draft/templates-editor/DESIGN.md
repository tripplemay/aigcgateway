# Template Editor — Design Notes

## Ignore (fabricated)
- "Auto-Optimization" toggle ("Let AI refine step parameters") — does not exist
- "Pipeline Stats" panel (EST. LATENCY / TOKEN COST) — no estimation API

## Ignore (no backend support)
- "Dry Run Test" button — /v1/templates/run has no dry_run param (Actions have it, Templates do not)

## Partial support
- Step role dropdown shows SEQUENTIAL/SPLITTER/AGGREGATOR — should be SEQUENTIAL/SPLITTER/BRANCH/MERGE (use actual StepRole enum)
- Drag-to-reorder steps — PUT entire steps array to reorder, no dedicated reorder endpoint

## Fully supported
- Template name, description, step selection (from existing Actions), step ordering, save/cancel
