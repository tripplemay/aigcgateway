# AIGC Gateway — Launch Checklist

## 1. Infrastructure

- [ ] API servers (2x 4C8G) deployed and reachable
- [ ] Cron worker (1x 2C4G) deployed
- [ ] PostgreSQL primary + read replica created
- [ ] Redis instance created
- [ ] Proxy nodes (2x HK/SG) deployed, tested connectivity to OpenAI/Claude/OpenRouter
- [ ] Load balancer configured, health checks passing
- [ ] SSL certificate installed
- [ ] Domain DNS resolved

## 2. Application

- [ ] All environment variables configured (see .env.example)
- [ ] `prisma migrate deploy` executed successfully
- [ ] Full-text search index + trigger created (native SQL migration)
- [ ] `deduct_balance` + `check_balance` functions deployed
- [ ] 7 providers seeded with real API Keys (replace PLACEHOLDER)
- [ ] All models and channels configured
- [ ] Health check all channels pass (3-level verification)
- [ ] Admin account created (bcrypt password, can login)
- [ ] `/v1/` rewrite middleware active

## 3. Payment

- [ ] Alipay application created, callback URL configured
- [ ] WeChat Pay merchant activated, callback URL configured
- [ ] Payment callback signature verification tested
- [ ] Full recharge → credit flow tested end-to-end

## 4. Monitoring

- [ ] Alert webhook URL configured (ALERT_WEBHOOK_URL)
- [ ] P0 alert trigger tested (manually disabled a channel → received alert)
- [ ] Structured JSON logging configured
- [ ] Cron tasks registered:
  - [ ] Health check scheduler (active/standby/cold intervals)
  - [ ] Expired order cleanup (every 5 min)
  - [ ] Balance alert check (every hour)
  - [ ] HealthCheck record cleanup (daily, 7-day retention)

## 5. Security

- [ ] Provider API Keys encrypted in DB (AES-256-GCM via ENCRYPTION_KEY)
- [ ] JWT_SECRET injected via KMS (not in code)
- [ ] Payment keys injected via KMS
- [ ] Server firewall configured (only 80/443 open)
- [ ] Database accessible only from internal network
- [ ] No hardcoded domains in code (all via env vars)
- [ ] No `.env` file committed to git

## 6. Verification

- [ ] E2E test passed: `npx tsx scripts/e2e-test.ts`
- [ ] Error scenario test passed: `npx tsx scripts/e2e-errors.ts`
- [ ] Provider verification passed: `npx tsx scripts/verify-providers.ts`
- [ ] Manual walkthrough: register → project → key → recharge → call → logs → balance
- [ ] SDK npm package published and installable
- [ ] API docs accessible at /docs
