# Project Status (<=30 lines)

- Updated: 2026-04-27 15:05 UTC+8
- Current batch: BL-RECON-FIX-PHASE1
- Phase/state: done
- Signoff: docs/test-reports/BL-RECON-FIX-PHASE1-signoff-2026-04-27.md
- Verification: PASS (F-RF-04 10/10)
- Static checks: tsc/build/vitest all passed (452 tests)
- Fetcher fix evidence: ExpenseDate filter tests passed + cross-5days model row only on 2026-04-02
- Currency fix evidence: 3.25 CNY -> 0.44525 USD; details includes upstreamAmountOriginal/currency/exchangeRateApplied
- Audit script evidence: test DB baseline run passed; mock image token channel produced ⚠️ marker
- Exclusions respected: no prod reconcile rerun, no historical backfill, no channel pricing mutation
- Artifacts: docs/test-reports/artifacts/bl-recon-fix-phase1-2026-04-27-codex-verifying/
