# Logs List — Design Notes

## Ignore (no backend support)
- "Cache Status: Hit (Edge)" — CallLog has no cacheStatus field
- "Recent Latency Trends" chart (P95 + Median) — no aggregation API
- "Cost Optimization" insight card — no recommendation engine
- "Total Logs Volume" metric with week-over-week % — no summary endpoint
- "Global View / Endpoints / Security" top nav tabs — no such APIs
- Date range filter ("Last 24 Hours") — GET /logs has no date params (can add later)

## Fully supported
- Table columns (time, traceId, model, preview, status, tokens, cost, latency)
- Status filter tabs (All/Success/Error), model filter, search, pagination
