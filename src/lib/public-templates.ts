import { prisma } from "@/lib/prisma";
import { getTemplateCategories, getCategoryIcon } from "@/lib/template-categories";

export type PublicTemplateSort = "recommended" | "popular" | "top_rated" | "latest";

export const PUBLIC_TEMPLATE_SORT_VALUES: PublicTemplateSort[] = [
  "recommended",
  "popular",
  "top_rated",
  "latest",
];

export interface PublicTemplateDto {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  categoryIcon: string;
  averageScore: number;
  ratingCount: number;
  forkCount: number;
  stepCount: number;
  executionMode: "single" | "sequential" | "fan-out";
  updatedAt: Date;
}

export interface ListPublicTemplatesParams {
  search?: string;
  category?: string;
  sortBy?: PublicTemplateSort;
  page?: number;
  pageSize?: number;
}

export interface ListPublicTemplatesResult {
  templates: PublicTemplateDto[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

export function normalizeSortBy(raw: string | null | undefined): PublicTemplateSort {
  if (raw && (PUBLIC_TEMPLATE_SORT_VALUES as string[]).includes(raw)) {
    return raw as PublicTemplateSort;
  }
  return "recommended";
}

function inferExecutionMode(steps: { role: string }[]): "single" | "sequential" | "fan-out" {
  if (steps.length <= 1) return "single";
  if (steps.some((s) => s.role === "SPLITTER")) return "fan-out";
  return "sequential";
}

function computeRecommendedScore(averageScore: number, forkCount: number): number {
  return averageScore * 0.7 + Math.log2(forkCount + 1) * 0.3;
}

export async function listPublicTemplates(
  params: ListPublicTemplatesParams,
): Promise<ListPublicTemplatesResult> {
  const search = params.search?.trim() ?? "";
  const category = params.category?.trim() ?? "";
  const sortBy = normalizeSortBy(params.sortBy);
  const page = Math.max(1, Math.trunc(params.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Math.trunc(params.pageSize ?? 20)));

  const where: Record<string, unknown> = { isPublic: true };
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { description: { contains: search, mode: "insensitive" } },
    ];
  }
  if (category) {
    where.category = category;
  }

  const rows = await prisma.template.findMany({
    where,
    select: {
      id: true,
      name: true,
      description: true,
      category: true,
      ratingCount: true,
      ratingSum: true,
      updatedAt: true,
      steps: { orderBy: { order: "asc" }, select: { role: true } },
      _count: { select: { forks: true } },
    },
  });

  const cats = await getTemplateCategories();

  const mapped: PublicTemplateDto[] = rows.map((t) => {
    const averageScore = t.ratingCount > 0 ? t.ratingSum / t.ratingCount : 0;
    return {
      id: t.id,
      name: t.name,
      description: t.description,
      category: t.category,
      categoryIcon: getCategoryIcon(cats, t.category),
      averageScore,
      ratingCount: t.ratingCount,
      forkCount: t._count.forks,
      stepCount: t.steps.length,
      executionMode: inferExecutionMode(t.steps),
      updatedAt: t.updatedAt,
    };
  });

  const sorted = sortTemplates(mapped, sortBy);

  const total = sorted.length;
  const start = (page - 1) * pageSize;
  const paged = sorted.slice(start, start + pageSize);

  return {
    templates: paged,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  };
}

function sortTemplates(items: PublicTemplateDto[], sortBy: PublicTemplateSort): PublicTemplateDto[] {
  const arr = [...items];
  switch (sortBy) {
    case "popular":
      return arr.sort(
        (a, b) => b.forkCount - a.forkCount || b.updatedAt.getTime() - a.updatedAt.getTime(),
      );
    case "top_rated":
      return arr.sort((a, b) => {
        const aScored = a.ratingCount > 0 ? 1 : 0;
        const bScored = b.ratingCount > 0 ? 1 : 0;
        if (aScored !== bScored) return bScored - aScored;
        if (b.averageScore !== a.averageScore) return b.averageScore - a.averageScore;
        return b.updatedAt.getTime() - a.updatedAt.getTime();
      });
    case "latest":
      return arr.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    case "recommended":
    default:
      return arr.sort((a, b) => {
        const sa = computeRecommendedScore(a.averageScore, a.forkCount);
        const sb = computeRecommendedScore(b.averageScore, b.forkCount);
        if (sb !== sa) return sb - sa;
        return b.updatedAt.getTime() - a.updatedAt.getTime();
      });
  }
}
