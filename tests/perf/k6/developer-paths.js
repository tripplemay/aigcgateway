import http from "k6/http";
import { check, sleep } from "k6";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3099";
const DEV_EMAIL = __ENV.DEV_EMAIL || "dev@example.com";
const DEV_PASSWORD = __ENV.DEV_PASSWORD;
if (!DEV_PASSWORD) {
  throw new Error("Missing env: DEV_PASSWORD (k6 -e DEV_PASSWORD=... required)");
}
const ZERO_BALANCE_KEY = __ENV.ZERO_BALANCE_KEY || "";
const NO_CHAT_KEY = __ENV.NO_CHAT_KEY || "";
const REAL_CHAT_KEY = __ENV.REAL_CHAT_KEY || "";
const CHAT_MODEL = __ENV.CHAT_MODEL || "deepseek/v3";

export const options = {
  scenarios: {
    login_load: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "20s", target: 1 },
        { duration: "40s", target: 5 },
        { duration: "20s", target: 0 },
      ],
      exec: "login",
    },
    zero_balance_gate: {
      executor: "shared-iterations",
      vus: 3,
      iterations: 30,
      startTime: "90s",
      exec: "zeroBalanceGate",
    },
    no_chat_permission_gate: {
      executor: "shared-iterations",
      vus: 3,
      iterations: 30,
      startTime: "130s",
      exec: "noChatPermissionGate",
    },
    real_chat_baseline: {
      executor: "shared-iterations",
      vus: 1,
      iterations: 10,
      startTime: "170s",
      exec: "realChat",
    },
  },
  thresholds: {
    "http_req_duration{scenario:login}": ["p(95)<800"],
    "http_req_duration{scenario:zero_balance_gate}": ["p(95)<800"],
    "http_req_duration{scenario:no_chat_permission_gate}": ["p(95)<700"],
    "http_req_duration{scenario:real_chat_baseline}": ["p(95)<5000"],
    http_req_failed: ["rate<0.01"],
  },
};

function jsonHeaders(extra = {}) {
  return {
    "Content-Type": "application/json",
    ...extra,
  };
}

export function login() {
  const res = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({ email: DEV_EMAIL, password: DEV_PASSWORD }),
    {
      headers: jsonHeaders(),
      tags: { scenario: "login" },
    },
  );

  check(res, {
    "login status is 200": (r) => r.status === 200,
  });

  sleep(1);
}

export function zeroBalanceGate() {
  if (!ZERO_BALANCE_KEY) {
    return;
  }

  const res = http.post(
    `${BASE_URL}/api/v1/chat/completions`,
    JSON.stringify({
      model: CHAT_MODEL,
      messages: [{ role: "user", content: "Reply with OK only." }],
    }),
    {
      headers: jsonHeaders({
        Authorization: `Bearer ${ZERO_BALANCE_KEY}`,
      }),
      tags: { scenario: "zero_balance_gate" },
    },
  );

  check(res, {
    "zero balance returns 402": (r) => r.status === 402,
  });
}

export function noChatPermissionGate() {
  if (!NO_CHAT_KEY) {
    return;
  }

  const res = http.post(
    `${BASE_URL}/api/v1/chat/completions`,
    JSON.stringify({
      model: CHAT_MODEL,
      messages: [{ role: "user", content: "Reply with OK only." }],
    }),
    {
      headers: jsonHeaders({
        Authorization: `Bearer ${NO_CHAT_KEY}`,
      }),
      tags: { scenario: "no_chat_permission_gate" },
    },
  );

  check(res, {
    "no chat permission returns 403": (r) => r.status === 403,
  });
}

export function realChat() {
  if (!REAL_CHAT_KEY) {
    return;
  }

  const res = http.post(
    `${BASE_URL}/api/v1/chat/completions`,
    JSON.stringify({
      model: CHAT_MODEL,
      messages: [{ role: "user", content: "Reply with OK only." }],
    }),
    {
      headers: jsonHeaders({
        Authorization: `Bearer ${REAL_CHAT_KEY}`,
      }),
      tags: { scenario: "real_chat_baseline" },
      timeout: "30s",
    },
  );

  check(res, {
    "real chat is 200": (r) => r.status === 200,
  });
}
