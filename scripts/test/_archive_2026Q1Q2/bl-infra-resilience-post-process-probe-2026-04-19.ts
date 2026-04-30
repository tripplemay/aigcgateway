import { prisma } from "../../src/lib/prisma";
import { processChatResult } from "../../src/lib/api/post-process";

async function main() {
  const counters = {
    callLogCreate: 0,
    projectFindUnique: 0,
  };

  const origCallLogCreate = prisma.callLog.create.bind(prisma.callLog);
  const origProjectFindUnique = prisma.project.findUnique.bind(prisma.project);

  (prisma.callLog as any).create = async () => {
    counters.callLogCreate += 1;
    return { id: "mock-call-log" };
  };

  (prisma.project as any).findUnique = async () => {
    counters.projectFindUnique += 1;
    return { id: "proj-1", alertThreshold: 10, rateLimit: null };
  };

  try {
    processChatResult({
      traceId: "trace-probe",
      userId: "user-probe",
      projectId: "proj-1",
      route: {
        channel: {
          id: "ch-1",
          costPrice: { inputPer1M: 0, outputPer1M: 0 },
          sellPrice: { inputPer1M: 0, outputPer1M: 0 },
        },
        model: { capabilities: { reasoning: false } },
        alias: null,
        config: { currency: "USD" },
      } as any,
      modelName: "model-probe",
      promptSnapshot: [{ role: "user", content: "hi" }],
      requestParams: { stream: false },
      startTime: Date.now() - 5,
      response: {
        choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
      } as any,
    });

    await new Promise((r) => setTimeout(r, 250));

    const result = {
      generatedAt: new Date().toISOString(),
      counters,
      pass:
        counters.callLogCreate === 1 &&
        counters.projectFindUnique === 1,
      detail:
        "Single success post-process run should perform exactly one project.findUnique",
    };

    console.log(JSON.stringify(result, null, 2));
  } finally {
    (prisma.callLog as any).create = origCallLogCreate;
    (prisma.project as any).findUnique = origProjectFindUnique;
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
