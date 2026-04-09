"use client";
import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useProject } from "@/hooks/use-project";
import { useAsyncData } from "@/hooks/use-async-data";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { SearchBar } from "@/components/search-bar";
import { Pagination } from "@/components/pagination";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { timeAgo } from "@/lib/utils";

// ============================================================
// Types
// ============================================================

interface TemplateRow {
  id: string;
  name: string;
  description: string | null;
  stepCount: number;
  executionMode: string;
  updatedAt: string;
}

interface TemplatesResponse {
  data: TemplateRow[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

const PAGE_SIZE = 20;

const MODE_STYLE: Record<string, string> = {
  sequential: "bg-ds-primary-container/10 text-ds-primary",
  "fan-out": "bg-ds-tertiary-container/10 text-ds-tertiary",
  single: "bg-slate-100 text-slate-600",
};

// ============================================================
// Component
// ============================================================

export default function TemplatesPage() {
  const t = useTranslations("templates");
  const tc = useTranslations("common");
  const locale = useLocale();
  const { current, loading: projLoading } = useProject();
  const router = useRouter();

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  // ── Data ──
  const { data: result, loading } = useAsyncData<TemplatesResponse>(async () => {
    if (!current) return { data: [], pagination: { page: 1, pageSize: PAGE_SIZE, total: 0, totalPages: 1 } };
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (search) params.set("search", search);
    return apiFetch<TemplatesResponse>(`/api/projects/${current.id}/templates?${params}`);
  }, [current, page, search]);

  const templates = result?.data ?? [];
  const totalPages = result?.pagination.totalPages ?? 1;
  const total = result?.pagination.total ?? 0;

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const modeBadge = (mode: string) => {
    const labels: Record<string, string> = {
      sequential: t("modeSequential"),
      "fan-out": t("modeFanout"),
      single: t("modeSingle"),
    };
    return (
      <span
        className={`inline-flex items-center px-3 py-1 rounded-lg text-xs font-semibold uppercase tracking-wider ${MODE_STYLE[mode] ?? MODE_STYLE.single}`}
      >
        {labels[mode] ?? mode}
      </span>
    );
  };

  // ── Loading & empty states ──
  if (projLoading)
    return (
      <div className="space-y-4 pt-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  if (!current) return <EmptyState onCreated={() => window.location.reload()} />;

  // ── Render ──
  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* ═══ Page Header ═══ */}
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-2xl font-extrabold font-[var(--font-heading)] text-ds-on-surface tracking-tight">
            {t("title")}
          </h2>
          <p className="text-ds-on-surface-variant text-sm mt-1">{t("subtitle")}</p>
        </div>
        <Link
          href="/templates/new"
          className="px-6 py-2 bg-gradient-to-r from-ds-primary to-ds-primary-container text-white rounded-full text-sm font-bold shadow-lg shadow-ds-primary/20 active:scale-95 duration-200 flex items-center gap-1"
        >
          <span className="material-symbols-outlined text-lg">add_circle</span>
          {t("create")}
        </Link>
      </div>

      {/* ═══ Table ═══ */}
      {templates.length === 0 && !search && !loading ? (
        <div className="flex flex-col items-center justify-center py-24">
          <div className="w-16 h-16 rounded-2xl bg-ds-surface-container-high flex items-center justify-center mb-6">
            <span className="material-symbols-outlined text-3xl text-slate-400">description</span>
          </div>
          <h2 className="text-xl font-bold font-[var(--font-heading)] mb-2">{t("emptyTitle")}</h2>
          <p className="text-sm text-slate-500 mb-6 max-w-md text-center">{t("emptyDesc")}</p>
          <Link
            href="/templates/new"
            className="px-6 py-2 bg-gradient-to-r from-ds-primary to-ds-primary-container text-white rounded-full text-sm font-bold shadow-lg shadow-ds-primary/20 flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-sm">add</span>
            {t("create")}
          </Link>
        </div>
      ) : (
        <>
          <section className="bg-ds-surface-container-lowest rounded-2xl shadow-sm overflow-hidden">
            {/* Table header bar */}
            <div className="px-6 py-5 flex justify-between items-center border-b border-ds-outline-variant/10">
              <h3 className="text-lg font-extrabold tracking-tight font-[var(--font-heading)]">
                {t("title")}
              </h3>
              <SearchBar
                placeholder={t("searchPlaceholder")}
                value={search}
                onChange={handleSearchChange}
                className="w-64"
              />
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="px-6 py-4">{t("templateName")}</TableHead>
                  <TableHead className="px-6 py-4">{t("steps")}</TableHead>
                  <TableHead className="px-6 py-4">{t("executionMode")}</TableHead>
                  <TableHead className="px-6 py-4">{t("descriptionLabel")}</TableHead>
                  <TableHead className="px-6 py-4">{t("updated")}</TableHead>
                  <TableHead className="px-6 py-4 w-10" />
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-ds-outline-variant/10">
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="px-6 py-12 text-center text-ds-outline">
                      {tc("loading")}
                    </TableCell>
                  </TableRow>
                ) : templates.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="px-6 py-12 text-center text-ds-outline">
                      {t("emptyTitle")}
                    </TableCell>
                  </TableRow>
                ) : (
                  templates.map((tpl) => (
                    <TableRow
                      key={tpl.id}
                      className="cursor-pointer"
                      onClick={() => router.push(`/templates/${tpl.id}`)}
                    >
                      <TableCell className="px-6 py-5 font-bold text-ds-primary">
                        {tpl.name}
                      </TableCell>
                      <TableCell className="px-6 py-5">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-ds-secondary-container text-ds-on-secondary-container rounded-full text-xs font-semibold">
                          <span className="material-symbols-outlined text-xs">reorder</span>
                          {tpl.stepCount} {t("stepsUnit")}
                        </span>
                      </TableCell>
                      <TableCell className="px-6 py-5">{modeBadge(tpl.executionMode)}</TableCell>
                      <TableCell className="px-6 py-5 text-sm text-slate-500 max-w-[300px] truncate">
                        {tpl.description || "\u2014"}
                      </TableCell>
                      <TableCell className="px-6 py-5 text-xs text-slate-400">
                        {timeAgo(tpl.updatedAt, locale)}
                      </TableCell>
                      <TableCell className="px-6 py-5 text-slate-300 group-hover:text-ds-primary transition-colors">
                        <span className="material-symbols-outlined text-xl">chevron_right</span>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            {/* Pagination */}
            {total > 0 && (
              <Pagination
                page={page}
                totalPages={totalPages}
                onPageChange={setPage}
                total={total}
                pageSize={PAGE_SIZE}
                className="px-6 py-4 bg-ds-surface-container-high/30 border-t border-ds-outline-variant/10"
              />
            )}
          </section>

          {/* ═══ Stats + CTA Bento ═══ */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="col-span-1 bg-ds-surface-container-low p-6 rounded-xl relative overflow-hidden group">
              <div className="relative z-10">
                <h3 className="font-[var(--font-heading)] text-lg font-bold text-ds-on-surface mb-1">
                  {t("templateStats")}
                </h3>
                <p className="text-xs text-slate-500 mb-4">{t("templateStatsDesc")}</p>
                <div className="flex items-end gap-4">
                  <div>
                    <span className="text-3xl font-black text-ds-primary">{total}</span>
                    <span className="text-[10px] text-slate-500 font-bold block">
                      {t("totalTemplates")}
                    </span>
                  </div>
                </div>
              </div>
              <div className="absolute -right-4 -bottom-4 opacity-10 group-hover:scale-110 transition-transform">
                <span
                  className="material-symbols-outlined text-8xl"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  account_tree
                </span>
              </div>
            </div>
            <div className="col-span-2 bg-gradient-to-br from-ds-primary to-indigo-800 p-6 rounded-xl text-white flex justify-between items-center relative overflow-hidden">
              <div className="relative z-10">
                <h3 className="font-[var(--font-heading)] text-lg font-bold mb-1">{t("ctaTitle")}</h3>
                <p className="text-xs text-white/70 mb-4 max-w-sm">{t("ctaDesc")}</p>
                <Link
                  href="/templates/new"
                  className="bg-white text-ds-primary px-4 py-2 rounded-lg text-xs font-bold hover:bg-slate-100 transition-colors inline-block"
                >
                  {t("create")}
                </Link>
              </div>
              <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -mr-20 -mt-20 blur-3xl" />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
