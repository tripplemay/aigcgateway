# Models List — Design Notes

## Ignore (fabricated)
- "14 Active Provider Regions" stat — no region concept in data model
- "Deploy Model" button — user-side has no deploy concept

## Partial support
- Search — only admin API supports search, public /v1/models does not. Omit search bar.
- "Avg. Latency Overhead" stat — raw data on channels, no aggregation endpoint. Omit or show N/A.
- "Managed / Self-Hosted" provider badge — no hosting-type field. Omit.
