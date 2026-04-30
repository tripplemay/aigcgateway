# tests/unit/

Cross-module unit tests that don't fit naturally next to a single source
file (e.g. i18n catalog cohesion, config-shape sanity, helper combinators
that span domains).

Module-local unit tests live next to the code under
`src/**/__tests__/*.test.ts`. Add a file here only when the test logically
covers more than one src module.

Run: `npm run test` (picks up both this dir and `src/**/__tests__/`).
