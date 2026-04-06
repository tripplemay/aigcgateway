"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface AdminTemplate {
  id: string;
  name: string;
  description: string | null;
  projectName: string;
  stepCount: number;
  executionMode: string;
  isPublic: boolean;
  qualityScore: number | null;
  createdAt: string;
  updatedAt: string;
}

interface Stats {
  totalTemplates: number;
  totalActions: number;
  publicCount: number;
  privateCount: number;
}

interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export default function AdminTemplatesPage() {
  const t = useTranslations("adminTemplates");
  const router = useRouter();

  const [templates, setTemplates] = useState<AdminTemplate[]>([]);
  const [stats, setStats] = useState<Stats>({
    totalTemplates: 0,
    totalActions: 0,
    publicCount: 0,
    privateCount: 0,
  });
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [visibility, setVisibility] = useState<"all" | "public" | "private">("all");

  const load = (opts?: { s?: string; p?: number; v?: string }) => {
    setLoading(true);
    const q = opts?.s !== undefined ? opts.s : search;
    const pg = opts?.p !== undefined ? opts.p : pagination.page;
    const vis = opts?.v !== undefined ? opts.v : visibility;
    let url = `/api/admin/templates?page=${pg}&pageSize=20`;
    if (q) url += `&search=${encodeURIComponent(q)}`;
    if (vis === "public") url += `&isPublic=true`;
    if (vis === "private") url += `&isPublic=false`;
    apiFetch<{ data: AdminTemplate[]; stats: Stats; pagination: Pagination }>(url)
      .then((d) => {
        setTemplates(d.data);
        setStats(d.stats);
        setPagination(d.pagination);
      })
      .catch(() => setTemplates([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete template "${name}"?`)) return;
    try {
      await apiFetch(`/api/admin/templates/${id}`, { method: "DELETE" });
      toast.success(t("deleted"));
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleTogglePublic = async (id: string, isPublic: boolean) => {
    try {
      await apiFetch(`/api/admin/templates/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ isPublic: !isPublic }),
      });
      toast.success(t("publicToggled"));
      setTemplates((prev) =>
        prev.map((tpl) => (tpl.id === id ? { ...tpl, isPublic: !isPublic } : tpl)),
      );
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  if (loading && templates.length === 0) {
    return (
      <div className="p-8 space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[400px] w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8">
      {/* Header Section — design-draft line 191-194 */}
      <div className="flex flex-col gap-1">
        <h1 className="font-headline text-3xl font-extrabold tracking-tight text-on-surface">
          {t("title")}
        </h1>
        <p className="text-on-surface-variant font-medium opacity-70">{t("subtitle")}</p>
      </div>

      {/* Bento Stats Row — design-draft line 196-224 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-surface-container-lowest p-6 rounded-xl shadow-sm border border-slate-200/50 flex items-center justify-between group hover:shadow-md transition-shadow">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
              {t("totalTemplates")}
            </p>
            <h3 className="font-headline text-3xl font-extrabold text-[#131b2e]">
              {stats.totalTemplates}
            </h3>
          </div>
          <div className="w-12 h-12 rounded-full bg-primary/5 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
            <span className="material-symbols-outlined text-3xl">inventory_2</span>
          </div>
        </div>
        <div className="bg-surface-container-lowest p-6 rounded-xl shadow-sm border border-slate-200/50 flex items-center justify-between group hover:shadow-md transition-shadow">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
              {t("publicTemplates")}
            </p>
            <h3 className="font-headline text-3xl font-extrabold text-[#131b2e]">
              {stats.publicCount}
            </h3>
          </div>
          <div className="w-12 h-12 rounded-full bg-secondary/5 flex items-center justify-center text-secondary group-hover:scale-110 transition-transform">
            <span className="material-symbols-outlined text-3xl">public</span>
          </div>
        </div>
        <div className="bg-surface-container-lowest p-6 rounded-xl shadow-sm border border-slate-200/50 flex items-center justify-between group hover:shadow-md transition-shadow">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
              {t("privateTemplates")}
            </p>
            <h3 className="font-headline text-3xl font-extrabold text-[#131b2e]">
              {stats.privateCount}
            </h3>
          </div>
          <div className="w-12 h-12 rounded-full bg-tertiary/5 flex items-center justify-center text-tertiary group-hover:scale-110 transition-transform">
            <span className="material-symbols-outlined text-3xl">lock</span>
          </div>
        </div>
      </div>

      {/* Table Control Bar — design-draft line 226-252 */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/70 backdrop-blur-xl p-4 rounded-xl border border-slate-200/30">
        <div className="flex items-center gap-4 flex-1">
          <div className="relative flex-1 max-w-md">
            <span className="absolute inset-y-0 left-3 flex items-center text-slate-400">
              <span className="material-symbols-outlined text-lg">filter_list</span>
            </span>
            <input
              className="pl-10 pr-4 py-2.5 bg-surface rounded-lg border-none w-full text-sm focus:ring-2 focus:ring-primary/20 outline-none font-medium text-on-surface shadow-inner"
              placeholder={t("searchPlaceholder")}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                load({ s: e.target.value, p: 1 });
              }}
            />
          </div>
          <div className="h-10 w-[1px] bg-slate-200 hidden md:block" />
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold uppercase text-slate-400 tracking-tighter">
              Visibility:
            </label>
            <select
              className="bg-surface border-none rounded-lg py-2 pl-3 pr-8 text-sm font-semibold text-on-surface focus:ring-2 focus:ring-primary/20 shadow-sm"
              value={visibility}
              onChange={(e) => {
                const v = e.target.value as "all" | "public" | "private";
                setVisibility(v);
                load({ v, p: 1 });
              }}
            >
              <option value="all">{t("visibilityAll")}</option>
              <option value="public">{t("visibilityPublic")}</option>
              <option value="private">{t("visibilityPrivate")}</option>
            </select>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => load()}
            className="px-4 py-2 bg-surface text-slate-600 rounded-lg text-xs font-bold border border-slate-200 hover:bg-slate-50 transition-colors flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-base">refresh</span>
            {t("reload")}
          </button>
        </div>
      </div>

      {/* Table — design-draft line 254-478 */}
      <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden border border-slate-200/50">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  {t("colName")}
                </th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  {t("colProject")}
                </th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  {t("colSteps")}
                </th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  {t("colPublic")}
                </th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  {t("colCreated")}
                </th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-400 text-right">
                  {t("colActions")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {templates.map((tpl) => (
                <tr key={tpl.id} className="hover:bg-slate-50/80 transition-colors">
                  {/* Template Name with icon — design-draft line 272-277 */}
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-500">
                        <span className="material-symbols-outlined text-xl">description</span>
                      </div>
                      <span className="font-semibold text-sm text-[#131b2e]">{tpl.name}</span>
                    </div>
                  </td>
                  {/* Project */}
                  <td className="px-6 py-4 text-sm text-slate-600 font-medium">
                    {tpl.projectName}
                  </td>
                  {/* Steps */}
                  <td className="px-6 py-4">
                    <span className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-md text-[11px] font-bold">
                      {tpl.stepCount} steps
                    </span>
                  </td>
                  {/* Public toggle — design-draft line 284-287 */}
                  <td className="px-6 py-4">
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={tpl.isPublic}
                        onChange={() => handleTogglePublic(tpl.id, tpl.isPublic)}
                      />
                      <div className="w-10 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary" />
                    </label>
                  </td>
                  {/* Created Date */}
                  <td className="px-6 py-4 text-xs font-medium text-slate-500">
                    {new Date(tpl.createdAt).toLocaleDateString()}
                  </td>
                  {/* Actions — design-draft line 298-305 */}
                  <td className="px-6 py-4 text-right space-x-2">
                    <button
                      onClick={() => router.push(`/templates/${tpl.id}`)}
                      className="p-1.5 text-slate-400 hover:text-primary hover:bg-primary/5 rounded transition-all"
                    >
                      <span className="material-symbols-outlined text-xl">visibility</span>
                    </button>
                    <button
                      onClick={() => handleDelete(tpl.id, tpl.name)}
                      className="p-1.5 text-slate-400 hover:text-error hover:bg-error/5 rounded transition-all"
                    >
                      <span className="material-symbols-outlined text-xl">delete</span>
                    </button>
                  </td>
                </tr>
              ))}
              {templates.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                    {t("empty")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {/* Pagination — design-draft line 463-478 */}
        <div className="px-6 py-4 bg-slate-50/50 flex items-center justify-between border-t border-slate-100">
          <p className="text-xs text-slate-500 font-medium">
            {t("showing")}{" "}
            <span className="text-on-surface font-bold">
              {(pagination.page - 1) * pagination.pageSize + 1} -{" "}
              {Math.min(pagination.page * pagination.pageSize, pagination.total)}
            </span>{" "}
            {t("of")} <span className="text-on-surface font-bold">{pagination.total}</span>{" "}
            {t("templates")}
          </p>
          <div className="flex items-center gap-1">
            <button
              className="p-2 text-slate-400 hover:text-primary disabled:opacity-30"
              disabled={pagination.page <= 1}
              onClick={() => load({ p: pagination.page - 1 })}
            >
              <span className="material-symbols-outlined">chevron_left</span>
            </button>
            {Array.from({ length: Math.min(pagination.totalPages, 5) }, (_, i) => i + 1).map(
              (pg) => (
                <button
                  key={pg}
                  className={`w-8 h-8 flex items-center justify-center text-xs font-bold rounded-lg ${
                    pg === pagination.page
                      ? "bg-primary text-white"
                      : "text-slate-600 hover:bg-slate-200"
                  }`}
                  onClick={() => load({ p: pg })}
                >
                  {pg}
                </button>
              ),
            )}
            {pagination.totalPages > 5 && (
              <>
                <span className="px-2 text-slate-400">...</span>
                <button
                  className="w-8 h-8 flex items-center justify-center text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-lg"
                  onClick={() => load({ p: pagination.totalPages })}
                >
                  {pagination.totalPages}
                </button>
              </>
            )}
            <button
              className="p-2 text-slate-400 hover:text-primary disabled:opacity-30"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => load({ p: pagination.page + 1 })}
            >
              <span className="material-symbols-outlined">chevron_right</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
