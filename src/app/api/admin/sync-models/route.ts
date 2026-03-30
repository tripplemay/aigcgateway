export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-guard";
import { runModelSync } from "@/lib/sync/model-sync";

export async function POST(request: Request) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  const result = await runModelSync();
  return NextResponse.json({ data: result });
}
