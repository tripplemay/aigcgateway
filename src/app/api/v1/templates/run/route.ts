export const dynamic = "force-dynamic";

/**
 * POST /v1/templates/run
 *
 * 运行 Template：API Key 鉴权 → 余额检查 → 限流 → 自动判断执行模式
 */

import { prisma } from "@/lib/prisma";
import { authenticateApiKey, type ApiKeyPermissions } from "@/lib/api/auth-middleware";
import { checkBalance } from "@/lib/api/balance-middleware";
import { checkRateLimit } from "@/lib/api/rate-limit";
import { errorResponse } from "@/lib/api/errors";
import { sseResponse, generateTraceId } from "@/lib/api/response";
import { InjectionError } from "@/lib/action/runner";
import { runSequential } from "@/lib/template/sequential";
import { runFanout } from "@/lib/template/fanout";

export async function POST(request: Request) {
  // 1. Auth
  const auth = await authenticateApiKey(request);
  if (!auth.ok) return auth.error;
  const { user, project, apiKey } = auth.ctx;
  if (!project) {
    return errorResponse(
      400,
      "project_required",
      "A project context is required. Set X-Project-Id header or configure a default project.",
    );
  }

  // 1b. Explicit chatCompletion permission check (defense-in-depth)
  const perms = (apiKey.permissions ?? {}) as Partial<ApiKeyPermissions>;
  if (perms.chatCompletion === false) {
    return errorResponse(403, "forbidden", "API key lacks chatCompletion permission");
  }

  // 2. Balance
  const balanceCheck = checkBalance(user);
  if (!balanceCheck.ok) return balanceCheck.error;

  // 3. Parse body
  let body: {
    template_id: string;
    variables?: Record<string, string>;
    stream?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "invalid_parameter", "Invalid JSON body");
  }

  if (!body.template_id) {
    return errorResponse(400, "invalid_parameter", "template_id is required");
  }

  // 4. Rate limit
  const rateCheck = await checkRateLimit(project, "text", apiKey.rateLimit);
  if (!rateCheck.ok) return rateCheck.error;

  // 5. Determine execution mode
  const template = await prisma.template.findFirst({
    where: { id: body.template_id, projectId: project.id },
    include: { steps: { orderBy: { order: "asc" } } },
  });
  if (!template) return errorResponse(404, "not_found", "Template not found");

  const hasSplitter = template.steps.some((s) => s.role === "SPLITTER");

  const params = {
    templateId: body.template_id,
    projectId: project.id,
    userId: user.id,
    variables: body.variables || {},
    source: "api",
  };

  // 6. Non-stream mode
  if (body.stream === false) {
    try {
      const collected: string[] = [];
      const collectWriter = (data: string) => {
        collected.push(data);
      };

      const result = hasSplitter
        ? await runFanout(params, collectWriter)
        : await runSequential(params, collectWriter);

      // Extract step details from collected events
      const steps = collected
        .map((d) => {
          try {
            return JSON.parse(d);
          } catch {
            return null;
          }
        })
        .filter((e) => e?.type === "step_end" || e?.type === "branch_end");

      return Response.json({
        output: result.output,
        total_steps: result.totalSteps,
        steps,
      });
    } catch (err) {
      if (err instanceof InjectionError) {
        return errorResponse(err.status, "template_error", err.message);
      }
      return errorResponse(500, "internal_error", (err as Error).message);
    }
  }

  // 7. Stream mode (default)
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        if (hasSplitter) {
          await runFanout(params, (data) => {
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          });
        } else {
          await runSequential(params, (data) => {
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          });
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (err) {
        if (!controller.desiredSize) return;
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "error", message: (err as Error).message })}\n\n`,
          ),
        );
        controller.close();
      }
    },
  });

  return sseResponse(stream, generateTraceId());
}
