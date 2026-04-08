# Templates List — Design Notes

## Ignore (fabricated)
- "ID: TMP-8821" custom ID format — Template uses cuid, not custom IDs
- "Aggregator" execution mode badge — StepRole enum has SEQUENTIAL/SPLITTER/BRANCH/MERGE, no AGGREGATOR. Map MERGE display as "Merge" not "Aggregator".

## Ignore (no backend support)
- "Import from Library" button — no template library/marketplace API

## Partial support
- "Global Library" tab — isPublic field exists but no user-side public template list API. Omit for now.

## Fully supported
- Name, steps count, execution mode (Sequential/Fan-out), description, created date, search, pagination, "Create Template" button
