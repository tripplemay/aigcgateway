import http from "k6/http";
import { check, sleep } from "k6";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3099";
const ADMIN_TOKEN = __ENV.ADMIN_TOKEN || "";

export const options = {
  scenarios: {
    sync_status_read: {
      executor: "shared-iterations",
      vus: 5,
      iterations: 50,
      exec: "syncStatus",
    },
    channels_read: {
      executor: "shared-iterations",
      vus: 5,
      iterations: 50,
      startTime: "40s",
      exec: "channels",
    },
    users_read: {
      executor: "shared-iterations",
      vus: 5,
      iterations: 50,
      startTime: "80s",
      exec: "users",
    },
    sync_trigger_smoke: {
      executor: "shared-iterations",
      vus: 1,
      iterations: 1,
      startTime: "120s",
      exec: "syncModels",
    },
  },
  thresholds: {
    "http_req_duration{scenario:sync_status}": ["p(95)<500"],
    "http_req_duration{scenario:channels}": ["p(95)<800"],
    "http_req_duration{scenario:users}": ["p(95)<800"],
    "http_req_duration{scenario:sync_trigger}": ["p(95)<5000"],
    http_req_failed: ["rate<0.01"],
  },
};

function authHeaders() {
  return {
    Authorization: `Bearer ${ADMIN_TOKEN}`,
  };
}

export function syncStatus() {
  if (!ADMIN_TOKEN) {
    return;
  }

  const res = http.get(`${BASE_URL}/api/admin/sync-status`, {
    headers: authHeaders(),
    tags: { scenario: "sync_status" },
  });

  check(res, {
    "sync status 200": (r) => r.status === 200,
  });

  sleep(1);
}

export function channels() {
  if (!ADMIN_TOKEN) {
    return;
  }

  const res = http.get(`${BASE_URL}/api/admin/channels`, {
    headers: authHeaders(),
    tags: { scenario: "channels" },
  });

  check(res, {
    "channels 200": (r) => r.status === 200,
  });

  sleep(1);
}

export function users() {
  if (!ADMIN_TOKEN) {
    return;
  }

  const res = http.get(`${BASE_URL}/api/admin/users?page=1&pageSize=20`, {
    headers: authHeaders(),
    tags: { scenario: "users" },
  });

  check(res, {
    "users 200": (r) => r.status === 200,
  });

  sleep(1);
}

export function syncModels() {
  if (!ADMIN_TOKEN) {
    return;
  }

  const res = http.post(`${BASE_URL}/api/admin/sync-models`, null, {
    headers: authHeaders(),
    tags: { scenario: "sync_trigger" },
    timeout: "60s",
  });

  check(res, {
    "sync trigger accepted": (r) => r.status >= 200 && r.status < 300,
  });
}
