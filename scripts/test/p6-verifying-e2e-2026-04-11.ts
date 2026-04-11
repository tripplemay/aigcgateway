import { existsSync, readFileSync, writeFileSync } from "fs";
import { spawnSync } from "child_process";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const OUTPUT = process.env.OUTPUT_FILE ?? "docs/test-reports/p6-verifying-e2e-2026-04-11.json";

type Step = { id: string; ok: boolean; detail: string };

const ADAPTER_FILES = [
  "src/lib/sync/adapters/minimax.ts",
  "src/lib/sync/adapters/moonshot.ts",
  "src/lib/sync/adapters/qwen.ts",
  "src/lib/sync/adapters/stepfun.ts",
];

const PROVIDERS = [
  { name: "minimax", displayName: "MiniMax" },
  { name: "moonshot", displayName: "Moonshot/Kimi" },
  { name: "qwen", displayName: "阿里云百炼/Qwen" },
  { name: "stepfun", displayName: "阶跃星辰/StepFun" },
];

function run(cmd: string, args: string[], env?: NodeJS.ProcessEnv) {
  return spawnSync(cmd, args, {
    cwd: process.cwd(),
    env: env ?? process.env,
    encoding: "utf8",
  });
}

function checkAdapterFile(path: string): { ok: boolean; detail: string } {
  if (!existsSync(path)) return { ok: false, detail: `${path} missing` };
  const text = readFileSync(path, "utf8");
  const hasFilter = /filterModel\(modelId: string\): boolean/.test(text);
  const hasChatFilter = /isChatModality\(modelId\)/.test(text);
  const hasFetchModels = /async fetchModels\(/.test(text);
  return {
    ok: hasFilter && hasChatFilter && hasFetchModels,
    detail: `exists=true filter=${hasFilter} chatFilter=${hasChatFilter} fetchModels=${hasFetchModels}`,
  };
}

async function checkSeedData(): Promise<{ ok: boolean; detail: string }> {
  const rows = await prisma.provider.findMany({
    where: { name: { in: PROVIDERS.map((p) => p.name) } },
    include: { config: true },
    orderBy: { name: "asc" },
  });

  const details: string[] = [];
  let ok = true;

  for (const expected of PROVIDERS) {
    const matched = rows.filter((r) => r.name === expected.name);
    if (matched.length !== 1) {
      ok = false;
      details.push(`${expected.name}: provider_count=${matched.length}`);
      continue;
    }

    const p = matched[0];
    const auth = (p.authConfig ?? {}) as { apiKey?: string };
    const apiKey = auth.apiKey ?? "";

    const checks = {
      displayName: p.displayName === expected.displayName,
      adapterType: p.adapterType === "openai-compat",
      configExists: !!p.config,
      supportsModelsApi: !!p.config?.supportsModelsApi,
      apiKeyEmpty: apiKey === "",
    };

    if (!Object.values(checks).every(Boolean)) ok = false;
    details.push(
      `${p.name}: display=${checks.displayName} adapter=${checks.adapterType} config=${checks.configExists} supportsModelsApi=${checks.supportsModelsApi} apiKeyEmpty=${checks.apiKeyEmpty}`,
    );
  }

  return { ok, detail: details.join(" | ") };
}

async function main() {
  const steps: Step[] = [];

  // F-P6-01~04: adapter files + filter + registration
  for (const file of ADAPTER_FILES) {
    const res = checkAdapterFile(file);
    steps.push({ id: `adapter:${file}`, ok: res.ok, detail: res.detail });
  }

  const syncFile = readFileSync("src/lib/sync/model-sync.ts", "utf8");
  const regChecks = ["minimax: minimaxAdapter", "moonshot: moonshotAdapter", "qwen: qwenAdapter", "stepfun: stepfunAdapter"];
  const regMissing = regChecks.filter((s) => !syncFile.includes(s));
  steps.push({
    id: "F-P6-registration-in-model-sync",
    ok: regMissing.length === 0,
    detail: regMissing.length ? `missing=${regMissing.join(",")}` : "all adapters registered",
  });

  // tsc check
  const tsc = run("npx", ["tsc", "--noEmit"]);
  steps.push({
    id: "F-P6-tsc",
    ok: tsc.status === 0,
    detail: `exit=${tsc.status} stderr=${(tsc.stderr || "").slice(0, 200)}`,
  });

  // seed idempotency: run seed again
  const seedEnv = {
    ...process.env,
    DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://test:test@localhost:5432/aigc_gateway_test",
  } as NodeJS.ProcessEnv;
  const seedRun = run("npx", ["prisma", "db", "seed"], seedEnv);
  steps.push({
    id: "F-P6-seed-rerun",
    ok: seedRun.status === 0,
    detail: `exit=${seedRun.status} stdout=${(seedRun.stdout || "").split("\n").filter(Boolean).slice(-8).join(" || ")}`,
  });

  const seedData = await checkSeedData();
  steps.push({ id: "F-P6-seed-data", ok: seedData.ok, detail: seedData.detail });

  const pass = steps.filter((s) => s.ok).length;
  const fail = steps.length - pass;

  const report = {
    batch: "P6-providers-expansion",
    executedAt: new Date().toISOString(),
    pass,
    fail,
    steps,
  };

  writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));

  if (fail > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
