export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-guard";
import { errorResponse } from "@/lib/api/errors";


export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  const body = await request.json();
  const { displayName, baseUrl, authType, apiKey, adapterType, proxyUrl, status, rateLimit } = body;

  const data: Record<string, unknown> = {};
  if (displayName !== undefined) data.displayName = displayName;
  if (baseUrl !== undefined) data.baseUrl = baseUrl;
  if (authType !== undefined) data.authType = authType;
  if (apiKey !== undefined) data.authConfig = { apiKey };
  if (adapterType !== undefined) data.adapterType = adapterType;
  if (proxyUrl !== undefined) data.proxyUrl = proxyUrl;
  if (status !== undefined) data.status = status;
  if (rateLimit !== undefined) data.rateLimit = rateLimit;

  const provider = await prisma.provider.update({
    where: { id: params.id },
    data,
  });

  return NextResponse.json(provider);
}
