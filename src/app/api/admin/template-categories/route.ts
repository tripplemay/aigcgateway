export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-guard";
import { errorResponse } from "@/lib/api/errors";
import {
  getTemplateCategories,
  setTemplateCategories,
  normalizeCategories,
  type TemplateCategory,
} from "@/lib/template-categories";

export async function GET(request: Request) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  const categories = await getTemplateCategories();
  return NextResponse.json({ data: categories });
}

export async function PUT(request: Request) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "invalid_parameter", "Invalid JSON body");
  }

  if (!body || typeof body !== "object" || !Array.isArray((body as { categories?: unknown }).categories)) {
    return errorResponse(400, "invalid_parameter", "Body must be { categories: [...] }");
  }

  const incoming = (body as { categories: unknown[] }).categories;
  const normalized = normalizeCategories(incoming);

  if (normalized.length === 0) {
    return errorResponse(400, "invalid_parameter", "At least one valid category is required");
  }

  const hasOther = normalized.some((c: TemplateCategory) => c.id === "other");
  if (!hasOther) {
    return errorResponse(400, "invalid_parameter", "The 'other' fallback category is required");
  }

  const saved = await setTemplateCategories(normalized);
  return NextResponse.json({ data: saved });
}
