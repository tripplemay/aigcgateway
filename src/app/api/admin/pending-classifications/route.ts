export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/api/admin-guard";

// F-AO2-07: list every PENDING classifier suggestion so the operations
// panel can render a review queue. Only returns rows the admin still
// needs to act on — approved / rejected entries stay in the DB for
// audit history but are filtered out here.
export async function GET(request: Request) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  const rows = await prisma.pendingClassification.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "desc" },
    include: {
      model: { select: { id: true, name: true, displayName: true, modality: true } },
    },
  });

  return NextResponse.json({ data: rows });
}
