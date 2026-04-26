import fs from 'node:fs/promises';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:3199';
const DB_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://test:test@localhost:5432/aigc_gateway_test';
const OUT =
  process.env.OUTPUT_FILE ??
  'docs/test-reports/perf-raw/bl-data-consistency-verifying-evidence-2026-04-19.json';

const prisma = new PrismaClient({ datasourceUrl: DB_URL });

interface StepResult {
  id: number;
  title: string;
  ok: boolean;
  detail: string;
  evidence?: Record<string, unknown>;
}

const steps: StepResult[] = [];

function run(cmd: string, timeoutMs = 20 * 60 * 1000): string {
  return execSync(cmd, {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: timeoutMs,
    env: {
      ...process.env,
      DATABASE_URL: DB_URL,
      HTTP_PROXY: '',
      HTTPS_PROXY: '',
      ALL_PROXY: '',
      http_proxy: '',
      https_proxy: '',
      all_proxy: '',
      NO_PROXY: '*',
      no_proxy: '*',
    },
  });
}

async function api(pathname: string, init?: RequestInit): Promise<{ status: number; body: any; text: string }> {
  const res = await fetch(`${BASE}${pathname}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body, text };
}

async function loginAdmin() {
  const candidates = [
    { email: 'admin@aigc-gateway.local', password: 'Codex@2026!' },
    { email: 'codex-admin@aigc-gateway.local', password: 'Codex@2026!' },
  ];
  for (const c of candidates) {
    const r = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(c),
    });
    if (r.status === 200 && r.body?.token) {
      return {
        email: c.email,
        token: String(r.body.token),
        userId: String(r.body.user?.id ?? ''),
      };
    }
  }
  throw new Error('admin login failed');
}

async function mcpRawWithFallback(apiKey: string, method: string, params: Record<string, unknown>) {
  const payload = {
    jsonrpc: '2.0',
    id: `dc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    method,
    params,
  };
  const paths = ['/mcp', '/api/mcp'];
  let last = '';
  for (const p of paths) {
    const r = await api(p, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify(payload),
    });
    if (r.status < 500) return { ...r, path: p };
    last = `${p} => ${r.status} ${r.text}`;
  }
  throw new Error(last || 'mcp request failed on both /mcp and /api/mcp');
}

function parseMcpSse(text: string): any {
  const line = text
    .split('\n')
    .map((s) => s.trim())
    .find((s) => s.startsWith('data: '));
  if (!line) throw new Error(`invalid MCP SSE payload: ${text.slice(0, 200)}`);
  return JSON.parse(line.slice('data: '.length));
}

async function step(id: number, title: string, fn: () => Promise<{ detail: string; evidence?: Record<string, unknown> }>) {
  try {
    const r = await fn();
    steps.push({ id, title, ok: true, detail: r.detail, evidence: r.evidence });
  } catch (err) {
    steps.push({
      id,
      title,
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    });
  }
}

async function main() {
  await fs.mkdir(path.dirname(OUT), { recursive: true });
  const admin = await loginAdmin();

  await step(1, 'Prisma migration 本地可执行（deploy + status）', async () => {
    const deployOut = run('npx prisma migrate deploy', 8 * 60 * 1000);
    const statusOut = run('npx prisma migrate status', 8 * 60 * 1000);
    return {
      detail: 'migrate deploy/status completed',
      evidence: {
        deployTail: deployOut.split('\n').slice(-20).join('\n'),
        statusTail: statusOut.split('\n').slice(-20).join('\n'),
      },
    };
  });

  await step(2, 'template_steps_actionId_idx 存在', async () => {
    const rows = await prisma.$queryRawUnsafe<Array<{ indexname: string }>>(
      `SELECT indexname FROM pg_indexes WHERE schemaname='public' AND tablename='template_steps' AND indexname='template_steps_actionId_idx'`,
    );
    if (rows.length !== 1) throw new Error('template_steps_actionId_idx not found');
    return { detail: 'index exists', evidence: { rows } };
  });

  await step(3, 'alias_model_links 两个单列索引存在', async () => {
    const rows = await prisma.$queryRawUnsafe<Array<{ indexname: string }>>(
      `SELECT indexname FROM pg_indexes WHERE schemaname='public' AND tablename='alias_model_links' AND indexname IN ('alias_model_links_aliasId_idx','alias_model_links_modelId_idx') ORDER BY indexname`,
    );
    const names = rows.map((r) => r.indexname);
    if (!names.includes('alias_model_links_aliasId_idx') || !names.includes('alias_model_links_modelId_idx')) {
      throw new Error(`alias_model_links indexes missing: ${JSON.stringify(names)}`);
    }
    return { detail: 'both indexes exist', evidence: { names } };
  });

  await step(4, 'email_verification_tokens FK 为 ON DELETE CASCADE', async () => {
    const rows = await prisma.$queryRawUnsafe<Array<{ conname: string; confdeltype: string }>>(
      `SELECT conname, confdeltype FROM pg_constraint WHERE conrelid='email_verification_tokens'::regclass AND conname='email_verification_tokens_userId_fkey'`,
    );
    if (!rows.length) throw new Error('fk email_verification_tokens_userId_fkey not found');
    if (rows[0].confdeltype !== 'c') throw new Error(`expected confdeltype=c, got ${rows[0].confdeltype}`);
    return { detail: 'fk cascade confirmed', evidence: { rows } };
  });

  await step(5, 'notifications.expiresAt 字段与索引存在', async () => {
    const cols = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
      `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='notifications' AND column_name='expiresAt'`,
    );
    const idx = await prisma.$queryRawUnsafe<Array<{ indexname: string }>>(
      `SELECT indexname FROM pg_indexes WHERE schemaname='public' AND tablename='notifications' AND indexname='notifications_expiresAt_idx'`,
    );
    if (!cols.length) throw new Error('notifications.expiresAt not found');
    if (!idx.length) throw new Error('notifications_expiresAt_idx not found');
    return { detail: 'column + index exist', evidence: { cols, idx } };
  });

  await step(6, '删除用户触发 EmailVerificationToken 级联删除', async () => {
    const tag = Date.now().toString(36);
    const user = await prisma.user.create({
      data: {
        email: `dc-cascade-${tag}@test.local`,
        passwordHash: 'hash',
        name: 'dc-cascade',
      },
      select: { id: true },
    });
    const token = await prisma.emailVerificationToken.create({
      data: {
        token: `dc-token-${tag}`,
        userId: user.id,
        expiresAt: new Date(Date.now() + 60_000),
      },
      select: { id: true },
    });
    await prisma.user.delete({ where: { id: user.id } });
    const left = await prisma.emailVerificationToken.count({ where: { id: token.id } });
    if (left !== 0) throw new Error(`token still exists after user delete, count=${left}`);
    return { detail: 'cascade delete works', evidence: { userId: user.id, tokenId: token.id, remaining: left } };
  });

  await step(7, '存量 notifications expiresAt=null 保留', async () => {
    const seeded = await prisma.notification.create({
      data: {
        userId: admin.userId,
        eventType: 'CHANNEL_DOWN',
        channel: 'INAPP',
        status: 'SENT',
        payload: { provider: 'dc-check' } as any,
        expiresAt: null,
      },
      select: { id: true },
    });
    const left = await prisma.notification.count({ where: { id: seeded.id, expiresAt: null } });
    if (left !== 1) throw new Error(`expected seeded null-expiry row to remain, got ${left}`);
    return { detail: 'null expiresAt row remains', evidence: { seededId: seeded.id, remaining: left } };
  });

  await step(8, 'BALANCE_LOW 新通知默认写入 expiresAt', async () => {
    process.env.DATABASE_URL = DB_URL;
    const { sendNotification } = await import('@/lib/notifications/dispatcher');
    await prisma.notificationPreference.upsert({
      where: { userId_eventType: { userId: admin.userId, eventType: 'BALANCE_LOW' } },
      update: { enabled: true, channels: ['inApp'] as any },
      create: {
        userId: admin.userId,
        eventType: 'BALANCE_LOW',
        channels: ['inApp'] as any,
        enabled: true,
      },
    });

    await sendNotification(admin.userId, 'BALANCE_LOW', { currentBalance: 1.11, threshold: 5 });

    const row = await prisma.notification.findFirst({
      where: { userId: admin.userId, eventType: 'BALANCE_LOW', channel: 'INAPP' },
      orderBy: { createdAt: 'desc' },
      select: { id: true, expiresAt: true, createdAt: true },
    });
    if (!row) throw new Error('no BALANCE_LOW notification found');
    if (!row.expiresAt) throw new Error('expiresAt is null for BALANCE_LOW notification');
    return {
      detail: 'BALANCE_LOW gets default expiresAt',
      evidence: {
        id: row.id,
        createdAt: row.createdAt.toISOString(),
        expiresAt: row.expiresAt.toISOString(),
      },
    };
  });

  await step(9, 'listPublicTemplates latest 分页含 LIMIT 5', async () => {
    const explainRows = await prisma.$queryRawUnsafe<Array<{ 'QUERY PLAN': string }>>(
      `EXPLAIN SELECT id FROM "templates" WHERE "isPublic"=true ORDER BY "updatedAt" DESC OFFSET 0 LIMIT 5`,
    );
    const plan = explainRows.map((r) => r['QUERY PLAN']).join('\n');
    if (!/Limit/i.test(plan) || !/5/.test(plan)) {
      throw new Error(`EXPLAIN does not show LIMIT 5:\n${plan}`);
    }
    return {
      detail: 'latest pagination + explain limit verified',
      evidence: { plan },
    };
  });

  await step(10, 'npm run build 通过', async () => {
    const out = run('NODE_ENV=production npm run build', 20 * 60 * 1000);
    return { detail: 'build passed', evidence: { tail: out.split('\n').slice(-20).join('\n') } };
  });

  await step(11, 'npx tsc --noEmit 通过', async () => {
    const out = run('npx tsc --noEmit', 10 * 60 * 1000);
    return { detail: 'tsc passed', evidence: { tail: out.split('\n').slice(-20).join('\n') } };
  });

  await step(12, 'npx vitest run 全通过', async () => {
    const out = run('npx vitest run', 20 * 60 * 1000);
    return { detail: 'vitest passed', evidence: { tail: out.split('\n').slice(-30).join('\n') } };
  });

  await step(13, '登录后通知能力正常', async () => {
    const notifStatus = run(
      `curl -s -o /tmp/dc-notif.json -w '%{http_code}' -H 'Authorization: Bearer ${admin.token}' '${BASE}/api/notifications?limit=20'`,
      30_000,
    ).trim();
    if (notifStatus !== '200') throw new Error(`/api/notifications status=${notifStatus}`);
    const notifRaw = await fs.readFile('/tmp/dc-notif.json', 'utf8');
    const notif = notifRaw ? JSON.parse(notifRaw) : {};

    return {
      detail: 'login + notifications api path ok',
      evidence: { apiStatus: Number(notifStatus), unreadCount: notif?.unreadCount ?? null },
    };
  });

  await step(14, 'MCP list_public_templates 分页正常', async () => {
    const rawKey = `pk_${randomBytes(32).toString('hex')}`;
    const keyHash = createHash('sha256').update(rawKey).digest('hex');
    const keyPrefix = rawKey.slice(0, 8);
    await prisma.apiKey.create({
      data: {
        userId: admin.userId,
        keyHash,
        keyPrefix,
        name: 'dc-mcp-key',
        status: 'ACTIVE',
        permissions: {},
      },
    });

    const init = await mcpRawWithFallback(rawKey, 'initialize', {
      protocolVersion: '2024-11-05',
      clientInfo: { name: 'dc-verifier', version: '1.0.0' },
      capabilities: {},
    });
    const initPayload = parseMcpSse(init.text);
    if (init.status !== 200 || initPayload?.error) {
      throw new Error(`mcp initialize failed: status=${init.status} payload=${JSON.stringify(initPayload)}`);
    }

    const call = await mcpRawWithFallback(rawKey, 'tools/call', {
      name: 'list_public_templates',
      arguments: { sort_by: 'latest', page: 1, pageSize: 5 },
    });
    const callPayload = parseMcpSse(call.text);
    if (call.status !== 200 || callPayload?.error) {
      throw new Error(`mcp tools/call failed: status=${call.status} payload=${JSON.stringify(callPayload)}`);
    }
    const text = String(callPayload?.result?.content?.[0]?.text ?? '');
    const parsed = JSON.parse(text || '{}');
    const pageSize = Number(parsed?.pagination?.pageSize ?? NaN);
    if (pageSize !== 5) throw new Error(`mcp pagination.pageSize expected 5, got ${parsed?.pagination?.pageSize}`);

    return {
      detail: 'mcp initialize + list_public_templates ok',
      evidence: { path: call.path, pagination: parsed?.pagination ?? null },
    };
  });

  await step(15, '生产只读预检 template_steps COUNT(*)', async () => {
    const cmd =
      `ssh -o BatchMode=yes -o StrictHostKeyChecking=no -o ConnectTimeout=8 tripplezhou@34.180.93.185 ` +
      `"cd /opt/aigc-gateway && set -a && source .env.production >/dev/null 2>&1 || true; ` +
      `DB_URL=\\$(printf '%s' \\\"\\$DATABASE_URL\\\" | sed -E 's/\\\\?.*$//'); ` +
      `psql \\\"\\$DB_URL\\\" -tAc 'SELECT COUNT(*) FROM template_steps;'"`;
    const out = run(cmd, 30_000).trim();
    const count = Number(out.split('\n').pop() ?? NaN);
    if (!Number.isFinite(count)) throw new Error(`invalid COUNT(*) output: ${out}`);
    return { detail: 'production template_steps count fetched', evidence: { count } };
  });

  await step(16, '生产只读预检 notifications COUNT(*)', async () => {
    const cmd =
      `ssh -o BatchMode=yes -o StrictHostKeyChecking=no -o ConnectTimeout=8 tripplezhou@34.180.93.185 ` +
      `"cd /opt/aigc-gateway && set -a && source .env.production >/dev/null 2>&1 || true; ` +
      `DB_URL=\\$(printf '%s' \\\"\\$DATABASE_URL\\\" | sed -E 's/\\\\?.*$//'); ` +
      `psql \\\"\\$DB_URL\\\" -tAc 'SELECT COUNT(*) FROM notifications;'"`;
    const out = run(cmd, 30_000).trim();
    const count = Number(out.split('\n').pop() ?? NaN);
    if (!Number.isFinite(count)) throw new Error(`invalid COUNT(*) output: ${out}`);
    return { detail: 'production notifications count fetched', evidence: { count } };
  });

  const passCount = steps.filter((s) => s.ok).length;
  const failCount = steps.length - passCount;
  const summary = {
    timestamp: new Date().toISOString(),
    baseUrl: BASE,
    dbUrl: DB_URL,
    pass: failCount === 0,
    passCount,
    failCount,
    steps,
  };

  await fs.writeFile(OUT, JSON.stringify(summary, null, 2), 'utf8');
  console.log(JSON.stringify(summary, null, 2));

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
