import { PrismaClient } from '@prisma/client';
import { writeFileSync } from 'fs';
import { createServer } from 'http';
import { checkChannel } from '../../src/lib/health/scheduler';
import { sanitizeErrorMessage } from '../../src/lib/engine/types';

const BASE = process.env.BASE_URL ?? 'http://localhost:3199';
const OUT =
  process.env.OUTPUT_FILE ??
  'docs/test-reports/artifacts/bl-billing-audit-ext-p1-verifying-2026-04-24/local-dynamic-evidence.json';

type Step = { id: string; ok: boolean; detail: string; evidence?: unknown };
const prisma = new PrismaClient();

function uniq(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function api(path: string, init?: RequestInit & { token?: string; apiKey?: string }) {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...((init?.headers as Record<string, string> | undefined) ?? {}),
  };
  if (init?.token) headers.authorization = `Bearer ${init.token}`;
  if (init?.apiKey) headers.authorization = `Bearer ${init.apiKey}`;
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body, text };
}

async function startMockOpenAI() {
  let hit = 0;
  const server = createServer(async (req, res) => {
    if (req.method === 'POST' && req.url === '/chat/completions') {
      hit += 1;
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          id: `mock-${Date.now()}`,
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: 'mock-model',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: '{"ok":true}' },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 },
        }),
      );
      return;
    }
    res.statusCode = 404;
    res.end('not found');
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('mock server address unavailable');
  const baseUrl = `http://127.0.0.1:${addr.port}`;
  return {
    baseUrl,
    hits: () => hit,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

async function main() {
  const steps: Step[] = [];
  const mock = await startMockOpenAI();

  const created = {
    models: [] as string[],
    channels: [] as string[],
    aliases: [] as string[],
    links: [] as { aliasId: string; modelId: string }[],
    providers: [] as string[],
    providerConfigs: [] as string[],
    projectId: '',
    rawApiKey: '',
  };

  try {
    const login = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'admin@aigc-gateway.local', password: 'CodexSeed@2026' }),
    });
    const token = (login.body as any)?.token as string | undefined;
    steps.push({ id: 'login-admin', ok: login.status === 200 && !!token, detail: `status=${login.status}` });
    if (!token) throw new Error(`admin login failed: ${login.status} ${login.text}`);

    const admin = await prisma.user.findUnique({ where: { email: 'admin@aigc-gateway.local' } });
    if (!admin) throw new Error('admin user missing');

    const project = await prisma.project.create({
      data: { userId: admin.id, name: uniq('bax_project'), description: 'BAX verifying fixture' },
    });
    created.projectId = project.id;
    await prisma.user.update({
      where: { id: admin.id },
      data: { defaultProjectId: project.id, balance: 100 },
    });

    // One provider that will fail with auth (seeded openai), one mock provider that always succeeds.
    const pOpenai = await prisma.provider.findUnique({ where: { name: 'openai' } });
    if (!pOpenai) throw new Error('openai provider missing');

    const pMock = await prisma.provider.create({
      data: {
        name: uniq('mocksync'),
        displayName: 'Mock Sync Provider',
        baseUrl: mock.baseUrl,
        authType: 'bearer',
        authConfig: { apiKey: 'mock-key' },
        status: 'ACTIVE',
        adapterType: 'openai-compat',
      },
    });
    created.providers.push(pMock.id);

    const pMockCfg = await prisma.providerConfig.create({
      data: {
        providerId: pMock.id,
        temperatureMin: 0,
        temperatureMax: 1,
        chatEndpoint: '/chat/completions',
        imageEndpoint: '/images/generations',
        imageViaChat: false,
        supportsModelsApi: false,
        supportsSystemRole: true,
        currency: 'USD',
      },
    });
    created.providerConfigs.push(pMockCfg.id);

    const mTextFail = await prisma.model.create({
      data: { name: uniq('bax_text_fail'), displayName: 'BAX Text Fail', modality: 'TEXT', enabled: true },
    });
    const mTextOk = await prisma.model.create({
      data: { name: uniq('bax_text_ok'), displayName: 'BAX Text OK', modality: 'TEXT', enabled: true },
    });
    created.models.push(mTextFail.id, mTextOk.id);

    const cTextFail = await prisma.channel.create({
      data: {
        providerId: pOpenai.id,
        modelId: mTextFail.id,
        realModelId: 'gpt-4o-mini',
        status: 'ACTIVE',
        priority: 1,
        costPrice: { unit: 'token', inputPer1M: 0.1, outputPer1M: 0.2 },
        sellPrice: { unit: 'token', inputPer1M: 0.2, outputPer1M: 0.4 },
      },
    });
    const cTextOk = await prisma.channel.create({
      data: {
        providerId: pMock.id,
        modelId: mTextOk.id,
        realModelId: 'mock-llm',
        status: 'ACTIVE',
        priority: 2,
        costPrice: { unit: 'token', inputPer1M: 0.1, outputPer1M: 0.2 },
        sellPrice: { unit: 'token', inputPer1M: 0.2, outputPer1M: 0.4 },
      },
    });
    created.channels.push(cTextFail.id, cTextOk.id);

    const aliasFailover = await prisma.modelAlias.create({
      data: {
        alias: uniq('bax_failover_alias'),
        brand: 'BAX',
        modality: 'TEXT',
        enabled: true,
      },
    });
    created.aliases.push(aliasFailover.id);
    await prisma.aliasModelLink.createMany({
      data: [
        { aliasId: aliasFailover.id, modelId: mTextFail.id },
        { aliasId: aliasFailover.id, modelId: mTextOk.id },
      ],
    });
    created.links.push({ aliasId: aliasFailover.id, modelId: mTextFail.id });
    created.links.push({ aliasId: aliasFailover.id, modelId: mTextOk.id });

    // Deepseek fallback first hop for sync should be resolvable and successful.
    let syncAlias = await prisma.modelAlias.findUnique({ where: { alias: 'deepseek-chat' } });
    if (!syncAlias) {
      syncAlias = await prisma.modelAlias.create({
        data: {
          alias: 'deepseek-chat',
          brand: 'BAX',
          modality: 'TEXT',
          enabled: true,
        },
      });
      created.aliases.push(syncAlias.id);
    }
    const hasLink = await prisma.aliasModelLink.findFirst({
      where: { aliasId: syncAlias.id, modelId: mTextOk.id },
    });
    if (!hasLink) {
      await prisma.aliasModelLink.create({ data: { aliasId: syncAlias.id, modelId: mTextOk.id } });
      created.links.push({ aliasId: syncAlias.id, modelId: mTextOk.id });
    }

    const keyRes = await api('/api/keys', {
      method: 'POST',
      token,
      body: JSON.stringify({ name: uniq('bax_key') }),
    });
    created.rawApiKey = (keyRes.body as any)?.key ?? '';
    steps.push({
      id: 'create-api-key',
      ok: keyRes.status === 201 && created.rawApiKey.startsWith('pk_'),
      detail: `status=${keyRes.status}`,
    });

    // #10 failover attempt_chain evidence.
    const tChatStart = new Date();
    const chatRes = await api('/v1/chat/completions', {
      method: 'POST',
      apiKey: created.rawApiKey,
      body: JSON.stringify({
        model: aliasFailover.alias,
        messages: [{ role: 'user', content: 'hello failover attempt chain' }],
        temperature: 0,
      }),
    });
    await new Promise((r) => setTimeout(r, 800));
    const chatLog = await prisma.callLog.findFirst({
      where: { modelName: aliasFailover.alias, createdAt: { gte: tChatStart } },
      orderBy: { createdAt: 'desc' },
    });
    const attemptChain = (chatLog?.responseSummary as any)?.attempt_chain as unknown[] | undefined;
    steps.push({
      id: 'chat-failover-attempt-chain',
      ok: chatRes.status === 200 && !!chatLog && Array.isArray(attemptChain) && attemptChain.length >= 2,
      detail: `chatStatus=${chatRes.status} hasLog=${!!chatLog} attemptChainLen=${attemptChain?.length ?? 0}`,
      evidence: {
        chatResponse: chatRes.body,
        callLog: chatLog
          ? {
              id: chatLog.id,
              status: chatLog.status,
              channelId: chatLog.channelId,
              errorMessage: chatLog.errorMessage,
              responseSummary: chatLog.responseSummary,
            }
          : null,
      },
    });

    // #9 run inference writes source='sync' when sync LLM succeeds.
    const tSyncStart = new Date();
    const runInference = await api('/api/admin/run-inference', { method: 'POST', token });
    await new Promise((r) => setTimeout(r, 1500));
    const syncLogs = await prisma.callLog.findMany({
      where: { source: 'sync', createdAt: { gte: tSyncStart } },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    steps.push({
      id: 'run-inference-sync-calllog',
      ok: runInference.status === 200 && syncLogs.length >= 1,
      detail: `runInference=${runInference.status} sync_logs=${syncLogs.length}`,
      evidence: {
        runInference: runInference.body,
        logs: syncLogs.map((x) => ({ id: x.id, traceId: x.traceId, modelName: x.modelName, source: x.source })),
      },
    });

    // #6/#7 admin check+probe write source='admin_health' with null user/project.
    const tAdminStart = new Date();
    const checkRes = await api(`/api/admin/health/${cTextFail.id}/check`, { method: 'POST', token });
    const probeRes = await api(`/api/admin/health/${cTextFail.id}/probe`, { method: 'POST', token });
    const adminLogs = await prisma.callLog.findMany({
      where: { source: 'admin_health', channelId: cTextFail.id, createdAt: { gte: tAdminStart } },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });
    steps.push({
      id: 'admin-health-check-and-probe-calllog',
      ok: checkRes.status === 200 && probeRes.status === 200 && adminLogs.length >= 2,
      detail: `check=${checkRes.status} probe=${probeRes.status} admin_health_logs=${adminLogs.length}`,
      evidence: {
        checkResponse: checkRes.body,
        probeResponse: probeRes.body,
        logs: adminLogs.map((x) => ({
          id: x.id,
          source: x.source,
          projectId: x.projectId,
          userId: x.userId,
          status: x.status,
          createdAt: x.createdAt,
        })),
      },
    });

    // #8 probe source evidence (manual trigger via scheduler check function, same path as scheduler source default).
    const tProbeStart = new Date();
    await checkChannel(cTextFail.id, 'probe');
    const probeLogs = await prisma.callLog.findMany({
      where: { source: 'probe', channelId: cTextFail.id, createdAt: { gte: tProbeStart } },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    steps.push({
      id: 'probe-source-calllog',
      ok: probeLogs.length >= 1,
      detail: `probe_logs=${probeLogs.length}`,
      evidence: probeLogs.map((x) => ({ id: x.id, source: x.source, projectId: x.projectId, userId: x.userId })),
    });

    // #12 sanitizer rule.
    const sanitized = sanitizeErrorMessage('错误：前往 https://example.com/充值 当前请求使用的 ApiKey: sk-test-123 ApiKey错误');
    steps.push({
      id: 'sanitize-error-message',
      ok:
        sanitized.includes('上游配额不足') &&
        sanitized.includes('认证失败') &&
        !sanitized.toLowerCase().includes('https://') &&
        !sanitized.includes('sk-test-123'),
      detail: sanitized,
    });

    const pass = steps.filter((s) => s.ok).length;
    const fail = steps.length - pass;
    const result = {
      batch: 'BL-BILLING-AUDIT-EXT-P1',
      generatedAt: new Date().toISOString(),
      baseUrl: BASE,
      mockProviderBaseUrl: mock.baseUrl,
      mockHits: mock.hits(),
      pass,
      fail,
      steps,
      fixtures: {
        projectId: created.projectId,
        modelIds: created.models,
        channelIds: created.channels,
        aliasIds: created.aliases,
        providerIds: created.providers,
        providerConfigIds: created.providerConfigs,
        apiKeyPrefix: created.rawApiKey.slice(0, 8),
      },
    };

    writeFileSync(OUT, JSON.stringify(result, null, 2));
    if (fail > 0) process.exit(1);
  } finally {
    await mock.close();
    await prisma.$disconnect();
  }
}

main().catch(async (err) => {
  await prisma.$disconnect().catch(() => {});
  const fallback = {
    batch: 'BL-BILLING-AUDIT-EXT-P1',
    generatedAt: new Date().toISOString(),
    fatal: String(err instanceof Error ? err.stack ?? err.message : err),
  };
  try {
    writeFileSync(OUT, JSON.stringify(fallback, null, 2));
  } catch {}
  console.error(err);
  process.exit(1);
});
