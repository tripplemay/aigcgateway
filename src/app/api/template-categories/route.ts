export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { verifyJwt } from "@/lib/api/jwt-middleware";
import { getTemplateCategories } from "@/lib/template-categories";

export async function GET(request: Request) {
  const auth = verifyJwt(request);
  if (!auth.ok) return auth.error;

  const categories = await getTemplateCategories();
  return NextResponse.json({ data: categories });
}
