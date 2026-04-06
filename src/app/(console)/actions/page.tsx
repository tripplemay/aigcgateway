"use client";
import { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useProject } from "@/hooks/use-project";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { timeAgo } from "@/lib/utils";

interface ActionRow {
  id: string;
  name: string;
  description: string | null;
  model: string;
  activeVersionId: string | null;
  activeVersion: { id: string; versionNumber: number } | null;
  updatedAt: string;
  versions?: { variables?: unknown[] }[];
}

interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

interface ActionStats {
  totalCalls: number;
  recentCalls: number;
}

const PAGE_SIZE = 20;

export default function ActionsPage() {
  const t = useTranslations("actions");
  const { current, loading: projLoading } = useProject();
  const router = useRouter();

  const [actions, setActions] = useState<ActionRow[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [stats, setStats] = useState<ActionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    if (!current) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (search) params.set("search", search);
      const r = await apiFetch<{ data: ActionRow[]; pagination: Pagination }>(
        `/api/projects/${current.id}/actions?${params}`,
      );
      setActions(r.data);
      setPagination(r.pagination);
    } catch {
      setActions([]);
    } finally {
      setLoading(false);
    }
  }, [current, page, search]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!current) return;
    apiFetch<ActionStats>(`/api/projects/${current.id}/actions/stats`)
      .then(setStats)
      .catch(() => {});
  }, [current]);

  if (projLoading || loading) {
    return (
      <div className="p-8 space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-[400px] w-full rounded-xl" />
      </div>
    );
  }

  return (
    <>
      {/* Header */}
      <header className="sticky top-0 z-40 bg-[#faf8ff] dark:bg-slate-950 flex justify-between items-center w-full px-8 py-4 shadow-[0px_20px_40px_rgba(19,27,46,0.04)]">
        <div>
          <h2 className="text-2xl font-black text-[#131b2e] dark:text-slate-100 font-headline tracking-[-0.02em]">
            {t("title")}
          </h2>
          <p className="text-sm text-slate-500 font-medium">{t("subtitle")}</p>
        </div>
        <div className="flex items-center gap-6">
          {/* Search */}
          <div className="relative group">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">
              search
            </span>
            <input
              className="pl-10 pr-4 py-2 bg-surface-container-low border-none rounded-xl text-sm w-64 focus:ring-2 focus:ring-primary/20 transition-all"
              placeholder={t("searchPlaceholder")}
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          {/* Create button */}
          <Link
            href="/actions/new"
            className="bg-gradient-to-r from-[#5443b9] to-[#6d5dd3] text-white px-5 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 hover:opacity-90 transition-all active:scale-95 shadow-lg shadow-primary/20"
          >
            <span className="material-symbols-outlined text-sm">add</span>
            {t("create")}
          </Link>
        </div>
      </header>

      {/* Section */}
      <section className="p-8 space-y-8 flex-1">
        {actions.length === 0 && !search ? (
          <div className="flex flex-col items-center justify-center py-24">
            <div className="w-16 h-16 rounded-2xl bg-surface-container-high flex items-center justify-center mb-6">
              <span className="material-symbols-outlined text-3xl text-slate-400">bolt</span>
            </div>
            <h2 className="text-xl font-bold font-headline mb-2">{t("emptyTitle")}</h2>
            <p className="text-sm text-slate-500 mb-6 max-w-md text-center">{t("emptyDesc")}</p>
            <Link
              href="/actions/new"
              className="bg-gradient-to-r from-[#5443b9] to-[#6d5dd3] text-white px-5 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 shadow-lg shadow-primary/20"
            >
              <span className="material-symbols-outlined text-sm">add</span>
              {t("create")}
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-12 gap-8">
            {/* Left: Table */}
            <div className="col-span-12 lg:col-span-9 space-y-6">
              <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-surface-container-low/50">
                      <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                        {t("colActionName")}
                      </th>
                      <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                        {t("model")}
                      </th>
                      <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                        {t("version")}
                      </th>
                      <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500 text-center">
                        {t("vars")}
                      </th>
                      <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                        {t("description")}
                      </th>
                      <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                        {t("updated")}
                      </th>
                      <th className="px-6 py-4"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {actions.map((action) => {
                      const varCount = action.versions?.[0]?.variables
                        ? (action.versions[0].variables as unknown[]).length
                        : 0;
                      return (
                        <tr
                          key={action.id}
                          className="hover:bg-surface-container-high transition-colors group cursor-pointer"
                          onClick={() => router.push(`/actions/${action.id}`)}
                        >
                          <td className="px-6 py-5 font-bold text-primary">{action.name}</td>
                          <td className="px-6 py-5 text-sm font-medium text-slate-700">
                            {action.model.split("/").pop()}
                          </td>
                          <td className="px-6 py-5">
                            {action.activeVersion ? (
                              <span className="px-2 py-0.5 rounded-full bg-secondary-container text-on-secondary-container text-[10px] font-bold">
                                v{action.activeVersion.versionNumber}
                              </span>
                            ) : (
                              <span className="text-slate-400">{"\u2014"}</span>
                            )}
                          </td>
                          <td className="px-6 py-5 text-center">
                            <span className="px-2 py-0.5 rounded-lg bg-surface-container-low text-slate-600 text-xs font-bold border border-outline-variant/30">
                              {varCount}
                            </span>
                          </td>
                          <td className="px-6 py-5 text-xs text-slate-500 max-w-[200px] truncate">
                            {action.description || "\u2014"}
                          </td>
                          <td className="px-6 py-5 text-xs font-medium text-slate-400">
                            {timeAgo(action.updatedAt)}
                          </td>
                          <td className="px-6 py-5 text-right">
                            <span className="material-symbols-outlined text-slate-300 group-hover:text-primary transition-colors">
                              chevron_right
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {/* Pagination footer */}
                <div className="px-6 py-4 flex items-center justify-between bg-surface-container-low/30">
                  <p className="text-xs text-slate-500 font-medium">
                    {t("showing")} <span className="text-on-surface">{actions.length}</span>{" "}
                    {t("of")} <span className="text-on-surface">{pagination?.total ?? 0}</span>{" "}
                    {t("actionsUnit")}
                  </p>
                  <div className="flex gap-2">
                    <button
                      className={`px-3 py-1.5 rounded-lg bg-surface border border-outline-variant/30 transition-colors ${page <= 1 ? "text-slate-400 cursor-not-allowed" : "text-slate-600 hover:bg-slate-50"}`}
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      <span className="material-symbols-outlined text-sm">chevron_left</span>
                    </button>
                    <button
                      className={`px-3 py-1.5 rounded-lg bg-surface border border-outline-variant/30 transition-colors ${page >= (pagination?.totalPages ?? 1) ? "text-slate-400 cursor-not-allowed" : "text-slate-600 hover:bg-slate-50"}`}
                      disabled={page >= (pagination?.totalPages ?? 1)}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      <span className="material-symbols-outlined text-sm">chevron_right</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* CTA banner */}
              <div className="bg-white/70 backdrop-blur-xl p-6 rounded-xl border border-primary/10 flex items-center justify-between gap-6 relative overflow-hidden">
                <div className="absolute -right-12 -top-12 w-48 h-48 bg-primary/5 rounded-full blur-3xl" />
                <div className="flex-1">
                  <h4 className="text-lg font-bold font-headline mb-2 flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary">auto_awesome</span>
                    {t("ctaTitle")}
                  </h4>
                  <p className="text-sm text-slate-600 leading-relaxed max-w-2xl">{t("ctaDesc")}</p>
                </div>
                <Link
                  href="/templates"
                  className="bg-primary text-white px-6 py-3 rounded-lg text-sm font-bold whitespace-nowrap hover:shadow-lg hover:shadow-primary/30 transition-all"
                >
                  {t("ctaButton")}
                </Link>
              </div>
            </div>

            {/* Right sidebar — real stats */}
            <div className="col-span-12 lg:col-span-3 space-y-6">
              {/* Action Summary */}
              <div className="bg-surface-container-lowest p-6 rounded-xl shadow-sm">
                <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-4">
                  {t("actionStats")}
                </h4>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold">{t("totalActions")}</span>
                    <span className="text-lg font-black font-headline">
                      {pagination?.total ?? 0}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold">{t("withActiveVersion")}</span>
                    <span className="text-lg font-black font-headline">
                      {actions.filter((a) => a.activeVersion).length}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold">{t("uniqueModels")}</span>
                    <span className="text-lg font-black font-headline">
                      {new Set(actions.map((a) => a.model)).size}
                    </span>
                  </div>
                </div>
              </div>

              {/* Call Stats from CallLog */}
              <div className="bg-surface-container-lowest p-6 rounded-xl shadow-sm">
                <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-4">
                  {t("totalCalls")}
                </h4>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold">{t("totalCalls")}</span>
                    <span className="text-lg font-black font-headline">
                      {stats?.totalCalls ?? 0}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold">{t("recentCalls")}</span>
                    <span className="text-lg font-black font-headline">
                      {stats?.recentCalls ?? 0}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
