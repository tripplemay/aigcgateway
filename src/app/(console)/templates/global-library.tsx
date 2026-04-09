"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useProject } from "@/hooks/use-project";
import { useAsyncData } from "@/hooks/use-async-data";
import { Skeleton } from "@/components/ui/skeleton";
import { SearchBar } from "@/components/search-bar";
import { Pagination } from "@/components/pagination";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { TemplateDetailDrawer } from "./template-detail-drawer";
import { ForkConfirmDialog } from "./fork-confirm-dialog";

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
}

export interface PublicTemplateDetail {
  id: string;
  name: string;
  description: string | null;
  qualityScore: number | null;
  forkCount: number;
  executionMode: string;
  updatedAt: string;
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

const PAGE_SIZE = 20;

const MODE_STYLE: Record<string, string> = {
  sequential: "bg-ds-surface-container-high text-ds-on-surface-variant",
  "fan-out": "bg-ds-surface-container-high text-ds-on-surface-variant",
  single: "bg-ds-surface-container-high text-ds-on-surface-variant",
};

// ============================================================
// Component
// ============================================================

export function GlobalLibrary() {
  const t = useTranslations("templates");
  const tc = useTranslations("common");
  const locale = useLocale();
  const { current } = useProject();
  const router = useRouter();

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [forkTarget, setForkTarget] = useState<PublicTemplateDetail | null>(null);
  const [forking, setForking] = useState(false);

  // ── List data ──
  const { data: result, loading } = useAsyncData<PublicTemplatesResponse>(async () => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (search) params.set("search", search);
    return apiFetch<PublicTemplatesResponse>(`/api/templates/public?${params}`);
  }, [page, search]);

  const templates = result?.data ?? [];
  const totalPages = result?.pagination.totalPages ?? 1;
  const total = result?.pagination.total ?? 0;

  // ── Detail data ──
  const { data: detail } = useAsyncData<PublicTemplateDetail | null>(async () => {
    if (!selectedId) return null;
    return apiFetch<PublicTemplateDetail>(`/api/templates/public/${selectedId}`);
  }, [selectedId]);

  const handleSearchChange = (value: string) => {
    setSearch(value);
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
      setForkTarget(null);
      setSelectedId(null);
      router.push(`/templates/${res.template.id}`);
    } catch {
      toast.error(t("forkError"));
    } finally {
      setForking(false);
    }
  };

  const scoreBadge = (score: number | null) => {
    if (score == null) return null;
    const style =
      score >= 80
        ? "bg-ds-secondary-container text-ds-on-secondary-container"
        : "bg-ds-outline-variant/30 text-ds-on-surface-variant";
    return (
      <span className={`px-2 py-1 text-[10px] font-bold rounded uppercase tracking-wider ${style}`}>
        {t("qualityScore")}: {score}
      </span>
    );
  };

  const modeBadge = (mode: string) => {
    const labels: Record<string, string> = {
      sequential: t("modeSequential"),
      "fan-out": t("modeFanout"),
      single: t("modeSingle"),
    };
    return (
      <span
        className={`px-2 py-0.5 text-[10px] rounded font-bold uppercase ${MODE_STYLE[mode] ?? MODE_STYLE.single}`}
      >
        {labels[mode] ?? mode}
      </span>
    );
  };

  // ── Loading ──
  if (loading && templates.length === 0) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-48 rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <>
      <div className="max-w-6xl mx-auto space-y-8">
        {/* ═══ Header ═══ */}
        <div className="flex justify-between items-end">
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight text-ds-on-surface font-[var(--font-heading)]">
              {t("globalLibrary")}
            </h1>
            <p className="text-ds-on-surface-variant mt-2 text-lg">{t("globalLibrarySubtitle")}</p>
          </div>
          <SearchBar
            placeholder={t("searchPlaceholder")}
            value={search}
            onChange={handleSearchChange}
            className="w-full max-w-sm"
          />
        </div>

        {/* ═══ Card Grid ═══ */}
        {templates.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24">
            <div className="w-16 h-16 rounded-2xl bg-ds-surface-container-high flex items-center justify-center mb-6">
              <span className="material-symbols-outlined text-3xl text-ds-outline">public</span>
            </div>
            <h2 className="text-xl font-bold font-[var(--font-heading)] mb-2">
              {t("noPublicTemplates")}
            </h2>
            <p className="text-sm text-ds-on-surface-variant">{t("noPublicTemplatesDesc")}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {templates.map((tpl) => (
              <div
                key={tpl.id}
                onClick={() => setSelectedId(tpl.id)}
                className="group bg-ds-surface-container-lowest rounded-xl p-6 shadow-sm hover:shadow-xl transition-all cursor-pointer ring-1 ring-ds-on-surface/5 hover:ring-ds-primary-container/20"
              >
                <div className="flex justify-between items-start mb-4">
                  <h3 className="text-xl font-bold font-[var(--font-heading)] group-hover:text-ds-primary transition-colors">
                    {tpl.name}
                  </h3>
                  {scoreBadge(tpl.qualityScore)}
                </div>
                <p className="text-ds-on-surface-variant text-sm line-clamp-2 mb-6">
                  {tpl.description || "\u2014"}
                </p>
                <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-ds-surface-container-low">
                  <div className="flex items-center gap-1 text-[11px] font-semibold text-ds-on-surface-variant">
                    <span className="material-symbols-outlined text-sm">reorder</span>
                    {tpl.stepCount} {t("stepsUnit")}
                  </div>
                  {modeBadge(tpl.executionMode)}
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
              </div>
            ))}
          </div>
        )}

        {/* ═══ Bento Stats ═══ */}
        {total > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
            <div className="bg-ds-surface-container-low p-8 rounded-xl flex flex-col justify-between min-h-[160px]">
              <span className="text-xs font-bold uppercase tracking-widest text-ds-on-surface-variant">
                {t("publicTemplates")}
              </span>
              <div className="text-5xl font-black text-ds-primary mt-2">{total}</div>
            </div>
            <div className="bg-ds-surface-container-low p-8 rounded-xl flex flex-col justify-between min-h-[160px]">
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
            </div>
            <div className="bg-gradient-to-r from-ds-primary to-ds-primary-container p-8 rounded-xl flex flex-col justify-between min-h-[160px] group cursor-pointer shadow-xl shadow-ds-primary/10">
              <span className="text-xs font-bold uppercase tracking-widest text-white/70">
                {t("ctaTitle")}
              </span>
              <div className="flex items-center justify-between text-white">
                <div className="text-xl font-bold">{t("ctaDesc")}</div>
                <span className="material-symbols-outlined group-hover:translate-x-1 transition-transform">
                  arrow_forward
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ═══ Pagination ═══ */}
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

      {/* ═══ Detail Drawer ═══ */}
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

      {/* ═══ Fork Dialog ═══ */}
      <ForkConfirmDialog
        open={!!forkTarget}
        onOpenChange={(open) => {
          if (!open) setForkTarget(null);
        }}
        template={forkTarget}
        loading={forking}
        onConfirm={handleFork}
      />
    </>
  );
}
