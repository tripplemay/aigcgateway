export const dynamic = "force-dynamic";

/**
 * POST /v1/actions/run
 *
 * 运行单个 Action：API Key 鉴权 → 余额检查 → 限流 → ActionRunner
 */

import { authenticateApiKey, type ApiKeyPermissions } from "@/lib/api/auth-middleware";
import { checkBalance } from "@/lib/api/balance-middleware";
import { checkRateLimit, rollbackRateLimit } from "@/lib/api/rate-limit";
import { errorResponse } from "@/lib/api/errors";
import { sseResponse, generateTraceId } from "@/lib/api/response";
import { runAction, runActionNonStream, InjectionError } from "@/lib/action/runner";
import { sanitizeErrorMessage } from "@/lib/engine/types";

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
    action_id: string;
    variables?: Record<string, string>;
    stream?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "invalid_parameter", "Invalid JSON body");
  }

  if (!body.action_id) {
    return errorResponse(400, "invalid_parameter", "action_id is required");
  }

  // 4. Rate limit
  const rateCheck = await checkRateLimit(project, "text", apiKey.rateLimit);
  if (!rateCheck.ok) return rateCheck.error;
  const rlKey = rateCheck.rateLimitKey;
  const rlMember = rateCheck.rateLimitMember;

  const params = {
    actionId: body.action_id,
    projectId: project.id,
    userId: user.id,
    variables: body.variables || {},
    source: "api",
  };

  // 5. Execute
  if (body.stream === false) {
    try {
      const result = await runActionNonStream(params);
      return Response.json({
        output: result.output,
        trace_id: result.traceId,
        usage: result.usage,
      });
    } catch (err) {
      if (rlKey && rlMember) rollbackRateLimit(rlKey, rlMember).catch(() => {});
      if (err instanceof InjectionError) {
        return errorResponse(err.status, "action_error", sanitizeErrorMessage(err.message));
      }
      return errorResponse(500, "internal_error", sanitizeErrorMessage((err as Error).message));
    }
  }

  // Stream mode (default)
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        await runAction(params, (data) => {
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        });
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (err) {
        if (rlKey && rlMember) rollbackRateLimit(rlKey, rlMember).catch(() => {});
        if (!controller.desiredSize) return; // already closed
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "error", message: sanitizeErrorMessage((err as Error).message) })}\n\n`,
          ),
        );
        controller.close();
      }
    },
  });

  return sseResponse(stream, generateTraceId());
}
