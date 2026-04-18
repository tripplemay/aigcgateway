/**
 * 压力测试脚本
 *
 * 用法：BASE_URL=https://aigc.guangai.ai npx tsx scripts/stress-test.ts
 *
 * 依赖：autocannon（通过 npx 自动安装，无需全局）
 */

import { execSync, spawn } from "child_process";
import { requireEnv } from "./lib/require-env";

const BASE = process.env.BASE_URL ?? "https://aigc.guangai.ai";
const ADMIN_EMAIL = "codex-admin@aigc-gateway.local";
const ADMIN_PASSWORD = requireEnv("ADMIN_TEST_PASSWORD");

// ─── Helpers ────────────────────────────────────────────────

interface AutocannonResult {
  requests: { average: number; total: number };
  latency: { p50: number; p95: number; p99: number; average: number };
  errors: number;
  timeouts: number;
  non2xx: number;
  duration: number;
}

function runAutocannon(opts: {
  url: string;
  connections: number;
  duration: number;
  headers?: Record<string, string>;
  title: string;
}): AutocannonResult {
  const headerFlags = Object.entries(opts.headers ?? {})
    .map(([k, v]) => `-H '${k}=${v}'`)
    .join(" ");

  const cmd = `npx autocannon -c ${opts.connections} -d ${opts.duration} ${headerFlags} -j '${opts.url}'`;
  console.log(`  Running: ${opts.title} (c=${opts.connections}, d=${opts.duration}s)`);

  const raw = execSync(cmd, { timeout: (opts.duration + 30) * 1000, encoding: "utf-8" });
  const data = JSON.parse(raw);

  return {
    requests: { average: data.requests.average, total: data.requests.total },
    latency: {
      p50: data.latency.p50,
      p95: data.latency.p97_5, // autocannon uses p97_5 for ~P95
      p99: data.latency.p99,
      average: data.latency.average,
    },
    errors: data.errors,
    timeouts: data.timeouts,
    non2xx: data.non2xx,
    duration: data.duration,
  };
}

function fmt(r: AutocannonResult): string {
  const errorTotal = r.errors + r.timeouts + r.non2xx;
  const errorRate =
    r.requests.total > 0 ? ((errorTotal / r.requests.total) * 100).toFixed(2) : "0.00";
  return [
    `  RPS: ${r.requests.average.toFixed(1)}`,
    `  Total: ${r.requests.total}`,
    `  P50: ${r.latency.p50}ms  P95: ${r.latency.p95}ms  P99: ${r.latency.p99}ms`,
    `  Errors: ${errorTotal} (${errorRate}%)`,
  ].join("\n");
}

// ─── Login ──────────────────────────────────────────────────

async function login(): Promise<string> {
  console.log(`\nLogging in to ${BASE}...`);
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  if (!res.ok) throw new Error(`Login failed: ${res.status}`);
  const data = (await res.json()) as { token: string };
  console.log("Login OK\n");
  return data.token;
}

// ─── Scenarios ──────────────────────────────────────────────

interface ScenarioResult {
  name: string;
  cold: AutocannonResult;
  warm: AutocannonResult;
}

function runScenario(opts: {
  name: string;
  url: string;
  connections: number;
  duration: number;
  headers?: Record<string, string>;
}): ScenarioResult {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Scenario: ${opts.name}`);
  console.log(`${"=".repeat(60)}`);

  // Round 1: Cold (cache miss)
  console.log("\n[Round 1 — Cold]");
  const cold = runAutocannon({ ...opts, title: `${opts.name} (cold)` });
  console.log(fmt(cold));

  // Round 2: Warm (cache hit)
  console.log("\n[Round 2 — Warm]");
  const warm = runAutocannon({ ...opts, title: `${opts.name} (warm)` });
  console.log(fmt(warm));

  return { name: opts.name, cold, warm };
}

// ─── Mixed concurrency (Scenario E) ────────────────────────

interface MixedResult {
  name: string;
  results: AutocannonResult[];
  combined: { totalRequests: number; totalErrors: number; maxP99: number; errorRate: string };
}

function spawnAutocannon(opts: {
  url: string;
  connections: number;
  duration: number;
  headers?: Record<string, string>;
  name: string;
}): Promise<AutocannonResult> {
  return new Promise((resolve, reject) => {
    const args = ["autocannon", "-c", String(opts.connections), "-d", String(opts.duration), "-j"];
    for (const [k, v] of Object.entries(opts.headers ?? {})) {
      args.push("-H", `${k}=${v}`);
    }
    args.push(opts.url);

    const child = spawn("npx", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(`${opts.name} exited with ${code}`));
      try {
        const data = JSON.parse(stdout);
        resolve({
          requests: { average: data.requests.average, total: data.requests.total },
          latency: {
            p50: data.latency.p50,
            p95: data.latency.p97_5,
            p99: data.latency.p99,
            average: data.latency.average,
          },
          errors: data.errors,
          timeouts: data.timeouts,
          non2xx: data.non2xx,
          duration: data.duration,
        });
      } catch (e) {
        reject(new Error(`${opts.name} JSON parse error: ${(e as Error).message}`));
      }
    });
  });
}

async function runMixed(jwt: string): Promise<MixedResult> {
  console.log(`\n${"=".repeat(60)}`);
  console.log("Scenario E: Mixed Concurrency (truly parallel)");
  console.log(`${"=".repeat(60)}`);

  const authHeaders = { Authorization: `Bearer ${jwt}` };
  const scenarios = [
    { name: "E-models", url: `${BASE}/v1/models`, connections: 20, duration: 60, headers: {} },
    {
      name: "E-channels",
      url: `${BASE}/api/admin/models-channels`,
      connections: 10,
      duration: 60,
      headers: authHeaders,
    },
    {
      name: "E-usage",
      url: `${BASE}/api/admin/usage?period=7d`,
      connections: 10,
      duration: 60,
      headers: authHeaders,
    },
  ];

  console.log("  Launching 3 autocannon processes in parallel...");

  // Launch all 3 concurrently via Promise.all
  const results = await Promise.all(scenarios.map((s) => spawnAutocannon(s)));

  for (let i = 0; i < results.length; i++) {
    console.log(`\n[${scenarios[i].name}]`);
    console.log(fmt(results[i]));
  }

  const totalRequests = results.reduce((a, r) => a + r.requests.total, 0);
  const totalErrors = results.reduce((a, r) => a + r.errors + r.timeouts + r.non2xx, 0);
  const maxP99 = Math.max(...results.map((r) => r.latency.p99));
  const errorRate = totalRequests > 0 ? ((totalErrors / totalRequests) * 100).toFixed(2) : "0.00";

  console.log(
    `\n  Combined: ${totalRequests} total, ${totalErrors} errors (${errorRate}%), max P99: ${maxP99}ms`,
  );

  return { name: "Mixed", results, combined: { totalRequests, totalErrors, maxP99, errorRate } };
}

// ─── Report generation ──────────────────────────────────────

function generateReport(scenarios: ScenarioResult[], mixed: MixedResult): string {
  const lines: string[] = [
    "# 压力测试报告 — 2026-04-04",
    "",
    `> 目标服务器：${BASE}`,
    "> 工具：autocannon (Node.js)",
    `> 执行时间：${new Date().toISOString()}`,
    "",
    "---",
    "",
  ];

  // Individual scenarios
  for (const s of scenarios) {
    const coldErrors = s.cold.errors + s.cold.timeouts + s.cold.non2xx;
    const warmErrors = s.warm.errors + s.warm.timeouts + s.warm.non2xx;
    const coldErrRate =
      s.cold.requests.total > 0 ? ((coldErrors / s.cold.requests.total) * 100).toFixed(2) : "0.00";
    const warmErrRate =
      s.warm.requests.total > 0 ? ((warmErrors / s.warm.requests.total) * 100).toFixed(2) : "0.00";

    lines.push(
      `## ${s.name}`,
      "",
      "| 指标 | Cold (Round 1) | Warm (Round 2) |",
      "|---|---|---|",
      `| RPS | ${s.cold.requests.average.toFixed(1)} | ${s.warm.requests.average.toFixed(1)} |`,
      `| Total Requests | ${s.cold.requests.total} | ${s.warm.requests.total} |`,
      `| P50 | ${s.cold.latency.p50}ms | ${s.warm.latency.p50}ms |`,
      `| P95 | ${s.cold.latency.p95}ms | ${s.warm.latency.p95}ms |`,
      `| P99 | ${s.cold.latency.p99}ms | ${s.warm.latency.p99}ms |`,
      `| Errors | ${coldErrors} (${coldErrRate}%) | ${warmErrors} (${warmErrRate}%) |`,
      "",
    );
  }

  // Mixed scenario
  lines.push(
    "## Scenario E — Mixed Concurrency (60s, 40 total connections)",
    "",
    "| Sub-scenario | RPS | P99 | Errors |",
    "|---|---|---|---|",
  );
  for (let i = 0; i < mixed.results.length; i++) {
    const r = mixed.results[i];
    const names = ["models (c=20)", "models-channels (c=10)", "usage (c=10)"];
    const errs = r.errors + r.timeouts + r.non2xx;
    lines.push(`| ${names[i]} | ${r.requests.average.toFixed(1)} | ${r.latency.p99}ms | ${errs} |`);
  }
  lines.push(
    "",
    `**Combined:** ${mixed.combined.totalRequests} requests, ${mixed.combined.totalErrors} errors (${mixed.combined.errorRate}%), max P99: ${mixed.combined.maxP99}ms`,
    "",
  );

  // Conclusion
  lines.push("---", "", "## 结论", "");

  const allWarmP99 = scenarios.map((s) => s.warm.latency.p99);
  const p99Pass = allWarmP99.every((p) => p < 200);
  const mixedErrPass = parseFloat(mixed.combined.errorRate) < 1;

  lines.push(
    `- 缓存命中后 P99 < 200ms: ${p99Pass ? "**PASS**" : "**FAIL**"} (${allWarmP99.map((p) => `${p}ms`).join(", ")})`,
  );
  lines.push(
    `- 混合并发错误率 < 1%: ${mixedErrPass ? "**PASS**" : "**FAIL**"} (${mixed.combined.errorRate}%)`,
  );

  if (!p99Pass) {
    const bottlenecks = scenarios.filter((s) => s.warm.latency.p99 >= 200);
    lines.push(
      `- 瓶颈: ${bottlenecks.map((b) => `${b.name} warm P99=${b.warm.latency.p99}ms`).join(", ")}`,
    );
  }

  return lines.join("\n");
}

// ─── Main ───────────────────────────────────────────────────

async function main() {
  const jwt = await login();
  const authHeaders = { Authorization: `Bearer ${jwt}` };

  const scenarioA = runScenario({
    name: "A — /v1/models",
    url: `${BASE}/v1/models`,
    connections: 50,
    duration: 30,
    headers: {},
  });

  const scenarioB = runScenario({
    name: "B — /api/admin/models-channels",
    url: `${BASE}/api/admin/models-channels`,
    connections: 20,
    duration: 30,
    headers: authHeaders,
  });

  const scenarioC = runScenario({
    name: "C — /api/admin/usage?period=7d",
    url: `${BASE}/api/admin/usage?period=7d`,
    connections: 20,
    duration: 30,
    headers: authHeaders,
  });

  const scenarioD = runScenario({
    name: "D — /api/admin/usage/by-model?period=7d",
    url: `${BASE}/api/admin/usage/by-model?period=7d`,
    connections: 20,
    duration: 30,
    headers: authHeaders,
  });

  const mixed = await runMixed(jwt);

  const report = generateReport([scenarioA, scenarioB, scenarioC, scenarioD], mixed);
  console.log("\n\n" + report);

  // Write report file
  const fs = await import("fs");
  fs.writeFileSync("docs/test-reports/stress-test-2026-04-04.md", report);
  console.log("\nReport written to docs/test-reports/stress-test-2026-04-04.md");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
