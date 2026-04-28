# BL-EMBEDDING-MVP Signoff (2026-04-28)

- Batch: BL-EMBEDDING-MVP
- Stage: reverifying
- Evaluator: codex (Reviewer)
- Verdict: PASS

## Acceptance Checklist (F-EM-06)
1. Static tsc/build/vitest: PASS (`516 tests passed`)
2. Prisma migrate/generate: PASS（由 generator 完成并在 fix-round 期间持续通过）
3. SDK build: PASS
4. POST /v1/embeddings single: PASS（200，`bge-m3`，dim=1024，usage>0）
5. POST /v1/embeddings batch: PASS（200，3 条向量，dims=1024x3）
6. POST /v1/embeddings with chat model: PASS（400 `invalid_model_modality`）
7. CallLog pricing/modality evidence: PASS（`get_log_detail` 显示 source=api、model=bge-m3、cost 非零）
8. create_action modality=EMBEDDING: PASS
9. run_action variables.text=hello: PASS（SSE 返回 `type=embedding`、`modality=EMBEDDING`、`dimensions=1024`）
10. MCP embed_text: PASS（返回 embedding，dim=1024）
11. SDK gateway.embed(): PASS（生产实测返回 dim=1024）
12. Production data state: PASS（`/v1/models?modality=embedding` 返回 `bge-m3` + `text-embedding-3-small`）
13. Production bge-m3 real call: PASS（200，cost `$0.00000005` < `$0.001`）
14. Signoff report: PASS（本文件）

## Key Evidence
- Artifacts: `docs/test-reports/artifacts/bl-embedding-mvp-2026-04-28-codex-reverifying-round3/`
- Trace IDs:
  - embeddings single: `trc_a8eu9v63j5i6uy7cxynyrmd2`
  - embeddings batch: `trc_llmgk7vvvoxc0m6i3ql9a2cm`
  - action run: `trc_eesb4s2s9q4b4eobrr1y8lea`
  - mcp embed_text: `trc_w6t9eaf0ploicm2cvbw1n4ry`

## Notes
- SDK 初次 404 为调用方式错误（`baseUrl` 误传含 `/v1` 导致双前缀）；按 SDK 规范改为 `https://aigc.guangai.ai` 后验证通过。
- 生产复验以 2026-04-28 本轮证据为准，早前失败轮次保留在历史报告中。
