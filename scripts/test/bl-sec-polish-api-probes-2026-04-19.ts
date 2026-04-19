import { prisma } from "../../src/lib/prisma";
import bcrypt from "bcryptjs";
import http from "node:http";
import { buildProxyUrl } from "../../src/lib/api/image-proxy";

const BASE = process.env.BASE_URL ?? "http://localhost:3099";
const ADMIN_EMAIL = "admin@aigc-gateway.local";
const ADMIN_PASSWORD = process.env.ADMIN_SEED_PASSWORD ?? "CodexSeed@2026";

type CaseResult = {
  id: string;
  pass: boolean;
  detail: string;
  data?: Record<string, unknown>;
};

async function postJson(path: string, body: unknown, headers?: Record<string, string>) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    signal: AbortSignal.timeout(20_000),
    headers: {
      "Content-Type": "application/json",
      ...(headers ?? {}),
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json, text };
}

async function main() {
  process.env.IMAGE_PROXY_SECRET = process.env.IMAGE_PROXY_SECRET ?? "codex-image-proxy-secret";

  const results: CaseResult[] = [];

  try {
    // admin login token + admin user + project bootstrap
    const adminLogin = await postJson(
      "/api/auth/login",
      { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
      { "x-forwarded-for": "198.51.100.200" },
    );
    if (adminLogin.status !== 200 || !adminLogin.json?.token) {
      throw new Error(`admin login failed: ${adminLogin.status} ${adminLogin.text}`);
    }
    const adminToken = adminLogin.json.token as string;
    const admin = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
    if (!admin) throw new Error("admin user missing");

    let projectId = admin.defaultProjectId;
    if (!projectId) {
      const p = await prisma.project.create({
        data: { userId: admin.id, name: "Sec Polish Probe Project", description: "probe" },
      });
      projectId = p.id;
      await prisma.user.update({ where: { id: admin.id }, data: { defaultProjectId: projectId } });
    }

    // #1 nonexistent + wrong password <50ms
    {
      const start = Date.now();
      const r = await postJson(
        "/api/auth/login",
        { email: `ghost_${Date.now()}@example.com`, password: "WrongPassword123!" },
        { "x-forwarded-for": "203.0.113.11" },
      );
      const ms = Date.now() - start;
      const pass = r.status === 401 && ms < 50;
      results.push({
        id: "#1",
        pass,
        detail: `status=${r.status}, elapsedMs=${ms}, expected status=401 and <50ms`,
        data: { status: r.status, elapsedMs: ms },
      });
    }

    // #2 existing + wrong password >150ms
    {
      const email = `exist_wrong_${Date.now()}@example.com`;
      await prisma.user.create({
        data: { email, name: "probe", passwordHash: await bcrypt.hash("GoodPass123!", 12) },
      });
      const start = Date.now();
      const r = await postJson(
        "/api/auth/login",
        { email, password: "BadPass123!" },
        { "x-forwarded-for": "203.0.113.12" },
      );
      const ms = Date.now() - start;
      const pass = r.status === 401 && ms > 150;
      results.push({
        id: "#2",
        pass,
        detail: `status=${r.status}, elapsedMs=${ms}, expected status=401 and >150ms`,
        data: { status: r.status, elapsedMs: ms },
      });
    }

    // #3 rehash cost10 -> cost12
    {
      const email = `rehash_${Date.now()}@example.com`;
      const plain = "RehashPass123!";
      await prisma.user.create({
        data: {
          email,
          name: "rehash",
          passwordHash: await bcrypt.hash(plain, 10),
        },
      });
      const login = await postJson(
        "/api/auth/login",
        { email, password: plain },
        { "x-forwarded-for": "203.0.113.13" },
      );
      const deadline = Date.now() + 5000;
      let rounds = -1;
      while (Date.now() < deadline) {
        const after = await prisma.user.findUnique({ where: { email }, select: { passwordHash: true } });
        rounds = after?.passwordHash ? bcrypt.getRounds(after.passwordHash) : -1;
        if (rounds === 12) break;
        await new Promise((r) => setTimeout(r, 250));
      }
      const pass = login.status === 200 && rounds === 12;
      results.push({
        id: "#3",
        pass,
        detail: `loginStatus=${login.status}, bcryptRoundsAfter=${rounds}, expected 200 and rounds=12`,
        data: { loginStatus: login.status, loginBody: login.json, bcryptRoundsAfter: rounds },
      });
    }

    // #4 login same IP 11 req/min -> 11th 429
    {
      const ip = "203.0.113.41";
      const statuses: number[] = [];
      for (let i = 0; i < 11; i++) {
        const r = await postJson(
          "/api/auth/login",
          { email: `ip_bucket_${Date.now()}_${i}@example.com`, password: "Wrong123!" },
          { "x-forwarded-for": ip },
        );
        statuses.push(r.status);
      }
      const pass = statuses.slice(0, 10).every((s) => s === 401) && statuses[10] === 429;
      results.push({ id: "#4", pass, detail: `statuses=${statuses.join(",")}`, data: { statuses } });
    }

    // #5 login same email 6 req/min -> 6th 429
    {
      const email = `acct_bucket_${Date.now()}@example.com`;
      await prisma.user.create({
        data: { email, name: "acct", passwordHash: await bcrypt.hash("GoodPass123!", 12) },
      });
      const statuses: number[] = [];
      for (let i = 0; i < 6; i++) {
        const r = await postJson(
          "/api/auth/login",
          { email, password: `BadPass-${i}` },
          { "x-forwarded-for": `198.51.100.${20 + i}` },
        );
        statuses.push(r.status);
      }
      const pass = statuses.slice(0, 5).every((s) => s === 401) && statuses[5] === 429;
      results.push({ id: "#5", pass, detail: `statuses=${statuses.join(",")}`, data: { statuses } });
    }

    // #6 register same IP 11 req/min -> 11th 429
    {
      const ip = "203.0.113.61";
      const statuses: number[] = [];
      for (let i = 0; i < 11; i++) {
        const r = await postJson(
          "/api/auth/register",
          { email: `reg_bucket_${Date.now()}_${i}@example.com`, password: "RegPass123!" },
          { "x-forwarded-for": ip },
        );
        statuses.push(r.status);
      }
      const pass = statuses.slice(0, 10).every((s) => s === 201) && statuses[10] === 429;
      results.push({ id: "#6", pass, detail: `statuses=${statuses.join(",")}`, data: { statuses } });
    }

    // #7 #8 #9 test-webhook unsafe URL checks
    const unsafeCases = [
      { id: "#7", url: "http://example.com/hook" },
      { id: "#8", url: "https://169.254.169.254/latest/meta-data" },
      { id: "#9", url: "https://10.0.0.1/hook" },
    ];
    await prisma.notificationPreference.upsert({
      where: {
        userId_eventType: {
          userId: admin.id,
          eventType: "BALANCE_LOW",
        },
      },
      create: {
        userId: admin.id,
        eventType: "BALANCE_LOW",
        channels: ["webhook"],
        webhookUrl: "https://example.com/seed",
        webhookSecret: "probe",
        enabled: true,
      },
      update: {
        channels: ["webhook"],
        webhookUrl: "https://example.com/seed",
        webhookSecret: "probe",
        enabled: true,
      },
    });
    for (const c of unsafeCases) {
      await prisma.notificationPreference.update({
        where: {
          userId_eventType: {
            userId: admin.id,
            eventType: "BALANCE_LOW",
          },
        },
        data: { webhookUrl: c.url, webhookSecret: "probe", channels: ["webhook"], enabled: true },
      });
      const r = await fetch(`${BASE}/api/notifications/test-webhook`, {
        method: "POST",
        headers: { Authorization: `Bearer ${adminToken}` },
        signal: AbortSignal.timeout(20_000),
      });
      const body = await r.json().catch(() => ({}));
      const code = body?.error?.code ?? body?.code ?? null;
      const pass = r.status === 400 && code === "invalid_webhook_url";
      results.push({
        id: c.id,
        pass,
        detail: `status=${r.status}, code=${code}, url=${c.url}`,
        data: { status: r.status, code, body },
      });
    }

    // #10 image-proxy content-type sanitize
    {
      const mock = http.createServer((_req, res) => {
        res.writeHead(200, { "content-type": "text/html" });
        res.end("<html><body>not-image</body></html>");
      });
      await new Promise<void>((resolve, reject) => {
        mock.once("error", reject);
        mock.listen(32124, "127.0.0.1", () => resolve());
      });

      try {
        const traceId = `trace_sec_polish_${Date.now()}`;
        await prisma.callLog.create({
          data: {
            traceId,
            projectId: projectId!,
            modelName: "image-proxy-probe",
            promptSnapshot: { prompt: "probe" },
            status: "SUCCESS",
            responseSummary: { original_urls: ["http://127.0.0.1:32124/probe"] },
            source: "api",
          },
        });

        const proxyUrl = buildProxyUrl(traceId, 0, BASE, 600);
        const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(20_000) });
        const ct = (res.headers.get("content-type") || "").toLowerCase();
        const pass = res.status === 200 && ct === "application/octet-stream";
        results.push({
          id: "#10",
          pass,
          detail: `status=${res.status}, contentType=${ct}`,
          data: { status: res.status, contentType: ct },
        });
      } finally {
        await new Promise<void>((resolve) => mock.close(() => resolve()));
      }
    }

    const output = {
      generatedAt: new Date().toISOString(),
      base: BASE,
      summary: {
        total: results.length,
        pass: results.filter((r) => r.pass).length,
        fail: results.filter((r) => !r.pass).length,
      },
      results,
    };

    console.log(JSON.stringify(output, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
