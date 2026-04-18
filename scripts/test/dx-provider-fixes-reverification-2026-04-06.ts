import { writeFileSync } from "fs";
import { PrismaClient } from "@prisma/client";
import { sanitizeErrorMessage } from "@/lib/engine/types";
import { deepseekAdapter } from "@/lib/sync/adapters/deepseek";
import { anthropicAdapter } from "@/lib/sync/adapters/anthropic";
import { zhipuAdapter } from "@/lib/sync/adapters/zhipu";
import { siliconflowAdapter } from "@/lib/sync/adapters/siliconflow";
import { resolveCapabilities } from "@/lib/sync/model-capabilities-fallback";
import { requireEnv } from "../lib/require-env";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3099";
const MCP_URL = `${BASE_URL}/mcp`;
const OUTPUT_FILE =
  process.env.OUTPUT_FILE ??
  "docs/test-reports/dx-provider-fixes-local-reverification-2026-04-06.json";

const prisma = new PrismaClient();
const password = requireEnv("E2E_TEST_PASSWORD");

type CheckResult = {
  name: string;
  ok: boolean;
  detail: string;
};

type FeatureResult = {
  featureId: string;
  result: "PASS" | "PARTIAL" | "FAIL";
  detail: string;
};

async function check(name: string, fn: () => Promise<string> | string): Promise<CheckResult> {
  try {
    const detail = await fn();
    return { name, ok: true, detail };
  } catch (error) {
    return { name, ok: false, detail: (error as Error).message };
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function parseRpcText(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    const lines = text.split("\n");
    let lastData = "";
    for (const line of lines) {
      if (line.startsWith("data: ")) lastData = line.slice(6);
    }
    if (!lastData) throw new Error(`Unable to parse RPC response: ${text}`);
    return JSON.parse(lastData);
  }
}

async function main() {
  const checks: CheckResult[] = [];
  let token = "";
  let projectId = "";
  let apiKey = "";
  let listModelsNames: string[] = [];
  let chatDescription = "";
  let imageDescription = "";

  checks.push(
    await check("runtime smoke: admin login route responds 200", async () => {
      const res = await fetch(`${BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "admin@aigc-gateway.local", password: requireEnv("ADMIN_TEST_PASSWORD") }),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(`status=${res.status} body=${text || "<empty>"}`);
      return "login route reachable";
    }),
  );

  checks.push(
    await check("F-DPF-05: register user + create key + tools/list + list_models", async () => {
      const email = `dx-provider-fixes-${Date.now()}@test.local`;

      const register = await fetch(`${BASE_URL}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name: "DX Provider Fixes Evaluator" }),
      });
      assert(register.ok, `register failed: ${register.status} ${await register.text()}`);

      const login = await fetch(`${BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const loginText = await login.text();
      assert(login.ok, `login failed: ${login.status} ${loginText}`);
      const loginJson = JSON.parse(loginText) as { token: string };
      token = loginJson.token;

      const project = await fetch(`${BASE_URL}/api/projects`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: `dx-provider-fixes-${Date.now()}` }),
      });
      const projectText = await project.text();
      assert(project.ok, `create project failed: ${project.status} ${projectText}`);
      const projectJson = JSON.parse(projectText) as { id: string };
      projectId = projectJson.id;

      const key = await fetch(`${BASE_URL}/api/projects/${projectId}/keys`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: "dx-provider-fixes-key", rateLimit: 60 }),
      });
      const keyText = await key.text();
      assert(key.ok, `create key failed: ${key.status} ${keyText}`);
      const keyJson = JSON.parse(keyText) as { key: string };
      apiKey = keyJson.key;

      await prisma.project.update({
        where: { id: projectId },
        data: { balance: 20 },
      });

      const toolsRes = await fetch(MCP_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: Date.now(),
          method: "tools/list",
          params: {},
        }),
      });
      const toolsText = await toolsRes.text();
      assert(toolsRes.ok, `tools/list failed: ${toolsRes.status} ${toolsText}`);
      const toolsJson = parseRpcText(toolsText) as {
        result?: { tools?: Array<{ name: string; description?: string }> };
      };
      const tools = toolsJson.result?.tools ?? [];
      chatDescription = tools.find((tool) => tool.name === "chat")?.description ?? "";
      imageDescription = tools.find((tool) => tool.name === "generate_image")?.description ?? "";
      assert(chatDescription.length > 0, "chat description missing");
      assert(imageDescription.length > 0, "generate_image description missing");

      const modelsRes = await fetch(MCP_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: Date.now() + 1,
          method: "tools/call",
          params: { name: "list_models", arguments: {} },
        }),
      });
      const modelsText = await modelsRes.text();
      assert(modelsRes.ok, `list_models failed: ${modelsRes.status} ${modelsText}`);
      const modelsJson = parseRpcText(modelsText) as {
        result?: { content?: Array<{ text?: string }>; isError?: boolean };
      };
      assert(!modelsJson.result?.isError, `list_models returned isError: ${JSON.stringify(modelsJson)}`);
      const payload = modelsJson.result?.content?.[0]?.text ?? "[]";
      const parsed = JSON.parse(payload) as Array<{ name: string }>;
      listModelsNames = parsed.map((model) => model.name);
      assert(listModelsNames.length > 0, "list_models returned empty");

      return `project=${projectId} models=${listModelsNames.length}`;
    }),
  );

  checks.push(
    await check("F-DPF-01: sanitizeErrorMessage removes URL/key/QQ/email/IP", () => {
      const raw =
        "Provider failed at https://api.example.com/v1/chat with sk-secret-123456 pk_demo_abcdef " +
        "QQ群:12345678 admin@example.com 10.2.3.4 Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9";
      const sanitized = sanitizeErrorMessage(raw);
      assert(!/https?:\/\//i.test(sanitized), `URL still present: ${sanitized}`);
      assert(!/\b(sk[-_]|pk[-_]|key[-_])[a-z0-9_-]{4,}/i.test(sanitized), `key still present: ${sanitized}`);
      assert(!/QQ群?|加群|群号/i.test(sanitized), `QQ marker still present: ${sanitized}`);
      assert(!/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(sanitized), `email still present: ${sanitized}`);
      assert(!/\b\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?\b/.test(sanitized), `IP still present: ${sanitized}`);
      assert(!/Bearer\s+[A-Za-z0-9_.-]{8,}/.test(sanitized), `bearer token still present: ${sanitized}`);
      return sanitized;
    }),
  );

  checks.push(
    await check("F-DPF-02: 4 adapters fail fast when apiKey is missing", async () => {
      const providers = [
        { name: "deepseek", adapter: deepseekAdapter },
        { name: "anthropic", adapter: anthropicAdapter },
        { name: "zhipu", adapter: zhipuAdapter },
        { name: "siliconflow", adapter: siliconflowAdapter },
      ];

      const results: string[] = [];
      for (const { name, adapter } of providers) {
        try {
          await adapter.fetchModels({
            id: `${name}-provider`,
            name,
            displayName: name,
            baseUrl: "https://example.invalid/v1",
            authType: "bearer",
            authConfig: {},
            adapterType: "openai-compat",
            proxyUrl: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            config: null,
          } as any);
          throw new Error(`${name} did not reject missing apiKey`);
        } catch (error) {
          const msg = (error as Error).message;
          assert(msg.includes("has no API Key configured"), `${name} unexpected error: ${msg}`);
          results.push(`${name}: ${msg}`);
        }
      }
      return results.join(" | ");
    }),
  );

  checks.push(
    await check("F-DPF-02: local sync still reports 401 for the 4 target providers", async () => {
      const row = await prisma.systemConfig.findUnique({ where: { key: "LAST_SYNC_RESULT" } });
      assert(row?.value, "LAST_SYNC_RESULT missing");
      const parsed = JSON.parse(row.value) as {
        providers?: Array<{ providerName: string; error?: string; modelCount?: number }>;
      };
      const targets = ["deepseek", "anthropic", "zhipu", "siliconflow"];
      const details: string[] = [];
      for (const target of targets) {
        const item = parsed.providers?.find((provider) => provider.providerName === target);
        assert(item, `${target} missing from LAST_SYNC_RESULT`);
        assert(item.error?.includes("401"), `${target} no 401 error in sync result: ${JSON.stringify(item)}`);
        details.push(`${target}: ${item.error}`);
      }
      return details.join(" | ");
    }),
  );

  checks.push(
    await check("F-DPF-03: resolveCapabilities never returns unknown", () => {
      const known = resolveCapabilities("gpt-4o-mini");
      const unknown = resolveCapabilities("non-existent-model");
      assert(!Object.prototype.hasOwnProperty.call(known, "unknown"), `known includes unknown: ${JSON.stringify(known)}`);
      assert(!Object.prototype.hasOwnProperty.call(unknown, "unknown"), `fallback includes unknown: ${JSON.stringify(unknown)}`);
      assert(Object.keys(unknown).length === 0, `fallback should be empty object: ${JSON.stringify(unknown)}`);
      return `known=${JSON.stringify(known)} fallback=${JSON.stringify(unknown)}`;
    }),
  );

  checks.push(
    await check("F-DPF-03: local DB models contain no capabilities.unknown", async () => {
      const models = await prisma.model.findMany({
        where: {
          capabilities: {
            path: ["unknown"],
            not: null,
          },
        },
        select: { name: true, capabilities: true },
      });
      assert(models.length === 0, `models still contain unknown: ${JSON.stringify(models)}`);
      return "no DB rows with capabilities.unknown";
    }),
  );

  checks.push(
    await check("F-DPF-04: chat description hardcoded examples exist in list_models", async () => {
      assert(chatDescription, "chat description unavailable because MCP smoke did not complete");
      const hardcoded = Array.from(
        new Set(
          [...chatDescription.matchAll(/[a-z0-9-]+\/[a-z0-9-]+(?:\/[a-z0-9-]+)*/gi)].map((match) => match[0]),
        ),
      );
      const names = new Set(listModelsNames);
      const missing = hardcoded.filter((model) => !names.has(model));
      assert(missing.length === 0, `chat description examples absent from list_models: ${missing.join(", ")}`);
      return `examples=${hardcoded.join(", ") || "<none>"}`;
    }),
  );

  checks.push(
    await check("F-DPF-04: generate_image description hardcoded examples exist in list_models", async () => {
      assert(imageDescription, "generate_image description unavailable because MCP smoke did not complete");
      const candidates = ["gpt-image-1", "dall-e-3", "seedream-4.5", "Wanx"];
      const mentioned = candidates.filter((candidate) => imageDescription.includes(candidate));
      const names = new Set(listModelsNames);
      const missing = mentioned.filter((model) => !names.has(model));
      assert(missing.length === 0, `generate_image examples absent from list_models: ${missing.join(", ")}`);
      return `examples=${mentioned.join(", ") || "<none>"}`;
    }),
  );

  const features: FeatureResult[] = [
    {
      featureId: "F-DPF-01",
      result: checks.find((item) => item.name.startsWith("F-DPF-01"))?.ok ? "PASS" : "FAIL",
      detail: checks.find((item) => item.name.startsWith("F-DPF-01"))?.detail ?? "missing evidence",
    },
    {
      featureId: "F-DPF-02",
      result:
        checks.find((item) => item.name.includes("fail fast when apiKey is missing"))?.ok &&
        !checks.find((item) => item.name.includes("local sync still reports 401"))?.ok
          ? "PARTIAL"
          : "FAIL",
      detail:
        `precheck=${checks.find((item) => item.name.includes("fail fast when apiKey is missing"))?.detail ?? "n/a"}; ` +
        `local_sync=${checks.find((item) => item.name.includes("local sync still reports 401"))?.detail ?? "n/a"}`,
    },
    {
      featureId: "F-DPF-03",
      result:
        checks.find((item) => item.name.includes("resolveCapabilities never returns unknown"))?.ok &&
        checks.find((item) => item.name.includes("local DB models contain no capabilities.unknown"))?.ok
          ? "PASS"
          : "FAIL",
      detail:
        `${checks.find((item) => item.name.includes("resolveCapabilities never returns unknown"))?.detail ?? "n/a"}; ` +
        `${checks.find((item) => item.name.includes("local DB models contain no capabilities.unknown"))?.detail ?? "n/a"}`,
    },
    {
      featureId: "F-DPF-04",
      result:
        checks.find((item) => item.name.startsWith("F-DPF-04: chat"))?.ok &&
        checks.find((item) => item.name.startsWith("F-DPF-04: generate_image"))?.ok
          ? "PASS"
          : "FAIL",
      detail:
        `chat=${checks.find((item) => item.name.startsWith("F-DPF-04: chat"))?.detail ?? "n/a"}; ` +
        `generate_image=${checks.find((item) => item.name.startsWith("F-DPF-04: generate_image"))?.detail ?? "n/a"}`,
    },
    {
      featureId: "F-DPF-05",
      result: checks.find((item) => item.name.startsWith("F-DPF-05: register user"))?.ok ? "PASS" : "FAIL",
      detail:
        checks.find((item) => item.name.startsWith("F-DPF-05: register user"))?.detail ??
        "runtime smoke evidence missing",
    },
  ];

  const summary = {
    baseUrl: BASE_URL,
    generatedAt: new Date().toISOString(),
    checks,
    features,
  };

  writeFileSync(OUTPUT_FILE, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));

  const hasFail = features.some((feature) => feature.result === "FAIL");
  process.exit(hasFail ? 1 : 0);
}

main()
  .catch(async (error) => {
    const fatal = {
      generatedAt: new Date().toISOString(),
      fatal: (error as Error).message,
    };
    writeFileSync(OUTPUT_FILE, JSON.stringify(fatal, null, 2));
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
