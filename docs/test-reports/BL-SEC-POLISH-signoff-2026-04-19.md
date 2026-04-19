# BL-SEC-POLISH Signoff (2026-04-19)

## 结论
BL-SEC-POLISH 在 `reverifying` 阶段按最新裁决口径完成复验，`F-SP-04` 18/18 通过，签收通过。

## 范围
- AUTH 硬化（恒定时延、防枚举、cost12、双桶限流）
- SSRF + Content-Type 硬化
- 脚本硬化（fatal/date/bcrypt/run-template rate-limit）
- 质量闸门（build/tsc/vitest）

## 关键说明（裁决口径）
- #1 采用“missing vs existing wrong-password 时延差 <20ms，且 150-250ms 可接受”
- #14 采用 MCP 语义限流判定：`CallToolResult.isError=true` 且文本含 `Rate limit exceeded`（HTTP 200 合规）

## 核心证据
- `docs/test-reports/BL-SEC-POLISH-reverifying-2026-04-19.md`
- `docs/test-reports/artifacts/bl-sec-polish-api-probes-2026-04-19.json`
- `docs/test-reports/artifacts/bl-sec-polish-run-template-rate-limit-2026-04-19.json`
- `docs/test-reports/artifacts/bl-sec-polish-quality-gates-2026-04-19.json`
