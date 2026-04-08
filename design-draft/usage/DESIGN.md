# Usage Analytics — Design Notes

Fully supported. Minor gaps:

## Ignore
- "% vs last week" comparison — API returns raw aggregates, no delta. Omit or compute client-side with two fetches.

## Fully supported
- KPI cards (calls, cost, tokens, avg latency), period selector, daily chart, model distribution donut, model ranking table
