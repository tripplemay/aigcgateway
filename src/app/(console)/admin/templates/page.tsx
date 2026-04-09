"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useAsyncData } from "@/hooks/use-async-data";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

// ============================================================
// Types
// ============================================================

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

interface TemplatesResponse {
  data: AdminTemplate[];
  stats: Stats;
  pagination: Pagination;
}

// ============================================================
// Page
// ============================================================

export default function AdminTemplatesPage() {
  const t = useTranslations("adminTemplates");
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [visibility, setVisibility] = useState<"all" | "public" | "private">("all");
  const [page, setPage] = useState(1);

  const { data, loading, refetch } = useAsyncData<TemplatesResponse>(() => {
    let url = `/api/admin/templates?page=${page}&pageSize=20`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    if (visibility === "public") url += `&isPublic=true`;
    if (visibility === "private") url += `&isPublic=false`;
    return apiFetch<TemplatesResponse>(url);
  }, [page, search, visibility]);

  const templates = data?.data ?? [];
  const stats = data?.stats ?? { totalTemplates: 0, totalActions: 0, publicCount: 0, privateCount: 0 };
  const pagination = data?.pagination ?? { page: 1, pageSize: 20, total: 0, totalPages: 0 };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete template "${name}"?`)) return;
    try {
      await apiFetch(`/api/admin/templates/${id}`, { method: "DELETE" });
      toast.success(t("deleted"));
      refetch();
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
      refetch();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  if (loading && !data) {
    return (
      <div className="p-8 space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[400px] w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8">
      {/* ═══ Header — design-draft line 191-194 ═══ */}
      <div className="flex flex-col gap-1">
        <h1 className="font-[var(--font-heading)] text-3xl font-extrabold tracking-tight text-ds-on-surface">
          {t("title")}
        </h1>
        <p className="text-ds-on-surface-variant font-medium opacity-70">{t("subtitle")}</p>
      </div>

      {/* ═══ Bento Stats — design-draft line 196-224 ═══ */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          {
            label: t("totalTemplates"),
            value: stats.totalTemplates,
            icon: "inventory_2",
            color: "bg-ds-primary/5 text-ds-primary",
          },
          {
            label: t("publicTemplates"),
            value: stats.publicCount,
            icon: "public",
            color: "bg-ds-secondary/5 text-ds-secondary",
          },
          {
            label: t("privateTemplates"),
            value: stats.privateCount,
            icon: "lock",
            color: "bg-ds-tertiary/5 text-ds-tertiary",
          },
        ].map((c) => (
          <div
            key={c.label}
            className="bg-ds-surface-container-lowest p-6 rounded-xl shadow-sm flex items-center justify-between group hover:shadow-md transition-shadow"
          >
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
                {c.label}
              </p>
              <h3 className="font-[var(--font-heading)] text-3xl font-extrabold text-ds-on-surface">
                {c.value}
              </h3>
            </div>
            <div
              className={`w-12 h-12 rounded-full ${c.color} flex items-center justify-center group-hover:scale-110 transition-transform`}
            >
              <span className="material-symbols-outlined text-3xl">{c.icon}</span>
            </div>
          </div>
        ))}
      </div>

      {/* ═══ Table Controls — design-draft line 226-252 ═══ */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-ds-surface-container-lowest/70 backdrop-blur-xl p-4 rounded-xl">
        <div className="flex items-center gap-4 flex-1">
          <div className="relative flex-1 max-w-md">
            <span className="absolute inset-y-0 left-3 flex items-center text-slate-400">
              <span className="material-symbols-outlined text-lg">filter_list</span>
            </span>
            <input
              className="pl-10 pr-4 py-2.5 bg-ds-surface rounded-lg border-none w-full text-sm focus:ring-2 focus:ring-ds-primary/20 outline-none font-medium text-ds-on-surface shadow-inner"
              placeholder={t("searchPlaceholder")}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="h-10 w-[1px] bg-slate-200 hidden md:block" />
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold uppercase text-slate-400 tracking-tighter">
              {t("visibilityLabel")}
            </label>
            <select
              className="bg-ds-surface border-none rounded-lg py-2 pl-3 pr-8 text-sm font-semibold text-ds-on-surface focus:ring-2 focus:ring-ds-primary/20 shadow-sm"
              value={visibility}
              onChange={(e) => {
                setVisibility(e.target.value as "all" | "public" | "private");
                setPage(1);
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
            onClick={() => refetch()}
            className="px-4 py-2 bg-ds-surface text-slate-600 rounded-lg text-xs font-bold hover:bg-slate-50 transition-colors flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-base">refresh</span>
            {t("reload")}
          </button>
        </div>
      </div>

      {/* ═══ Table — design-draft line 254-478 ═══ */}
      <div className="bg-ds-surface-container-lowest rounded-xl shadow-sm overflow-hidden">
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
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-500">
                        <span className="material-symbols-outlined text-xl">description</span>
                      </div>
                      <span className="font-semibold text-sm text-ds-on-surface">{tpl.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600 font-medium">
                    {tpl.projectName}
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-md text-[11px] font-bold">
                      {tpl.stepCount} {t("steps")}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <Switch
                      checked={tpl.isPublic}
                      onCheckedChange={() => handleTogglePublic(tpl.id, tpl.isPublic)}
                    />
                  </td>
                  <td className="px-6 py-4 text-xs font-medium text-slate-500">
                    {new Date(tpl.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-right space-x-2">
                    <button
                      onClick={() => router.push(`/templates/${tpl.id}`)}
                      className="p-1.5 text-slate-400 hover:text-ds-primary hover:bg-ds-primary/5 rounded transition-all"
                    >
                      <span className="material-symbols-outlined text-xl">visibility</span>
                    </button>
                    <button
                      onClick={() => handleDelete(tpl.id, tpl.name)}
                      className="p-1.5 text-slate-400 hover:text-ds-error hover:bg-ds-error/5 rounded transition-all"
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
        {/* ═══ Pagination — design-draft line 463-478 ═══ */}
        <div className="px-6 py-4 bg-slate-50/50 flex items-center justify-between">
          <p className="text-xs text-slate-500 font-medium">
            {t("showing")}{" "}
            <span className="text-ds-on-surface font-bold">
              {(pagination.page - 1) * pagination.pageSize + 1} -{" "}
              {Math.min(pagination.page * pagination.pageSize, pagination.total)}
            </span>{" "}
            {t("of")} <span className="text-ds-on-surface font-bold">{pagination.total}</span>{" "}
            {t("templates")}
          </p>
          <div className="flex items-center gap-1">
            <button
              className="p-2 text-slate-400 hover:text-ds-primary disabled:opacity-30"
              disabled={pagination.page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <span className="material-symbols-outlined">chevron_left</span>
            </button>
            {Array.from({ length: Math.min(pagination.totalPages, 5) }, (_, i) => i + 1).map(
              (pg) => (
                <button
                  key={pg}
                  className={`w-8 h-8 flex items-center justify-center text-xs font-bold rounded-lg ${
                    pg === pagination.page
                      ? "bg-ds-primary text-white"
                      : "text-slate-600 hover:bg-slate-200"
                  }`}
                  onClick={() => setPage(pg)}
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
                  onClick={() => setPage(pagination.totalPages)}
                >
                  {pagination.totalPages}
                </button>
              </>
            )}
            <button
              className="p-2 text-slate-400 hover:text-ds-primary disabled:opacity-30"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              <span className="material-symbols-outlined">chevron_right</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
