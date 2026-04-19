import http from "node:http";
import { prisma } from "../../src/lib/prisma";
import { sendNotification } from "../../src/lib/notifications/dispatcher";
import { sendAlert } from "../../src/lib/health/alert";
import { OpenAICompatEngine } from "../../src/lib/engine/openai-compat";
import { fetchWithTimeout } from "../../src/lib/infra/fetch-with-timeout";

type ProbeResult = {
  name: string;
  pass: boolean;
  detail: string;
  elapsedMs?: number;
};

function now() {
  return Date.now();
}

async function waitUntil(check: () => boolean, timeoutMs: number, intervalMs = 100): Promise<boolean> {
  const start = now();
  while (now() - start < timeoutMs) {
    if (check()) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

async function main() {
  const requests: Array<{ url: string; method: string; closedAt?: number; startedAt: number }> = [];
  const sockets = new Set<import("node:net").Socket>();

  const server = http.createServer((req, res) => {
    const item = {
      url: req.url ?? "",
      method: req.method ?? "GET",
      startedAt: now(),
    };
    requests.push(item);

    req.on("close", () => {
      item.closedAt = now();
    });

    if (req.url === "/stream-hang") {
      res.writeHead(200, {
        "content-type": "text/event-stream",
        connection: "keep-alive",
        "cache-control": "no-cache",
      });
      // send headers only, keep body hanging
      return;
    }

    if (req.url === "/stream-one-chunk") {
      res.writeHead(200, {
        "content-type": "text/event-stream",
        connection: "keep-alive",
        "cache-control": "no-cache",
      });
      res.write('data: {"id":"x","choices":[{"delta":{"content":"hi"}}]}\n\n');
      return;
    }

    // default hang endpoint
    res.writeHead(200, { "content-type": "application/json", connection: "keep-alive" });
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(32123, "127.0.0.1", () => resolve());
  });

  const base = "http://127.0.0.1:32123";
  const results: ProbeResult[] = [];

  try {
    const user = await prisma.user.findFirst({ where: { email: "admin@aigc-gateway.local" } });
    if (!user) throw new Error("seed admin user not found");

    await prisma.notificationPreference.upsert({
      where: {
        userId_eventType: {
          userId: user.id,
          eventType: "BALANCE_LOW",
        },
      },
      update: {
        enabled: true,
        channels: ["webhook"],
        webhookUrl: `${base}/hang`,
        webhookSecret: "probe",
      },
      create: {
        userId: user.id,
        eventType: "BALANCE_LOW",
        enabled: true,
        channels: ["webhook"],
        webhookUrl: `${base}/hang`,
        webhookSecret: "probe",
      },
    });

    const d0 = now();
    await sendNotification(
      user.id,
      "BALANCE_LOW",
      { probe: true, ts: new Date().toISOString() },
      undefined,
      {
        fetchImpl: ((input: RequestInfo | URL, init?: RequestInit) =>
          fetchWithTimeout(String(input), {
            ...(init ?? {}),
            timeoutMs: 10_000,
          })) as typeof fetch,
        backoffMs: [],
      },
    );
    const dispatcherClosed = await waitUntil(
      () => requests.some((r) => r.url === "/hang" && typeof r.closedAt === "number"),
      13_500,
      100,
    );
    const dispatcherElapsed = now() - d0;
    results.push({
      name: "dispatcher-webhook-timeout-10s",
      pass: dispatcherClosed,
      detail: dispatcherClosed
        ? "webhook hanging connection closed automatically (timeout path executed)"
        : "no closed hanging webhook connection observed within 13.5s",
      elapsedMs: dispatcherElapsed,
    });

    process.env.ALERT_WEBHOOK_URL = `${base}/alert-hang`;
    const h0 = now();
    await sendAlert({
      event: "channel_status_changed",
      channelId: "probe-channel",
      providerName: "probe-provider",
      modelName: "probe-model",
      oldStatus: "ACTIVE",
      newStatus: "ERROR",
      errorMessage: "probe",
      timestamp: new Date().toISOString(),
    });
    const hElapsed = now() - h0;
    results.push({
      name: "health-alert-timeout-10s",
      pass: hElapsed >= 9_500 && hElapsed <= 13_500,
      detail: `sendAlert returned in ${hElapsed}ms (expected ~10s timeout window)`,
      elapsedMs: hElapsed,
    });

    const engine = new OpenAICompatEngine();
    const route: any = {
      provider: {
        id: "p1",
        name: "probe",
        baseUrl: base,
        authConfig: { apiKey: "x" },
        proxyUrl: null,
      },
      config: { chatEndpoint: "/stream-hang", imageEndpoint: "/images" },
      channel: { realModelId: "gpt-probe" },
      model: { name: "gpt-probe" },
      alias: null,
    };

    const originalSetTimeout = globalThis.setTimeout;
    (globalThis as any).setTimeout = ((fn: (...args: any[]) => void, _ms?: number, ...args: any[]) =>
      originalSetTimeout(fn, 80, ...args)) as typeof setTimeout;

    let streamTimeoutPass = false;
    const s0 = now();
    try {
      const stream = await engine.chatCompletionsStream(
        {
          model: "gpt-probe",
          messages: [{ role: "user", content: "hello" }],
          stream: true,
        } as any,
        route,
      );
      const reader = stream.getReader();
      await Promise.race([
        reader.read().then(() => {
          throw new Error("stream_read_returned_without_abort");
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("stream_read_no_abort_within_guard")), 1_500),
        ),
      ]);
    } catch (err) {
      const elapsed = now() - s0;
      streamTimeoutPass =
        elapsed < 2_000 &&
        err instanceof Error &&
        err.message !== "stream_read_no_abort_within_guard";
      results.push({
        name: "openai-compat-stream-timeout-after-headers",
        pass: streamTimeoutPass,
        detail: `stream probe finished in ${elapsed}ms, reason=${err instanceof Error ? err.message : String(err)}`,
        elapsedMs: elapsed,
      });
    } finally {
      (globalThis as any).setTimeout = originalSetTimeout;
    }

    const route2: any = {
      ...route,
      config: { chatEndpoint: "/stream-one-chunk", imageEndpoint: "/images" },
    };
    let closeObserved = false;
    const c0 = now();
    const stream2 = await engine.chatCompletionsStream(
      {
        model: "gpt-probe",
        messages: [{ role: "user", content: "hello" }],
        stream: true,
      } as any,
      route2,
    );
    const reader2 = stream2.getReader();
    await reader2.read();
    let cancelError: string | null = null;
    try {
      await reader2.cancel("client_abort");
    } catch (err) {
      cancelError = err instanceof Error ? err.message : String(err);
    }
    closeObserved = await waitUntil(
      () => requests.some((r) => r.url === "/stream-one-chunk" && typeof r.closedAt === "number"),
      2_000,
      50,
    );
    results.push({
      name: "stream-cancel-propagates-upstream",
      pass: closeObserved && cancelError === null,
      detail:
        closeObserved && cancelError === null
          ? "upstream request closed after downstream reader.cancel"
          : `closeObserved=${closeObserved}, cancelError=${cancelError ?? "none"}`,
      elapsedMs: now() - c0,
    });

    const output = {
      generatedAt: new Date().toISOString(),
      results,
      requestSamples: requests.map((r) => ({
        url: r.url,
        method: r.method,
        startedAt: r.startedAt,
        closedAt: r.closedAt ?? null,
      })),
    };

    console.log(JSON.stringify(output, null, 2));
  } finally {
    for (const s of sockets) {
      s.destroy();
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
