export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-guard";
import { ZodError } from "zod";
import type { Prisma } from "@prisma/client";
import {
  providerConfigUpdateSchema,
  zodErrorResponse,
  mapJsonNulls,
  PROVIDER_CONFIG_JSON_FIELDS,
} from "@/lib/api/admin-schemas";

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  const config = await prisma.providerConfig.findUnique({
    where: { providerId: params.id },
  });

  return NextResponse.json({ data: config });
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  const body = await request.json();

  // F-IG-01: strict zod whitelist blocks mass assignment of `id`, sibling
  // `apiKey`, etc. Unknown fields trigger a ZodError → 400.
  let data;
  try {
    data = providerConfigUpdateSchema.parse(body);
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err);
    throw err;
  }

  // Prisma's nullable-JSON inputs need Prisma.JsonNull for explicit null;
  // mapJsonNulls rewrites the bare-null "clear this field" signal accordingly.
  const prismaData = mapJsonNulls(data, PROVIDER_CONFIG_JSON_FIELDS);

  const config = await prisma.providerConfig.upsert({
    where: { providerId: params.id },
    update: prismaData as Prisma.ProviderConfigUpdateInput,
    create: {
      providerId: params.id,
      ...prismaData,
    } as Prisma.ProviderConfigUncheckedCreateInput,
  });

  return NextResponse.json({ data: config });
}
