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
