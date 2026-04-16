"use client";

import { useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useProject } from "@/hooks/use-project";
import { useAsyncData } from "@/hooks/use-async-data";
import { Skeleton } from "@/components/ui/skeleton";
import { SearchBar } from "@/components/search-bar";
import { Pagination } from "@/components/pagination";
import { SectionCard } from "@/components/section-card";
import { StatusChip } from "@/components/status-chip";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { TemplateDetailDrawer } from "./template-detail-drawer";
import { ForkConfirmDialog } from "./fork-confirm-dialog";
import { RateTemplateDialog } from "./rate-template-dialog";

// ============================================================
// Types
// ============================================================

export interface PublicTemplate {
  id: string;
  name: string;
  description: string | null;
  stepCount: number;
  executionMode: string;
  qualityScore: number | null;
  forkCount: number;
  updatedAt: string;
  category: string | null;
  categoryIcon: string;
  averageScore: number;
  ratingCount: number;
}

export interface PublicTemplateDetail {
  id: string;
  name: string;
  description: string | null;
  qualityScore: number | null;
  forkCount: number;
  executionMode: string;
  updatedAt: string;
  category?: string | null;
  categoryIcon?: string;
  averageScore?: number;
  ratingCount?: number;
  steps: {
    id: string;
    order: number;
    role: string;
    actionId: string;
    actionName: string;
    actionModel: string;
    actionDescription: string | null;
  }[];
}

interface PublicTemplatesResponse {
  data: PublicTemplate[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

interface TemplateCategory {
  id: string;
  label: string;
  labelEn: string;
  icon: string;
}

type SortKey = "recommended" | "popular" | "top_rated" | "latest";

const PAGE_SIZE = 20;

const SORT_KEYS: SortKey[] = ["recommended", "popular", "top_rated", "latest"];

// ============================================================
// Component
// ============================================================

export function GlobalLibrary() {
  const t = useTranslations("templates");
  const locale = useLocale();
  const { current } = useProject();
  const router = useRouter();

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortKey>("recommended");
  const [categories, setCategories] = useState<TemplateCategory[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [forkTarget, setForkTarget] = useState<PublicTemplateDetail | null>(null);
  const [forking, setForking] = useState(false);
  const [ratingTarget, setRatingTarget] = useState<{
    sourceTemplateId: string;
    sourceName: string;
    newTemplateId: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ data: TemplateCategory[] }>("/api/template-categories")
      .then((res) => {
        if (!cancelled) setCategories(res.data);
      })
      .catch(() => {
        if (!cancelled) setCategories([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const { data: result, loading } = useAsyncData<PublicTemplatesResponse>(async () => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (search) params.set("search", search);
    if (category !== "all") params.set("category", category);
    params.set("sort_by", sortBy);
    return apiFetch<PublicTemplatesResponse>(`/api/templates/public?${params}`);
  }, [page, search, category, sortBy]);

  const templates = result?.data ?? [];
  const totalPages = result?.pagination.totalPages ?? 1;
  const total = result?.pagination.total ?? 0;

  const { data: detail } = useAsyncData<PublicTemplateDetail | null>(async () => {
    if (!selectedId) return null;
    return apiFetch<PublicTemplateDetail>(`/api/templates/public/${selectedId}`);
  }, [selectedId]);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const handleCategoryChange = (next: string) => {
    setCategory(next);
    setPage(1);
  };

  const handleSortChange = (next: string | null) => {
    if (!next || !SORT_KEYS.includes(next as SortKey)) return;
    setSortBy(next as SortKey);
    setPage(1);
  };

  const handleFork = async () => {
    if (!current || !forkTarget) return;
    setForking(true);
    try {
      const res = await apiFetch<{ template: { id: string }; message: string }>(
        `/api/projects/${current.id}/templates/fork`,
        { method: "POST", body: JSON.stringify({ sourceTemplateId: forkTarget.id }) },
      );
      toast.success(t("forkSuccess"));
      const sourceId = forkTarget.id;
      const sourceName = forkTarget.name;
      setForkTarget(null);
      setSelectedId(null);
      setRatingTarget({
        sourceTemplateId: sourceId,
        sourceName,
        newTemplateId: res.template.id,
      });
    } catch {
      toast.error(t("forkError"));
    } finally {
      setForking(false);
    }
  };

  const handleRatingDialogChange = (open: boolean) => {
    if (open || !ratingTarget) return;
    const destinationId = ratingTarget.newTemplateId;
    setRatingTarget(null);
    router.push(`/templates/${destinationId}`);
  };

  const categoryLabel = (cat: TemplateCategory) => (locale === "zh-CN" ? cat.label : cat.labelEn);

  const handleTestClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    toast.info(t("testForkRequiredDesc"));
  };

  const ratingBadge = (avg: number, count: number) => {
    if (count <= 0) {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-ds-on-surface-variant">
          <span className="material-symbols-outlined text-sm">star_border</span>
          {t("noRatings")}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-ds-tertiary">
        <span
          className="material-symbols-outlined text-sm"
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          star
        </span>
        {avg.toFixed(1)} ({count})
      </span>
    );
  };

  const categoryBadge = (cat: string | null, icon: string) => {
    if (!cat) return null;
    const match = categories.find((c) => c.id === cat);
    const label = match ? categoryLabel(match) : cat;
    return (
      <StatusChip variant="info">
        <span className="material-symbols-outlined text-[10px] mr-0.5">{icon}</span>
        {label}
      </StatusChip>
    );
  };

  const modeBadge = (mode: string) => {
    const labels: Record<string, string> = {
      sequential: t("modeSequential"),
      "fan-out": t("modeFanout"),
      single: t("modeSingle"),
    };
    return <StatusChip variant="neutral">{labels[mode] ?? mode}</StatusChip>;
  };

  // ── Loading ──
  if (loading && templates.length === 0) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-48 rounded-2xl" />
        ))}
      </div>
    );
  }

  const pillTabClass = (active: boolean) =>
    cn(
      "inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold font-[var(--font-heading)] transition-all",
      active
        ? "bg-ds-surface-container-lowest shadow-sm text-ds-primary"
        : "text-ds-on-surface-variant hover:text-ds-on-surface",
    );

  return (
    <>
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex justify-between items-end flex-wrap gap-4">
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight text-ds-on-surface font-[var(--font-heading)]">
              {t("globalLibrary")}
            </h1>
            <p className="text-ds-on-surface-variant mt-2 text-lg">{t("globalLibrarySubtitle")}</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <Select value={sortBy} onValueChange={handleSortChange}>
              <SelectTrigger className="w-[180px]" aria-label={t("sortLabel")}>
                <SelectValue placeholder={t("sortLabel")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recommended">{t("sortRecommended")}</SelectItem>
                <SelectItem value="popular">{t("sortPopular")}</SelectItem>
                <SelectItem value="top_rated">{t("sortTopRated")}</SelectItem>
                <SelectItem value="latest">{t("sortLatest")}</SelectItem>
              </SelectContent>
            </Select>
            <SearchBar
              placeholder={t("searchPlaceholder")}
              value={search}
              onChange={handleSearchChange}
              className="w-full max-w-sm"
            />
          </div>
        </div>

        <div
          className="flex gap-1 bg-ds-surface-container-low rounded-xl p-1 w-fit flex-wrap"
          role="tablist"
          aria-label={t("categoryTabs")}
        >
          <button
            type="button"
            role="tab"
            aria-selected={category === "all"}
            onClick={() => handleCategoryChange("all")}
            className={pillTabClass(category === "all")}
          >
            <span className="material-symbols-outlined text-base">apps</span>
            {t("categoryAll")}
          </button>
          {categories.map((cat) => {
            const active = category === cat.id;
            return (
              <button
                type="button"
                key={cat.id}
                role="tab"
                aria-selected={active}
                onClick={() => handleCategoryChange(cat.id)}
                className={pillTabClass(active)}
              >
                <span className="material-symbols-outlined text-base">{cat.icon}</span>
                {categoryLabel(cat)}
              </button>
            );
          })}
        </div>

        {templates.length === 0 ? (
          <SectionCard>
            <div className="flex flex-col items-center justify-center py-16">
              <div className="w-16 h-16 rounded-2xl bg-ds-surface-container-high flex items-center justify-center mb-6">
                <span className="material-symbols-outlined text-3xl text-ds-outline">public</span>
              </div>
              <h2 className="text-xl font-bold font-[var(--font-heading)] mb-2">
                {t("noPublicTemplates")}
              </h2>
              <p className="text-sm text-ds-on-surface-variant">{t("noPublicTemplatesDesc")}</p>
            </div>
          </SectionCard>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {templates.map((tpl) => (
              <SectionCard
                key={tpl.id}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedId(tpl.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedId(tpl.id);
                  }
                }}
                className="cursor-pointer transition-shadow hover:shadow-xl group"
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex-1 min-w-0">
                    {categoryBadge(tpl.category, tpl.categoryIcon)}
                    <h3 className="mt-2 text-xl font-bold font-[var(--font-heading)] text-ds-on-surface group-hover:text-ds-primary transition-colors line-clamp-2">
                      {tpl.name}
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={handleTestClick}
                    title={t("testForkRequiredTitle")}
                    aria-label={t("test")}
                    className="inline-flex items-center justify-center size-8 rounded-lg text-ds-on-surface-variant hover:bg-ds-primary/10 hover:text-ds-primary transition-colors flex-shrink-0"
                  >
                    <span className="material-symbols-outlined text-lg">science</span>
                  </button>
                </div>
                <p className="text-ds-on-surface-variant text-sm line-clamp-2 mb-6">
                  {tpl.description || "\u2014"}
                </p>
                <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-ds-outline-variant/10">
                  <div className="flex items-center gap-1 text-[11px] font-semibold text-ds-on-surface-variant">
                    <span className="material-symbols-outlined text-sm">reorder</span>
                    {tpl.stepCount} {t("stepsUnit")}
                  </div>
                  {modeBadge(tpl.executionMode)}
                  {ratingBadge(tpl.averageScore, tpl.ratingCount)}
                  <div className="ml-auto flex items-center gap-1 text-[11px] font-bold text-ds-primary">
                    <span
                      className="material-symbols-outlined text-sm"
                      style={{ fontVariationSettings: "'FILL' 1" }}
                    >
                      fork_right
                    </span>
                    {tpl.forkCount} {t("forksUnit")}
                  </div>
                </div>
              </SectionCard>
            ))}
          </div>
        )}

        {total > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
            <SectionCard className="min-h-[160px] flex flex-col justify-between">
              <span className="text-xs font-bold uppercase tracking-widest text-ds-on-surface-variant">
                {t("publicTemplates")}
              </span>
              <div className="text-5xl font-black text-ds-primary mt-2">{total}</div>
            </SectionCard>
            <SectionCard className="min-h-[160px] flex flex-col justify-between">
              <div className="flex justify-between items-start">
                <span className="text-xs font-bold uppercase tracking-widest text-ds-on-surface-variant">
                  {t("mostPopular")}
                </span>
                <span className="material-symbols-outlined text-ds-tertiary">trending_up</span>
              </div>
              {templates[0] && (
                <div>
                  <div className="text-xl font-bold text-ds-on-surface">{templates[0].name}</div>
                  <div className="text-sm font-bold text-ds-secondary">
                    {templates[0].forkCount} {t("forksUnit")}
                  </div>
                </div>
              )}
            </SectionCard>
            <div className="bg-gradient-to-r from-ds-primary to-ds-primary-container p-8 rounded-2xl flex flex-col justify-between min-h-[160px] shadow-xl shadow-ds-primary/10">
              <span className="text-xs font-bold uppercase tracking-widest text-white/70">
                {t("ctaTitle")}
              </span>
              <div className="flex items-center justify-between text-white">
                <div className="text-xl font-bold">{t("ctaDesc")}</div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-white hover:bg-white/10"
                  aria-label={t("ctaTitle")}
                >
                  <span className="material-symbols-outlined">arrow_forward</span>
                </Button>
              </div>
            </div>
          </div>
        )}

        {total > PAGE_SIZE && (
          <Pagination
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
            total={total}
            pageSize={PAGE_SIZE}
            className="flex justify-center pt-4"
          />
        )}
      </div>

      <TemplateDetailDrawer
        open={!!selectedId && !!detail}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
        template={detail}
        onFork={() => {
          if (detail) setForkTarget(detail);
        }}
      />

      <ForkConfirmDialog
        open={!!forkTarget}
        onOpenChange={(open) => {
          if (!open) setForkTarget(null);
        }}
        template={forkTarget}
        loading={forking}
        onConfirm={handleFork}
      />

      <RateTemplateDialog
        open={!!ratingTarget}
        onOpenChange={handleRatingDialogChange}
        templateId={ratingTarget?.sourceTemplateId ?? null}
        templateName={ratingTarget?.sourceName ?? ""}
      />
    </>
  );
}
