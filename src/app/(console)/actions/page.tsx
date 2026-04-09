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

interface ActionRow {
  id: string;
  name: string;
  description: string | null;
  model: string;
  activeVersionId: string | null;
  activeVersion: { id: string; versionNumber: number } | null;
  updatedAt: string;
}

interface ActionsResponse {
  data: ActionRow[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

const PAGE_SIZE = 20;

// ============================================================
// Component
// ============================================================

export default function ActionsPage() {
  const t = useTranslations("actions");
  const tc = useTranslations("common");
  const locale = useLocale();
  const { current, loading: projLoading } = useProject();
  const router = useRouter();

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  // ── Data ──
  const { data: result, loading } = useAsyncData<ActionsResponse>(async () => {
    if (!current) return { data: [], pagination: { page: 1, pageSize: PAGE_SIZE, total: 0, totalPages: 1 } };
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (search) params.set("search", search);
    return apiFetch<ActionsResponse>(`/api/projects/${current.id}/actions?${params}`);
  }, [current, page, search]);

  const actions = result?.data ?? [];
  const totalPages = result?.pagination.totalPages ?? 1;
  const total = result?.pagination.total ?? 0;

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
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

  // ── Render — 1:1 replica of design-draft/actions/code.html lines 152-287 ──
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
          href="/actions/new"
          className="px-6 py-2 bg-gradient-to-r from-ds-primary to-ds-primary-container text-white rounded-full text-sm font-bold shadow-lg shadow-ds-primary/20 active:scale-95 duration-200 flex items-center gap-1"
        >
          + {t("create")}
        </Link>
      </div>

      {/* ═══ Actions Table ═══ */}
      {actions.length === 0 && !search && !loading ? (
        <div className="flex flex-col items-center justify-center py-24">
          <div className="w-16 h-16 rounded-2xl bg-ds-surface-container-high flex items-center justify-center mb-6">
            <span className="material-symbols-outlined text-3xl text-slate-400">bolt</span>
          </div>
          <h2 className="text-xl font-bold font-[var(--font-heading)] mb-2">{t("emptyTitle")}</h2>
          <p className="text-sm text-slate-500 mb-6 max-w-md text-center">{t("emptyDesc")}</p>
          <Link
            href="/actions/new"
            className="px-6 py-2 bg-gradient-to-r from-ds-primary to-ds-primary-container text-white rounded-full text-sm font-bold shadow-lg shadow-ds-primary/20 flex items-center gap-1"
          >
            + {t("create")}
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
                  <TableHead className="px-6 py-4">{t("colActionName")}</TableHead>
                  <TableHead className="px-6 py-4">{t("model")}</TableHead>
                  <TableHead className="px-6 py-4">{t("version")}</TableHead>
                  <TableHead className="px-6 py-4">{t("description")}</TableHead>
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
                ) : actions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="px-6 py-12 text-center text-ds-outline">
                      {t("emptyTitle")}
                    </TableCell>
                  </TableRow>
                ) : (
                  actions.map((action) => (
                    <TableRow
                      key={action.id}
                      className="cursor-pointer"
                      onClick={() => router.push(`/actions/${action.id}`)}
                    >
                      <TableCell className="px-6 py-5 font-bold text-ds-primary">
                        {action.name}
                      </TableCell>
                      <TableCell className="px-6 py-5 text-sm font-medium text-ds-on-surface-variant">
                        {action.model.split("/").pop()}
                      </TableCell>
                      <TableCell className="px-6 py-5">
                        {action.activeVersion ? (
                          <span className="px-2 py-1 bg-indigo-50 text-indigo-600 rounded text-[10px] font-black tracking-wider uppercase">
                            v{action.activeVersion.versionNumber}
                          </span>
                        ) : (
                          <span className="text-slate-400">{"\u2014"}</span>
                        )}
                      </TableCell>
                      <TableCell className="px-6 py-5 text-sm text-slate-500 max-w-[300px] truncate">
                        {action.description || "\u2014"}
                      </TableCell>
                      <TableCell className="px-6 py-5 text-xs text-slate-400">
                        {timeAgo(action.updatedAt, locale)}
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

          {/* ═══ CTA Banner — code.html lines 269-281 ═══ */}
          <section className="relative rounded-2xl overflow-hidden p-10 flex flex-col md:flex-row items-center justify-between gap-8 bg-[#131b2e] text-white">
            <div
              className="absolute inset-0 opacity-20 pointer-events-none"
              style={{
                backgroundImage:
                  "radial-gradient(circle at 80% 20%, #6d5dd3 0%, transparent 40%)",
              }}
            />
            <div className="relative z-10 max-w-xl">
              <h3 className="text-3xl font-extrabold mb-4 tracking-tight font-[var(--font-heading)]">
                {t("ctaTitle")}
              </h3>
              <p className="text-slate-300 text-lg leading-relaxed">{t("ctaDesc")}</p>
            </div>
            <div className="relative z-10">
              <Link
                href="/templates"
                className="px-8 py-4 border-2 border-indigo-500/30 hover:border-indigo-500 hover:bg-indigo-500/10 text-indigo-400 font-bold rounded-xl transition-all active:scale-95 inline-block"
              >
                {t("ctaButton")}
              </Link>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
