import { prisma } from "@/lib/prisma";

export interface TemplateCategory {
  id: string;
  label: string;
  labelEn: string;
  icon: string;
}

export const TEMPLATE_CATEGORIES_KEY = "TEMPLATE_CATEGORIES";

export const DEFAULT_TEMPLATE_CATEGORIES: TemplateCategory[] = [
  { id: "dev-review", label: "开发审查", labelEn: "Dev Review", icon: "code_review" },
  { id: "writing", label: "内容创作", labelEn: "Writing", icon: "edit_note" },
  { id: "translation", label: "翻译", labelEn: "Translation", icon: "translate" },
  { id: "analysis", label: "数据分析", labelEn: "Analysis", icon: "analytics" },
  { id: "customer-service", label: "客服", labelEn: "Customer Service", icon: "support_agent" },
  { id: "other", label: "其他", labelEn: "Other", icon: "category" },
];

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;

export function normalizeCategories(raw: unknown): TemplateCategory[] {
  if (!Array.isArray(raw)) return [...DEFAULT_TEMPLATE_CATEGORIES];
  const seen = new Set<string>();
  const result: TemplateCategory[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const candidate = item as Record<string, unknown>;
    const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
    const label = typeof candidate.label === "string" ? candidate.label.trim() : "";
    const labelEn = typeof candidate.labelEn === "string" ? candidate.labelEn.trim() : "";
    const icon = typeof candidate.icon === "string" ? candidate.icon.trim() : "";
    if (!id || !label || !labelEn || !icon) continue;
    if (!SLUG_PATTERN.test(id)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    result.push({ id, label, labelEn, icon });
  }
  return result.length > 0 ? result : [...DEFAULT_TEMPLATE_CATEGORIES];
}

export async function getTemplateCategories(): Promise<TemplateCategory[]> {
  const row = await prisma.systemConfig.findUnique({ where: { key: TEMPLATE_CATEGORIES_KEY } });
  if (!row) return [...DEFAULT_TEMPLATE_CATEGORIES];
  try {
    const parsed = JSON.parse(row.value);
    return normalizeCategories(parsed);
  } catch {
    return [...DEFAULT_TEMPLATE_CATEGORIES];
  }
}

export async function setTemplateCategories(cats: TemplateCategory[]): Promise<TemplateCategory[]> {
  const normalized = normalizeCategories(cats);
  const value = JSON.stringify(normalized);
  await prisma.systemConfig.upsert({
    where: { key: TEMPLATE_CATEGORIES_KEY },
    update: { value, description: "Public template categories (id/label/labelEn/icon)" },
    create: {
      key: TEMPLATE_CATEGORIES_KEY,
      value,
      description: "Public template categories (id/label/labelEn/icon)",
    },
  });
  return normalized;
}

export function getCategoryIcon(
  cats: TemplateCategory[],
  categoryId: string | null | undefined,
): string {
  if (!categoryId) return "category";
  const match = cats.find((c) => c.id === categoryId);
  return match?.icon ?? "category";
}

export function validateCategoryId(
  cats: TemplateCategory[],
  categoryId: string | null | undefined,
): string {
  if (!categoryId) return "other";
  return cats.some((c) => c.id === categoryId) ? categoryId : "other";
}
