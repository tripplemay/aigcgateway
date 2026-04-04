import Module from "node:module";

type CheckResult = {
  level: string;
  result: string;
  latencyMs: number;
  errorMessage: string | null;
  responseBody: string | null;
};

async function testHealthImageStopsAtL2() {
  const originalLoad = (Module as typeof Module & { _load: typeof Module._load })._load;
  let imageCalls = 0;
  let chatCalls = 0;

  (Module as typeof Module & { _load: typeof Module._load })._load = function patched(
    request: string,
    parent: NodeModule | null,
    isMain: boolean,
  ) {
    if (request === "../engine/router") {
      return {
        getAdapterForRoute: () => ({
          chatCompletions: async () => {
            chatCalls++;
            return {};
          },
          imageGenerations: async () => {
            imageCalls++;
            return { created: Math.floor(Date.now() / 1000), data: [{ url: "https://example.com/fake.png" }] };
          },
        }),
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const { runHealthCheck } = await import("../../src/lib/health/checker");
    const route = {
      provider: { name: "openrouter" },
      model: { name: "openrouter/openai/gpt-5-image-mini", modality: "IMAGE" },
    } as Parameters<typeof runHealthCheck>[0];

    const results = (await runHealthCheck(route)) as CheckResult[];
    return {
      pass:
        imageCalls === 1 &&
        chatCalls === 0 &&
        results.length === 2 &&
        results[0]?.level === "CONNECTIVITY" &&
        results[1]?.level === "FORMAT" &&
        !results.some((r) => r.level === "QUALITY"),
      details: { imageCalls, chatCalls, levels: results.map((r) => r.level) },
    };
  } finally {
    (Module as typeof Module & { _load: typeof Module._load })._load = originalLoad;
  }
}

async function testDocEnricherSkipsImageModels() {
  const originalLoad = (Module as typeof Module & { _load: typeof Module._load })._load;
  let deepseekCalls = 0;

  (Module as typeof Module & { _load: typeof Module._load })._load = function patched(
    request: string,
    parent: NodeModule | null,
    isMain: boolean,
  ) {
    if (request === "@/lib/prisma") {
      return {
        prisma: {
          provider: {
            findUnique: async () => ({
              baseUrl: "https://api.deepseek.com",
              authConfig: { apiKey: "test-key" },
              proxyUrl: null,
            }),
          },
        },
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith("https://r.jina.ai/")) {
      return new Response("fake docs ".repeat(200), { status: 200 });
    }
    if (url.includes("/chat/completions")) {
      deepseekCalls++;
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify([{ model_id: "text-new", modality: "text" }]) } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response("unexpected", { status: 500 });
  }) as typeof fetch;

  try {
    const { enrichFromDocs } = await import("../../src/lib/sync/doc-enricher");
    const provider = { name: "openrouter" } as Parameters<typeof enrichFromDocs>[0];
    const config = { docUrls: ["https://docs.example.com/models"] } as Parameters<typeof enrichFromDocs>[1];

    const onlyImages = [
      { modelId: "img-1", name: "provider/img-1", displayName: "img-1", modality: "IMAGE" as const },
      { modelId: "img-2", name: "provider/img-2", displayName: "img-2", modality: "IMAGE" as const },
    ];

    const mixed = [
      { modelId: "img-1", name: "provider/img-1", displayName: "img-1", modality: "IMAGE" as const },
      {
        modelId: "txt-1",
        name: "provider/txt-1",
        displayName: "txt-1",
        modality: "TEXT" as const,
        inputPricePerM: undefined,
        outputPricePerM: undefined,
      },
    ];

    const imagesOnly = await enrichFromDocs(provider, config, onlyImages);
    const mixedResult = await enrichFromDocs(provider, config, mixed);

    return {
      pass:
        imagesOnly.aiEnriched === 0 &&
        imagesOnly.models.length === 2 &&
        deepseekCalls === 1 &&
        mixedResult.models.some((m) => m.modality === "IMAGE"),
      details: {
        deepseekCalls,
        imagesOnlyAiEnriched: imagesOnly.aiEnriched,
        mixedAiEnriched: mixedResult.aiEnriched,
        mixedModels: mixedResult.models.map((m) => ({ name: m.name, modality: m.modality })),
      },
    };
  } finally {
    (Module as typeof Module & { _load: typeof Module._load })._load = originalLoad;
    globalThis.fetch = originalFetch;
  }
}

async function main() {
  const results = {
    healthImageStopsAtL2: await testHealthImageStopsAtL2(),
    docEnricherSkipsImageModels: await testDocEnricherSkipsImageModels(),
  };
  console.log(JSON.stringify(results, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
