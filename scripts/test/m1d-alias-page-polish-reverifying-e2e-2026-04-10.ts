import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { readFileSync, writeFileSync } from "fs";
import { requireEnv } from "../lib/require-env";

const BASE = process.env.BASE_URL ?? "http://localhost:3199";
const OUTPUT =
  process.env.OUTPUT_FILE ?? "docs/test-reports/m1d-alias-page-polish-reverifying-e2e-2026-04-10.json";
const MOCK_PORT = Number(process.env.MOCK_PORT ?? "3343");
const MOCK_BASE = `http://127.0.0.1:${MOCK_PORT}`;

const ADMIN_CANDIDATES = [
  { email: "admin@aigc-gateway.local", password: requireEnv("ADMIN_TEST_PASSWORD") },
  { email: "codex-admin@aigc-gateway.local", password: requireEnv("ADMIN_TEST_PASSWORD") },
];

type Step = { id: string; name: string; ok: boolean; detail: string };

type ApiResult = { status: number; body: any; text: string };

let adminToken = "";

function nowTag() {
  return Date.now().toString(36);
}

function read(path: string) {
  return readFileSync(path, "utf8");
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

function buildCaps(alias: string) {
  const lower = alias.toLowerCase();
  const vision = /(vision|image|vl|gemini|gpt-4o)/.test(lower);
  const imageInput = vision;
  return {
    function_calling: true,
    streaming: true,
    vision,
    system_prompt: true,
    json_mode: true,
    image_input: imageInput,
  };
}

function parseAliasesFromPrompt(prompt: string): string[] {
  const listStart = prompt.indexOf("别名列表：");
  if (listStart < 0) return [];
  const lines = prompt
    .slice(listStart)
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.startsWith("- "));
  return lines.map((line) => line.slice(2).trim()).filter(Boolean);
}

async function startMockServer() {
  const server = createServer(async (req, res) => {
    if (req.method === "POST" && req.url === "/chat/completions") {
      const bodyText = await readBody(req);
      const body = JSON.parse(bodyText || "{}");
      const prompt = String(body?.messages?.[0]?.content ?? "");

      const aliases = parseAliasesFromPrompt(prompt);
      const result: Record<string, Record<string, boolean>> = {};
      for (const a of aliases) result[a] = buildCaps(a);

      json(res, 200, {
        id: "chatcmpl-m1d-caps",
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: "deepseek-chat",
        choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(result) } }],
      });
      return;
    }

    await readBody(req);
    json(res, 404, { error: "not_found" });
  });

  await new Promise<void>((resolve) => server.listen(MOCK_PORT, "127.0.0.1", resolve));
  return server;
}

async function api(path: string, init?: RequestInit & { expect?: number; auth?: "jwt" | "none" }) {
  const { expect, auth = "jwt", ...rest } = init ?? {};
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...(rest.headers as Record<string, string> | undefined),
  };
  if (auth === "jwt" && adminToken) headers.authorization = `Bearer ${adminToken}`;

  const res = await fetch(`${BASE}${path}`, { ...rest, headers, redirect: "manual" });
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (typeof expect === "number" && res.status !== expect) {
    throw new Error(`${path} expected ${expect}, got ${res.status}: ${JSON.stringify(body)}`);
  }
  return { status: res.status, body, text } as ApiResult;
}

async function loginAdmin() {
  for (const c of ADMIN_CANDIDATES) {
    try {
      const res = await api("/api/auth/login", {
        method: "POST",
        auth: "none",
        expect: 200,
        body: JSON.stringify(c),
      });
      const token = String(res.body?.token ?? "");
      if (token) {
        adminToken = token;
        return;
      }
    } catch {
      // try next candidate
    }
  }
  throw new Error("admin login failed");
}

async function patchDeepSeekProviderForMock() {
  const providers = await api("/api/admin/providers", { expect: 200 });
  const list = providers.body?.data ?? [];
  const deepseek = list.find((p: any) => p?.name === "deepseek");
  if (!deepseek?.id) throw new Error("deepseek provider not found");

  await api(`/api/admin/providers/${deepseek.id}`, {
    method: "PATCH",
    expect: 200,
    body: JSON.stringify({
      status: "ACTIVE",
      baseUrl: MOCK_BASE,
      apiKey: "mock-deepseek-key",
    }),
  });
}

async function run() {
  const steps: Step[] = [];
  const tag = nowTag();
  const mock = await startMockServer();

  try {
    await loginAdmin();

    const page = read("src/app/(console)/admin/model-aliases/page.tsx");
    const en = read("src/messages/en.json");
    const zh = read("src/messages/zh-CN.json");

    // AC1: single-column list layout + accordion
    const ac1Ok =
      page.includes("/* ═══ Alias List (single-column) ═══ */") &&
      page.includes("<div className=\"flex flex-col gap-2\">") &&
      page.includes("const [expandedId, setExpandedId]") &&
      page.includes("{isExpanded && (");
    steps.push({
      id: "AC1",
      name: "别名管理页为单列列表 + 行下 accordion 展开",
      ok: ac1Ok,
      detail: ac1Ok ? "single-column + accordion present" : "missing single-column/accordion signals",
    });

    // AC2: search/filter/sort implementation
    const ac2Ok =
      page.includes("const [search, setSearch]") &&
      page.includes("const [filterBrand, setFilterBrand]") &&
      page.includes("const [filterModality, setFilterModality]") &&
      page.includes("const [filterEnabled, setFilterEnabled]") &&
      page.includes("const [sortKey, setSortKey]") &&
      page.includes("if (sortKey === \"enabled\")") &&
      page.includes("return a.enabled ? -1 : 1") &&
      page.includes("<SearchBar") &&
      page.includes("allBrands") &&
      page.includes("allModalities") &&
      page.includes("sortEnabled");
    steps.push({
      id: "AC2",
      name: "搜索/筛选/排序逻辑齐全（enabled 优先，名称次序）",
      ok: ac2Ok,
      detail: ac2Ok ? "search+filters+sort logic present" : "missing search/filter/sort logic",
    });

    // AC3: sellPrice editable + /v1/models uses alias sellPrice
    const aliasesRes = await api("/api/admin/model-aliases", { expect: 200 });
    const unlinked = Array.isArray(aliasesRes.body?.unlinkedModels) ? aliasesRes.body.unlinkedModels : [];

    if (unlinked.length === 0) {
      throw new Error("no unlinked model available for sellPrice e2e");
    }

    const targetModel = unlinked[0];
    const aliasName = `m1d-sell-${tag}`;

    const createAlias = await api("/api/admin/model-aliases", {
      method: "POST",
      expect: 201,
      body: JSON.stringify({ alias: aliasName, brand: "M1D", modality: String(targetModel.modality ?? "TEXT") }),
    });
    const aliasId = String(createAlias.body?.id ?? "");
    if (!aliasId) throw new Error("created alias id missing");

    await api(`/api/admin/model-aliases/${aliasId}/link`, {
      method: "POST",
      expect: 201,
      body: JSON.stringify({ modelId: String(targetModel.id) }),
    });

    await api(`/api/admin/model-aliases/${aliasId}`, {
      method: "PATCH",
      expect: 200,
      body: JSON.stringify({
        enabled: true,
        sellPrice: { unit: "token", inputPer1M: 1.23, outputPer1M: 4.56 },
      }),
    });

    const modalityParam = String(targetModel.modality ?? "TEXT").toLowerCase();
    const modelsRes = await api(`/v1/models?modality=${encodeURIComponent(modalityParam)}`, {
      expect: 200,
      auth: "none",
    });
    const models = Array.isArray(modelsRes.body?.data) ? modelsRes.body.data : [];
    const hit = models.find((m: any) => m?.id === aliasName);
    const pricing = hit?.pricing ?? {};

    const ac3Ok =
      !!hit &&
      pricing.unit === "token" &&
      Number(pricing.input_per_1m) === 1.23 &&
      Number(pricing.output_per_1m) === 4.56;
    steps.push({
      id: "AC3",
      name: "别名层 sellPrice 可编辑，且 /v1/models 返回别名售价",
      ok: ac3Ok,
      detail: `modality=${modalityParam}, alias_found=${!!hit}, pricing=${JSON.stringify(pricing)}`,
    });

    // AC4: inferMissingCapabilities fills null only, does not override existing
    await patchDeepSeekProviderForMock();

    const capsFillAlias = `m1d-cap-fill-${tag}`;
    const capsKeepAlias = `m1d-cap-keep-${tag}`;

    const fillRes = await api("/api/admin/model-aliases", {
      method: "POST",
      expect: 201,
      body: JSON.stringify({ alias: capsFillAlias, brand: "M1D", modality: "TEXT" }),
    });
    const fillId = String(fillRes.body?.id ?? "");

    const keepRes = await api("/api/admin/model-aliases", {
      method: "POST",
      expect: 201,
      body: JSON.stringify({ alias: capsKeepAlias, brand: "M1D", modality: "TEXT" }),
    });
    const keepId = String(keepRes.body?.id ?? "");

    await api(`/api/admin/model-aliases/${keepId}`, {
      method: "PATCH",
      expect: 200,
      body: JSON.stringify({ capabilities: { streaming: false, vision: false } }),
    });

    const inferApi = await api("/api/admin/model-aliases/infer-capabilities", {
      method: "POST",
      expect: 200,
      body: JSON.stringify({}),
    });
    const inferResult = inferApi.body ?? {};

    const listAfterInfer = await api("/api/admin/model-aliases", { expect: 200 });
    const dataAfterInfer = Array.isArray(listAfterInfer.body?.data) ? listAfterInfer.body.data : [];
    const fillAlias = dataAfterInfer.find((a: any) => a?.id === fillId);
    const keepAlias = dataAfterInfer.find((a: any) => a?.id === keepId);

    const fillCaps = fillAlias?.capabilities ?? null;
    const keepCaps = keepAlias?.capabilities ?? null;

    const ac4Ok =
      !!fillCaps &&
      typeof fillCaps.function_calling === "boolean" &&
      keepCaps?.streaming === false &&
      keepCaps?.vision === false;

    steps.push({
      id: "AC4",
      name: "LLM 推断 capabilities：填充空值且不覆盖已有",
      ok: ac4Ok,
      detail: `infer_updated=${inferResult.updated ?? "n/a"}, infer_errors=${JSON.stringify(inferResult.errors ?? [])}, fill_caps=${JSON.stringify(fillCaps)}, keep_caps=${JSON.stringify(keepCaps)}`,
    });

    // AC5: DS token consistency
    const dsRawMatches = page.match(
      /#[0-9A-Fa-f]{3,8}|\b(text|bg|border)-(slate|gray|zinc|neutral|indigo|amber|emerald|green|red|orange|pink)-[0-9]{2,3}\b/g,
    );
    const ac5Ok = !dsRawMatches || dsRawMatches.length === 0;
    steps.push({
      id: "AC5",
      name: "DS token 一致性（无硬编码色值/原始色阶）",
      ok: ac5Ok,
      detail: ac5Ok ? "clean" : `hits=${[...new Set(dsRawMatches ?? [])].join(",")}`,
    });

    // AC6: i18n residue
    const i18nPageSignals = ["searchAliases", "allBrands", "sortEnabled", "sellPrice", "inputPer1M", "perCall"];
    const i18nPageOk = i18nPageSignals.every((k) => page.includes(`t(\"${k}\")`));

    const i18nKeys = [
      "searchAliases",
      "allBrands",
      "allModalities",
      "allStatus",
      "enabledOnly",
      "disabledOnly",
      "sortEnabled",
      "sortName",
      "sortBrand",
      "sellPrice",
      "inputPer1M",
      "outputPer1M",
      "perCall",
      "sizePlaceholder",
      "brandPlaceholder",
      "channels",
    ];
    const i18nMsgOk = i18nKeys.every((k) => en.includes(`\"${k}\"`) && zh.includes(`\"${k}\"`));

    const hardcodedCn = ["搜索别名", "品牌：全部", "排序：启用优先", "售价"];
    const hasHardcodedCn = hardcodedCn.some((s) => page.includes(s));

    const ac6Ok = i18nPageOk && i18nMsgOk && !hasHardcodedCn;
    steps.push({
      id: "AC6",
      name: "i18n 无残留（页面走 t()，中英文 key 同步）",
      ok: ac6Ok,
      detail: `i18nPageOk=${i18nPageOk}, i18nMsgOk=${i18nMsgOk}, hasHardcodedCn=${hasHardcodedCn}`,
    });
  } finally {
    await new Promise<void>((resolve, reject) => mock.close((err) => (err ? reject(err) : resolve())));
  }

  const passCount = steps.filter((s) => s.ok).length;
  const failCount = steps.length - passCount;

  const result = {
    batch: "M1d-alias-page-polish",
    feature: "F-M1d-06",
    executedAt: new Date().toISOString(),
    baseUrl: BASE,
    passCount,
    failCount,
    steps,
  };

  writeFileSync(OUTPUT, JSON.stringify(result, null, 2));

  if (failCount > 0) {
    console.error(JSON.stringify(result, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify(result, null, 2));
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
