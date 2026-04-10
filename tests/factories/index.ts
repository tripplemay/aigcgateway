/**
 * Prisma Test Factories — 公共库
 *
 * 提供 createTestUser / createTestProject / createTestApiKey / createTestChannel
 * 等工厂函数，统一 E2E 脚本中的测试数据创建模式。
 *
 * Usage:
 *   import { createTestUser, createTestProject, createTestApiKey, createTestChannel } from "../../tests/factories";
 *   const user = await createTestUser(BASE);
 *   const project = await createTestProject(BASE, user.token);
 *   const key = await createTestApiKey(BASE, user.token, project.id);
 *   const channel = await createTestChannel(prisma, { providerId, modelId, realModelId });
 */
import type { PrismaClient } from "@prisma/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TestUserResult {
  email: string;
  password: string;
  token: string;
}

export interface TestProjectResult {
  id: string;
  name: string;
}

export interface TestApiKeyResult {
  id: string;
  key: string;
  name: string;
}

export interface TestChannelResult {
  id: string;
  providerId: string;
  modelId: string;
  realModelId: string;
}

// ---------------------------------------------------------------------------
// Internal fetch helper
// ---------------------------------------------------------------------------

async function post(
  baseUrl: string,
  path: string,
  body: Record<string, unknown>,
  token?: string,
): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: any = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return { status: res.status, body: parsed };
}

// ---------------------------------------------------------------------------
// Default price shapes
// ---------------------------------------------------------------------------

const DEFAULT_COST_PRICE = {
  unit: "token",
  inputPer1M: 0.1,
  outputPer1M: 0.2,
  currency: "USD",
};

const DEFAULT_SELL_PRICE = {
  unit: "token",
  inputPer1M: 0.12,
  outputPer1M: 0.24,
  currency: "USD",
};

// ---------------------------------------------------------------------------
// User factory (via API)
// ---------------------------------------------------------------------------

export interface CreateTestUserOptions {
  /** Email prefix (default: "test") — timestamp is appended automatically */
  prefix?: string;
  /** Password (default: "Test1234") */
  password?: string;
  /** Display name */
  name?: string;
}

export async function createTestUser(
  baseUrl: string,
  options: CreateTestUserOptions = {},
): Promise<TestUserResult> {
  const { prefix = "test", password = "Test1234", name = "Test User" } = options;
  const email = `${prefix}_${Date.now()}@test.local`;

  const reg = await post(baseUrl, "/api/auth/register", { email, password, name });
  if (reg.status !== 201) {
    throw new Error(`createTestUser: register failed (${reg.status}): ${JSON.stringify(reg.body)}`);
  }

  const login = await post(baseUrl, "/api/auth/login", { email, password });
  if (login.status !== 200) {
    throw new Error(`createTestUser: login failed (${login.status}): ${JSON.stringify(login.body)}`);
  }

  return { email, password, token: login.body.token };
}

// ---------------------------------------------------------------------------
// Project factory (via API)
// ---------------------------------------------------------------------------

export interface CreateTestProjectOptions {
  /** Project name (default: "Test Project <timestamp>") */
  name?: string;
}

export async function createTestProject(
  baseUrl: string,
  token: string,
  options: CreateTestProjectOptions = {},
): Promise<TestProjectResult> {
  const { name = `Test Project ${Date.now()}` } = options;

  const res = await post(baseUrl, "/api/projects", { name }, token);
  if (res.status !== 201) {
    throw new Error(`createTestProject: failed (${res.status}): ${JSON.stringify(res.body)}`);
  }

  const id = String(res.body?.id ?? "");
  if (!id) throw new Error("createTestProject: project id missing from response");

  return { id, name };
}

// ---------------------------------------------------------------------------
// ApiKey factory (via API)
// ---------------------------------------------------------------------------

export interface CreateTestApiKeyOptions {
  /** Key name (default: "test-key") */
  name?: string;
  /** Rate limit */
  rateLimit?: number;
}

export async function createTestApiKey(
  baseUrl: string,
  token: string,
  projectId: string,
  options: CreateTestApiKeyOptions = {},
): Promise<TestApiKeyResult> {
  const { name = "test-key", rateLimit = 60 } = options;

  const res = await post(baseUrl, `/api/projects/${projectId}/keys`, { name, rateLimit }, token);
  if (res.status !== 201) {
    throw new Error(`createTestApiKey: failed (${res.status}): ${JSON.stringify(res.body)}`);
  }

  const key = String(res.body?.key ?? "");
  if (!key) throw new Error("createTestApiKey: key missing from response");

  return { id: res.body?.id ?? "", key, name };
}

// ---------------------------------------------------------------------------
// Channel factory (via Prisma)
// ---------------------------------------------------------------------------

export interface CreateTestChannelOptions {
  providerId: string;
  modelId: string;
  realModelId: string;
  priority?: number;
  status?: "ACTIVE" | "DISABLED" | "DEGRADED";
  costPrice?: Record<string, unknown>;
  sellPrice?: Record<string, unknown>;
}

export async function createTestChannel(
  prisma: PrismaClient,
  options: CreateTestChannelOptions,
): Promise<TestChannelResult> {
  const {
    providerId,
    modelId,
    realModelId,
    priority = 1,
    status = "ACTIVE",
    costPrice = DEFAULT_COST_PRICE,
    sellPrice = DEFAULT_SELL_PRICE,
  } = options;

  const channel = await prisma.channel.upsert({
    where: { providerId_modelId: { providerId, modelId } },
    update: { realModelId, priority, status, costPrice, sellPrice },
    create: { providerId, modelId, realModelId, priority, status, costPrice, sellPrice },
  });

  return {
    id: channel.id,
    providerId: channel.providerId,
    modelId: channel.modelId,
    realModelId: channel.realModelId,
  };
}

// ---------------------------------------------------------------------------
// Model factory (via Prisma) — helper for setting up channels
// ---------------------------------------------------------------------------

export interface CreateTestModelOptions {
  name: string;
  displayName?: string;
  modality?: "TEXT" | "IMAGE";
  contextWindow?: number;
  maxTokens?: number;
  capabilities?: Record<string, unknown>;
}

export async function createTestModel(
  prisma: PrismaClient,
  options: CreateTestModelOptions,
): Promise<{ id: string; name: string }> {
  const {
    name,
    displayName = name,
    modality = "TEXT",
    contextWindow = 128000,
    maxTokens = 16384,
    capabilities = { streaming: true, json_mode: true, unknown: false },
  } = options;

  const model = await prisma.model.upsert({
    where: { name },
    update: { displayName, modality, contextWindow, maxTokens, capabilities },
    create: { name, displayName, modality, contextWindow, maxTokens, capabilities },
  });

  return { id: model.id, name: model.name };
}
