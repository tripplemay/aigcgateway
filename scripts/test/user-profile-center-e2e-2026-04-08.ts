import { writeFileSync } from "fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3099";
const OUTPUT =
  process.env.OUTPUT_FILE ?? "docs/test-reports/user-profile-center-e2e-2026-04-08.json";

interface StepResult {
  name: string;
  ok: boolean;
  detail?: string;
}

async function request(path: string, init?: RequestInit & { expect?: number }) {
  const { expect, ...rest } = init ?? {};
  const res = await fetch(`${BASE}${path}`, rest);
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
  return { status: res.status, body };
}

async function register(email: string, password: string, name: string) {
  await request("/api/auth/register", {
    method: "POST",
    expect: 201,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name }),
  });
}

async function login(
  email: string,
  password: string,
  userAgent: string,
): Promise<{ token: string; userId: string }> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": userAgent,
    },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`/api/auth/login failed: ${res.status} ${JSON.stringify(body)}`);
  }
  return { token: body.token, userId: body.user.id };
}

async function loginHistory(token: string) {
  const res = await request("/api/auth/login-history", {
    expect: 200,
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.body?.data ?? [];
}

async function main() {
  const steps: StepResult[] = [];
  const email = `upc_test_${Date.now()}@test.com`;
  const password = "Test1234!";

  try {
    await register(email, password, "UPC Tester");
    steps.push({ name: "register", ok: true, detail: email });

    const firstLogin = await login(email, password, "CodexTest/UA-1");
    steps.push({ name: "login #1", ok: true });

    const secondLogin = await login(email, password, "CodexTest/UA-2");
    steps.push({ name: "login #2", ok: true });

    const history = await loginHistory(secondLogin.token);
    if (history.length === 0) {
      throw new Error("login history empty");
    }
    const latest = history[0];
    if (!latest.userAgent?.includes("CodexTest/UA-2")) {
      throw new Error(`latest record UA mismatch: ${latest.userAgent}`);
    }
    steps.push({ name: "history endpoint", ok: true, detail: `records=${history.length}` });

    writeFileSync(
      OUTPUT,
      JSON.stringify(
        {
          email,
          userId: secondLogin.userId,
          results: steps,
          history,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    steps.push({ name: "error", ok: false, detail: (error as Error).message });
    writeFileSync(
      OUTPUT,
      JSON.stringify(
        {
          email,
          results: steps,
        },
        null,
        2,
      ),
    );
    console.error("[user-profile-center-e2e]", (error as Error).message);
    process.exitCode = 1;
  }
}

main();
