/**
 * BL-BILLING-AUDIT-EXT-P2 F-BAP2-03 — 手动重跑某天的对账。
 *
 * POST /api/admin/reconciliation/rerun  body: { date: "YYYY-MM-DD", providerId?: string }
 *
 * 同步执行 runReconciliation()；幂等（spec § 3.3 upsert by unique key），
 * 重跑安全。返回汇总 + 写入行数。
 */
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { requireAdmin } from "@/lib/api/admin-guard";
import { runReconciliation } from "@/lib/billing-audit/reconcile-job";
import { zodErrorResponse } from "@/lib/api/admin-schemas";

const bodySchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    providerId: z.string().optional(),
  })
  .strict();

export async function POST(request: Request) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  let body;
  try {
    body = bodySchema.parse(await request.json());
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err);
    throw err;
  }

  const reportDate = new Date(`${body.date}T00:00:00Z`);
  if (!Number.isFinite(reportDate.getTime())) {
    return NextResponse.json(
      { error: "invalid_parameter", message: "date must be YYYY-MM-DD" },
      { status: 400 },
    );
  }

  const result = await runReconciliation(
    reportDate,
    body.providerId ? { providerId: body.providerId } : undefined,
  );

  return NextResponse.json({
    reportDate: result.reportDate.toISOString().slice(0, 10),
    providersInspected: result.providersInspected,
    rowsWritten: result.rowsWritten,
    bigDiffs: result.bigDiffs,
  });
}
