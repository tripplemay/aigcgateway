export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { verifyJwt } from "@/lib/api/jwt-middleware";
import { errorResponse } from "@/lib/api/errors";
import { runTemplateTest, TemplateTestError } from "@/lib/template/test-runner";

type Params = { params: { templateId: string } };

interface TestRequestBody {
  variables?: Record<string, string>;
  mode?: "dry_run" | "execute";
}

export async function POST(request: Request, { params }: Params) {
  const auth = verifyJwt(request);
  if (!auth.ok) return auth.error;

  let body: TestRequestBody;
  try {
    body = (await request.json()) as TestRequestBody;
  } catch {
    return errorResponse(400, "invalid_parameter", "Invalid JSON body");
  }

  const mode = body.mode;
  if (mode !== "dry_run" && mode !== "execute") {
    return errorResponse(400, "invalid_parameter", "mode must be 'dry_run' or 'execute'");
  }

  const rawVariables = body.variables ?? {};
  if (typeof rawVariables !== "object" || Array.isArray(rawVariables) || rawVariables === null) {
    return errorResponse(400, "invalid_parameter", "variables must be a plain object");
  }
  const variables: Record<string, string> = {};
  for (const [key, value] of Object.entries(rawVariables)) {
    if (typeof value !== "string") {
      return errorResponse(400, "invalid_parameter", `variable '${key}' must be a string`);
    }
    variables[key] = value;
  }

  try {
    const result = await runTemplateTest({
      templateId: params.templateId,
      userId: auth.payload.userId,
      variables,
      mode,
    });
    return NextResponse.json({ data: result });
  } catch (err) {
    if (err instanceof TemplateTestError) {
      return errorResponse(err.status, err.code, err.message);
    }
    console.error("[templates/test] unexpected error:", err);
    return errorResponse(500, "internal_error", (err as Error).message);
  }
}
