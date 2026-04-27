# BL-EMBEDDING-MVP 生产复验失败报告（Round 1）

- 日期：2026-04-28
- 阶段：verifying（生产复验）
- 环境：`https://aigc.guangai.ai`
- 证据目录：`docs/test-reports/artifacts/bl-embedding-mvp-2026-04-28-codex-production-reverify/`

## 结论
F-EM-06 未通过，当前应回到 `fixing`。

## 失败项
1. Acceptance #12（生产 seed 结果）FAIL
- `GET /v1/models?modality=embedding` 返回空：`{"object":"list","data":[]}`
- 证据：`prod-models-embedding.json`

2. Acceptance #13（生产 bge-m3 真调用）FAIL
- `POST /v1/embeddings {"model":"bge-m3","input":"hello"}` 返回 404
- body：`{"error":{"type":"not_found_error","code":"model_not_found","message":"Model \"bge-m3\" not found"}}`
- 证据：`prod-embedding-single.headers`、`prod-embedding-single.json`

## 旁证
- `POST /v1/embeddings` 对 chat 模型已正确返回 400 `invalid_model_modality`，说明路由与 modality 校验逻辑已部署。
- 证据：`prod-embedding-invalid-modality.headers`、`prod-embedding-invalid-modality.json`

## 判定
- 本次不是 API 路由缺失问题，而是生产数据层（embedding alias/model seed）未达验收条件。
- 建议修复后复验顺序：
  1) 确认生产执行 `npx prisma db seed` 且包含 embedding aliases/model links
  2) 复验 `GET /v1/models?modality=embedding` 至少返回 `bge-m3` 与 `text-embedding-3-small`
  3) 再复验 `POST /v1/embeddings` 单条调用，校验 200 + 维度 + cost `< 0.001`
