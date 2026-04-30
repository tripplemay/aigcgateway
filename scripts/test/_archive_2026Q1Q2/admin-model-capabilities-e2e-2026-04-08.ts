import { writeFileSync } from "fs";
import { requireEnv } from "../lib/require-env";

const BASE = process.env.BASE_URL ?? "http://localhost:3199";
const OUTPUT =
  process.env.OUTPUT_FILE ?? "docs/test-reports/admin-model-capabilities-e2e-2026-04-08.json";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@aigc-gateway.local";
const ADMIN_PASSWORD = requireEnv("ADMIN_TEST_PASSWORD");

interface StepResult {
  name: string;
  ok: boolean;
  detail?: string;
}

interface ModelItem {
  id: string;
  name: string;
  modality: string;
  enabled: boolean;
  capabilities: Record<string, boolean> | null;
  supportedSizes: string[] | null;
  activeChannelCount: number;
}

async function api(
  path: string,
  init?: RequestInit & { expect?: number; token?: string },
): Promise<{ status: number; body: any; headers: Headers; text: string }> {
  const { expect, token, ...rest } = init ?? {};
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(rest.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    ...rest,
    headers,
    redirect: "manual",
  });
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (typeof expect === "number" && res.status !== expect) {
    throw new Error(`${path} expected ${expect}, got ${res.status}: ${text}`);
  }

  return { status: res.status, body, headers: res.headers, text };
}

async function login(email: string, password: string): Promise<string> {
  const r = await api("/api/auth/login", {
    method: "POST",
    expect: 200,
    body: JSON.stringify({ email, password }),
  });
  const token = r.body?.token as string | undefined;
  if (!token) throw new Error("login returned no token");
  return token;
}

async function ensureDeveloper(): Promise<{ email: string; password: string; token: string }> {
  const email = `model-cap-dev-${Date.now()}@test.local`;
  const password = requireEnv("E2E_TEST_PASSWORD");

  await api("/api/auth/register", {
    method: "POST",
    expect: 201,
    body: JSON.stringify({ email, password, name: "Model Cap Dev" }),
  });

  const token = await login(email, password);
  return { email, password, token };
}

function findModelFromV1(data: any[], name: string) {
  return data.find((m) => m?.id === name);
}

async function main() {
  const steps: StepResult[] = [];
  const adminToken = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
  const dev = await ensureDeveloper();

  const modelsRes = await api("/api/admin/models", { expect: 200, token: adminToken });
  const models = modelsRes.body?.data as ModelItem[];
  if (!Array.isArray(models) || models.length === 0) {
    throw new Error("/api/admin/models returned empty data");
  }

  const activeModels = models.filter((m) => m.activeChannelCount > 0);
  const textModel = activeModels.find((m) => m.modality === "TEXT");
  const imageModel = activeModels.find((m) => m.modality === "IMAGE");
  const gpt4oModel = models.find((m) => m.name === "openai/gpt-4o");

  if (!textModel) throw new Error("no active TEXT model found");
  if (!imageModel) throw new Error("no active IMAGE model found");
  if (!gpt4oModel) throw new Error("openai/gpt-4o not found in /api/admin/models");

  const restoreModels = new Map<string, { enabled: boolean }>();
  for (const m of [textModel, imageModel, gpt4oModel]) {
    if (!restoreModels.has(m.id)) restoreModels.set(m.id, { enabled: m.enabled });
    if (!m.enabled) {
      await api(`/api/admin/models/${m.id}`, {
        method: "PATCH",
        token: adminToken,
        expect: 200,
        body: JSON.stringify({ enabled: true }),
      });
    }
  }

  // AC1: admin page can access and shows content
  const adminPage = await api("/admin/model-capabilities", {
    method: "GET",
    token: adminToken,
  });
  const adminModelsAfterEnable = await api("/api/admin/models", { expect: 200, token: adminToken });
  const visibleEnabledCount = (adminModelsAfterEnable.body?.data as ModelItem[]).filter(
    (m) => m.enabled && m.activeChannelCount > 0,
  ).length;
  const ac1 = adminPage.status === 200 && visibleEnabledCount > 0;
  steps.push({
    name: "AC1 admin page access",
    ok: ac1,
    detail: `status=${adminPage.status}, visibleEnabledCount=${visibleEnabledCount}`,
  });

  // AC4: non-admin cannot access admin page
  const devPage = await api("/admin/model-capabilities", {
    method: "GET",
    token: dev.token,
  });
  const location = devPage.headers.get("location") ?? "";
  const ac4 = [302, 307, 308].includes(devPage.status) && location.includes("/dashboard");
  steps.push({
    name: "AC4 non-admin forbidden",
    ok: ac4,
    detail: `status=${devPage.status}, location=${location}`,
  });

  // AC2: toggle capability then /v1/models reflects DB value
  const originalCaps = { ...(textModel.capabilities ?? {}) };
  const targetKey = "reasoning";
  const nextValue = !Boolean(originalCaps[targetKey]);
  const nextCaps = { ...originalCaps, [targetKey]: nextValue };

  await api(`/api/admin/models/${textModel.id}`, {
    method: "PATCH",
    token: adminToken,
    expect: 200,
    body: JSON.stringify({ capabilities: nextCaps }),
  });

  const v1Text = await api("/v1/models?modality=text", { expect: 200 });
  const v1TextModel = findModelFromV1(v1Text.body?.data ?? [], textModel.name);
  const ac2 = v1TextModel && v1TextModel.capabilities?.[targetKey] === nextValue;
  steps.push({
    name: "AC2 capabilities reflected in /v1/models",
    ok: Boolean(ac2),
    detail: `model=${textModel.name}, ${targetKey}=${v1TextModel?.capabilities?.[targetKey]}`,
  });

  // restore text capabilities to avoid long-lived side effects
  await api(`/api/admin/models/${textModel.id}`, {
    method: "PATCH",
    token: adminToken,
    expect: 200,
    body: JSON.stringify({ capabilities: originalCaps }),
  });

  // AC3: update image supportedSizes then /v1/models reflects DB value
  const originalSizes = [...(imageModel.supportedSizes ?? [])];
  const addedSize = "1200x1200";
  const patchedSizes = originalSizes.includes(addedSize)
    ? [...originalSizes.filter((s) => s !== addedSize)]
    : [...originalSizes, addedSize];

  await api(`/api/admin/models/${imageModel.id}`, {
    method: "PATCH",
    token: adminToken,
    expect: 200,
    body: JSON.stringify({ supportedSizes: patchedSizes }),
  });

  const v1Image = await api("/v1/models?modality=image", { expect: 200 });
  const v1ImageModel = findModelFromV1(v1Image.body?.data ?? [], imageModel.name);
  const expectedHas = patchedSizes.includes(addedSize);
  const actualHas = Boolean((v1ImageModel?.supported_sizes ?? []).includes(addedSize));
  const ac3 = expectedHas === actualHas;
  steps.push({
    name: "AC3 supportedSizes reflected in /v1/models",
    ok: ac3,
    detail: `model=${imageModel.name}, expectedHas=${expectedHas}, actualHas=${actualHas}`,
  });

  // restore image supportedSizes
  await api(`/api/admin/models/${imageModel.id}`, {
    method: "PATCH",
    token: adminToken,
    expect: 200,
    body: JSON.stringify({ supportedSizes: originalSizes }),
  });

  // AC5: gpt-4o capabilities not empty
  const v1All = await api("/v1/models?modality=text", { expect: 200 });
  const gpt4o = findModelFromV1(v1All.body?.data ?? [], "openai/gpt-4o");
  const capKeys = Object.keys(gpt4o?.capabilities ?? {});
  const ac5 = Boolean(gpt4o && capKeys.length > 0);
  steps.push({
    name: "AC5 gpt-4o capabilities non-empty",
    ok: ac5,
    detail: gpt4o ? `capabilityKeys=${capKeys.join(",")}` : "openai/gpt-4o not found",
  });

  const passCount = steps.filter((s) => s.ok).length;
  const failCount = steps.length - passCount;

  writeFileSync(
    OUTPUT,
    JSON.stringify(
      {
        baseUrl: BASE,
        adminEmail: ADMIN_EMAIL,
        devEmail: dev.email,
        targetModels: {
          text: textModel.name,
          image: imageModel.name,
        },
        passCount,
        failCount,
        steps,
      },
      null,
      2,
    ),
  );

  for (const [modelId, origin] of restoreModels.entries()) {
    await api(`/api/admin/models/${modelId}`, {
      method: "PATCH",
      token: adminToken,
      expect: 200,
      body: JSON.stringify({ enabled: origin.enabled }),
    });
  }

  if (failCount > 0) {
    throw new Error(`F-MC-07 failed: ${failCount} step(s) failed`);
  }
}

main().catch((err) => {
  console.error("[admin-model-capabilities-e2e]", err.message);
  process.exit(1);
});
