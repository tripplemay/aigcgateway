#!/usr/bin/env bash
# Codex 测试环境：共享环境变量
# 被 codex-setup.sh / codex-restart.sh / codex-start.sh source 引用

export DATABASE_URL="postgresql://test:test@localhost:5432/aigc_gateway_test"
export REDIS_URL="redis://localhost:6379/0"
export JWT_SECRET="test-jwt-secret-2026"
export JWT_EXPIRES_IN="7d"
# instrumentation.ts assertImageProxySecret() (commit b9fafa5 BL-SEC-CRED-HARDEN) requires at least one of the three;
# missing them all causes server prepare to throw and every page to return 500 (chunks 400/404 cascade, NO_FCP).
export IMAGE_PROXY_SECRET="test-image-proxy-secret-2026-with-enough-length-for-hmac"
export AUTH_SECRET="test-auth-secret-2026-with-enough-length-for-hmac"
export NEXTAUTH_SECRET="test-nextauth-secret-2026-with-enough-length-for-hmac"
export EXCHANGE_RATE_CNY_TO_USD="0.137"
export DEFAULT_MARKUP_RATIO="1.2"
export HEALTH_CHECK_ACTIVE_INTERVAL_MS="600000"
export HEALTH_CHECK_STANDBY_INTERVAL_MS="1800000"
export HEALTH_CHECK_COLD_INTERVAL_MS="7200000"
export HEALTH_CHECK_FAIL_THRESHOLD="3"
export DEFAULT_RPM="60"
export DEFAULT_TPM="100000"
export DEFAULT_IMAGE_RPM="10"
export NODE_ENV="test"
export PORT="3199"

# BL-TEST-INFRA-IMPORT fix-round-1: env vars consumed by prisma/seed.ts +
# tests/e2e/*.spec.ts via scripts/lib/require-env.ts. Must be exported
# before `npx prisma db seed` and `npm run test:e2e` or those steps
# throw `Missing env: <NAME>` and abort. Same value across all three is
# fine — they're test-only credentials.
export ADMIN_SEED_PASSWORD="Codex@2026!"
export ADMIN_TEST_PASSWORD="Codex@2026!"
export E2E_TEST_PASSWORD="Codex@2026!"

# BL-MCP-PAGE-REVAMP fix-round-2: 绕开本地 HTTP_PROXY (clash/v2ray) 干扰
# Codex round2 reverify 502 真因：curl 默认走 http_proxy（如 127.0.0.1:7890）
# 代理无法 forward 到 :3199 → 返 502。让 codex 测试期间 localhost 流量绕过
# proxy。NODE 也使用同样 NO_PROXY 避免内部 fetch 走代理（health probe 在
# 本地测试时不应走 proxy）。
export NO_PROXY="localhost,127.0.0.1,::1"
export no_proxy="localhost,127.0.0.1,::1"
