export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { verifyJwt } from "@/lib/api/jwt-middleware";
import { listPublicTemplates, normalizeSortBy } from "@/lib/public-templates";

// GET /api/templates/public — 公共模板列表（支持 category + sort_by 参数）
export async function GET(request: Request) {
  const auth = verifyJwt(request);
  if (!auth.ok) return auth.error;

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") || undefined;
  const category = searchParams.get("category") || undefined;
  const sortParam = searchParams.get("sort_by") ?? searchParams.get("sort");
  const sortBy = normalizeSortBy(sortParam);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "20")));

  const { templates, pagination } = await listPublicTemplates({
    search,
    category,
    sortBy,
    page,
    pageSize,
  });

  const data = templates.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    category: t.category,
    categoryIcon: t.categoryIcon,
    averageScore: t.averageScore,
    ratingCount: t.ratingCount,
    forkCount: t.forkCount,
    stepCount: t.stepCount,
    executionMode: t.executionMode,
    updatedAt: t.updatedAt,
  }));

  return NextResponse.json({
    data,
    pagination,
    meta: { sortBy, category: category ?? null },
  });
}
