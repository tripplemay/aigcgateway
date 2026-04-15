export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/api/admin-guard";
import { errorResponse } from "@/lib/api/errors";
import { writeSystemLog } from "@/lib/system-logger";

// F-AO2-07: act on a single pending classification row. Supports three
// actions in a single POST body so the UI can use one endpoint:
//
//   { action: "approve" }                        → attach to suggestedAliasId
//   { action: "reject" }                         → mark REJECTED, no link
//   { action: "reassign", aliasId: "cxxx" }      → attach to a different alias
//
// Every action marks the row reviewed and writes a SystemLog(INFERENCE)
// entry so the admin/logs system-log tab reflects the review trail.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    aliasId?: string;
    note?: string;
  };

  const pending = await prisma.pendingClassification.findUnique({
    where: { id },
    include: { model: { select: { id: true, name: true, modality: true } } },
  });
  if (!pending) return errorResponse(404, "not_found", "Pending entry not found");
  if (pending.status !== "PENDING") {
    return errorResponse(409, "already_reviewed", "This entry has already been reviewed");
  }

  const reviewerEmail = auth.payload.userId;

  if (body.action === "approve") {
    if (!pending.suggestedAliasId) {
      return errorResponse(400, "no_suggestion", "Pending row has no suggestedAliasId to approve");
    }
    await attachAndClose(
      pending.id,
      pending.model.id,
      pending.suggestedAliasId,
      reviewerEmail,
      body.note,
    );
    await writeSystemLog("INFERENCE", "INFO", `approved ${pending.model.name}`, {
      action: "approved",
      pendingId: pending.id,
      modelId: pending.model.id,
      aliasId: pending.suggestedAliasId,
      reviewer: reviewerEmail,
    });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "reject") {
    await prisma.pendingClassification.update({
      where: { id },
      data: {
        status: "REJECTED",
        reviewedAt: new Date(),
        reviewedBy: reviewerEmail,
        reviewNote: body.note ?? null,
      },
    });
    await writeSystemLog("INFERENCE", "INFO", `rejected ${pending.model.name}`, {
      action: "rejected",
      pendingId: pending.id,
      modelId: pending.model.id,
      reviewer: reviewerEmail,
    });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "reassign") {
    if (!body.aliasId) {
      return errorResponse(400, "missing_alias", "aliasId is required for reassign");
    }
    const alias = await prisma.modelAlias.findUnique({
      where: { id: body.aliasId },
      select: { id: true, modality: true },
    });
    if (!alias) return errorResponse(404, "alias_not_found", "Target alias not found");
    if (alias.modality !== pending.model.modality) {
      return errorResponse(
        400,
        "modality_mismatch",
        `Model is ${pending.model.modality} but alias is ${alias.modality}`,
      );
    }
    await attachAndClose(pending.id, pending.model.id, body.aliasId, reviewerEmail, body.note);
    await writeSystemLog("INFERENCE", "INFO", `reassigned ${pending.model.name}`, {
      action: "reassigned",
      pendingId: pending.id,
      modelId: pending.model.id,
      aliasId: body.aliasId,
      reviewer: reviewerEmail,
    });
    return NextResponse.json({ ok: true });
  }

  return errorResponse(400, "invalid_action", "action must be approve|reject|reassign");
}

async function attachAndClose(
  pendingId: string,
  modelId: string,
  aliasId: string,
  reviewer: string,
  note: string | undefined,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.aliasModelLink.findUnique({
      where: { aliasId_modelId: { aliasId, modelId } },
    });
    if (!existing) {
      await tx.aliasModelLink.create({ data: { aliasId, modelId } });
    }
    await tx.model.update({ where: { id: modelId }, data: { enabled: true } });
    await tx.pendingClassification.update({
      where: { id: pendingId },
      data: {
        status: "APPROVED",
        reviewedAt: new Date(),
        reviewedBy: reviewer,
        reviewNote: note ?? null,
      },
    });
  });
}
