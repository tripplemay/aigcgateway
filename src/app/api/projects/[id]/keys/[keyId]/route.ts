import { PrismaClient } from "@prisma/client";
import { NextResponse } from "next/server";
import { verifyJwt } from "@/lib/api/jwt-middleware";
import { errorResponse } from "@/lib/api/errors";

const prisma = new PrismaClient();

/** DELETE /api/projects/:id/keys/:keyId — 吊销 Key */
export async function DELETE(
  request: Request,
  { params }: { params: { id: string; keyId: string } },
) {
  const auth = verifyJwt(request);
  if (!auth.ok) return auth.error;

  const project = await prisma.project.findFirst({
    where: { id: params.id, userId: auth.payload.userId },
  });
  if (!project) return errorResponse(404, "not_found", "Project not found");

  const apiKey = await prisma.apiKey.findFirst({
    where: { id: params.keyId, projectId: params.id },
  });
  if (!apiKey) return errorResponse(404, "not_found", "API Key not found");

  if (apiKey.status === "REVOKED") {
    return errorResponse(400, "already_revoked", "API Key is already revoked");
  }

  await prisma.apiKey.update({
    where: { id: params.keyId },
    data: { status: "REVOKED" },
  });

  return NextResponse.json({ message: "API Key revoked" });
}
