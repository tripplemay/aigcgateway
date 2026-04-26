import http from "k6/http";
import { check, sleep } from "k6";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3199";

export const options = {
  scenarios: {
    public_models_smoke: {
      executor: "shared-iterations",
      vus: 2,
      iterations: 20,
      maxDuration: "1m",
      exec: "publicModels",
    },
    public_models_load: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 2 },
        { duration: "1m", target: 10 },
        { duration: "30s", target: 0 },
      ],
      gracefulRampDown: "10s",
      exec: "publicModels",
      startTime: "70s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.001"],
    http_req_duration: ["p(95)<500", "p(99)<1000"],
    checks: ["rate>0.999"],
  },
};

export function publicModels() {
  const res = http.get(`${BASE_URL}/api/v1/models`, {
    tags: { scenario: "public_models" },
  });

  check(res, {
    "models status is 200": (r) => r.status === 200,
    "models payload looks like list": (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.object === "list" && Array.isArray(body.data);
      } catch {
        return false;
      }
    },
  });

  sleep(1);
}
