# BL-SEC-POLISH Verifying Cases (2026-04-19)

## Scope
- Batch: `BL-SEC-POLISH`
- Stage: `verifying`
- Env: L1 local `localhost:3099`

## Acceptance Mapping
1-6. AUTH: login/register 限流、错误路径耗时、rehash(cost10->12)
7-9. test-webhook SSRF URL 拦截
10. image-proxy 上游 text/html 时本地 CT 降级为 octet-stream
11-14. 脚本硬化四项（fatal/date/bcrypt/run-template rate limit）
15-17. build/tsc/vitest
18. signoff 生成

## Evidence Plan
- API 结果: `docs/test-reports/artifacts/bl-sec-polish-api-probes-2026-04-19.json`
- 脚本结果: `docs/test-reports/artifacts/bl-sec-polish-script-probes-2026-04-19.json`
- 质量门禁日志: `...-build.log`, `...-tsc.log`, `...-vitest.log`
