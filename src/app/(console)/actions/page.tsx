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

const PAGE_SIZE = 20;

export default function ActionsPage() {
  const t = useTranslations("actions");
  const { current, loading: projLoading } = useProject();
  const router = useRouter();

  const [actions, setActions] = useState<ActionRow[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
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
      {/* Header — design-draft line 155-169 */}
      <header className="sticky top-0 z-40 w-full bg-white/80 dark:bg-slate-950/80 backdrop-blur-xl flex justify-between items-center px-8 py-4 shadow-sm">
        <div className="flex flex-col">
          <h2 className="text-2xl font-black text-slate-900 dark:text-white font-headline">
            {t("title")}
          </h2>
          <span className="text-xs font-medium text-slate-500 tracking-tight">{t("subtitle")}</span>
        </div>
        <div className="flex items-center gap-6">
          {/* Search — design-draft line 161-163 */}
          <div className="relative group">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary transition-colors">
              search
            </span>
            <input
              className="pl-10 pr-4 py-2 w-72 bg-slate-100 dark:bg-slate-800 border-none rounded-full text-sm focus:ring-2 focus:ring-primary/20 transition-all outline-none"
              placeholder={t("searchPlaceholder")}
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          {/* Create button — design-draft line 165-167 */}
          <Link
            href="/actions/new"
            className="px-6 py-2 bg-gradient-to-r from-primary to-primary-container text-white rounded-full text-sm font-bold shadow-lg shadow-primary/20 active:scale-95 duration-200 flex items-center gap-1"
          >
            + {t("create")}
          </Link>
        </div>
      </header>

      {/* Page Content — design-draft line 172-281 */}
      <div className="p-8 space-y-8 flex-grow">
        {actions.length === 0 && !search ? (
          <div className="flex flex-col items-center justify-center py-24">
            <div className="w-16 h-16 rounded-2xl bg-surface-container-high flex items-center justify-center mb-6">
              <span className="material-symbols-outlined text-3xl text-slate-400">bolt</span>
            </div>
            <h2 className="text-xl font-bold font-headline mb-2">{t("emptyTitle")}</h2>
            <p className="text-sm text-slate-500 mb-6 max-w-md text-center">{t("emptyDesc")}</p>
            <Link
              href="/actions/new"
              className="px-6 py-2 bg-gradient-to-r from-primary to-primary-container text-white rounded-full text-sm font-bold shadow-lg shadow-primary/20 flex items-center gap-1"
            >
              + {t("create")}
            </Link>
          </div>
        ) : (
          <>
            {/* Table — design-draft line 174-267 (full width, no sidebar) */}
            <div className="bg-surface-container-lowest rounded-xl overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-container-low">
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                      {t("colActionName")}
                    </th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                      {t("model")}
                    </th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                      {t("version")}
                    </th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                      {t("vars")}
                    </th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                      {t("description")}
                    </th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                      {t("updated")}
                    </th>
                    <th className="px-6 py-4 w-10"></th>
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
                        className="group hover:bg-surface-container-high transition-colors cursor-pointer"
                        onClick={() => router.push(`/actions/${action.id}`)}
                      >
                        <td className="px-6 py-5 font-bold text-primary">{action.name}</td>
                        <td className="px-6 py-5 text-sm font-medium text-on-surface-variant">
                          {action.model.split("/").pop()}
                        </td>
                        <td className="px-6 py-5">
                          {action.activeVersion ? (
                            <span className="px-2 py-1 bg-indigo-50 text-indigo-600 rounded text-[10px] font-black tracking-wider uppercase">
                              v{action.activeVersion.versionNumber}
                            </span>
                          ) : (
                            <span className="text-slate-400">{"\u2014"}</span>
                          )}
                        </td>
                        <td className="px-6 py-5 text-sm font-medium text-on-surface-variant">
                          {varCount}
                        </td>
                        <td className="px-6 py-5 text-sm text-slate-500 max-w-[300px] truncate">
                          {action.description || "\u2014"}
                        </td>
                        <td className="px-6 py-5 text-xs text-slate-400">
                          {timeAgo(action.updatedAt)}
                        </td>
                        <td className="px-6 py-5 text-slate-300 group-hover:text-primary transition-colors">
                          <span className="material-symbols-outlined text-xl">chevron_right</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {/* Pagination — design-draft line 260-266 */}
              <div className="px-6 py-4 bg-surface-container-low flex justify-between items-center text-sm font-medium text-slate-500">
                <p>
                  {t("showing")} {actions.length} {t("of")} {pagination?.total ?? 0}{" "}
                  {t("actionsUnit")}
                </p>
                <div className="flex gap-2">
                  <button
                    className={`px-3 py-1 bg-white border border-slate-200 rounded transition-colors ${
                      page <= 1
                        ? "text-slate-400 cursor-not-allowed"
                        : "hover:bg-indigo-50 hover:text-indigo-600"
                    }`}
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    {t("previous")}
                  </button>
                  <button
                    className={`px-3 py-1 bg-white border border-slate-200 rounded transition-colors ${
                      page >= (pagination?.totalPages ?? 1)
                        ? "text-slate-400 cursor-not-allowed"
                        : "hover:bg-indigo-50 hover:text-indigo-600"
                    }`}
                    disabled={page >= (pagination?.totalPages ?? 1)}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    {t("next")}
                  </button>
                </div>
              </div>
            </div>

            {/* CTA Banner — design-draft line 269-281 */}
            <section className="relative rounded-2xl overflow-hidden p-10 flex flex-col md:flex-row items-center justify-between gap-8 bg-[#131b2e] text-white">
              <div
                className="absolute inset-0 opacity-20 pointer-events-none"
                style={{
                  backgroundImage:
                    "radial-gradient(circle at 80% 20%, #6d5dd3 0%, transparent 40%)",
                }}
              />
              <div className="relative z-10 max-w-xl">
                <h3 className="text-3xl font-extrabold mb-4 tracking-tight font-headline">
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
    </>
  );
}
