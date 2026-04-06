"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { Skeleton } from "@/components/ui/skeleton";
import { timeAgo } from "@/lib/utils";

interface AdminTemplate {
  id: string;
  name: string;
  description: string | null;
  projectName: string;
  stepCount: number;
  executionMode: string;
  createdAt: string;
  updatedAt: string;
}

interface Stats {
  totalTemplates: number;
  totalActions: number;
}

export default function AdminTemplatesPage() {
  const t = useTranslations("adminTemplates");

  const [templates, setTemplates] = useState<AdminTemplate[]>([]);
  const [stats, setStats] = useState<Stats>({ totalTemplates: 0, totalActions: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const load = (s?: string) => {
    setLoading(true);
    const q = s !== undefined ? s : search;
    apiFetch<{ data: AdminTemplate[]; stats: Stats }>(`/api/admin/templates?pageSize=50${q ? `&search=${encodeURIComponent(q)}` : ""}`)
      .then((d) => {
        setTemplates(d.data);
        setStats(d.stats);
      })
      .catch(() => setTemplates([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const modeBadge = (mode: string) => {
    const styles: Record<string, string> = {
      sequential: "bg-indigo-100 text-indigo-700",
      "fan-out": "bg-amber-100 text-amber-700",
      single: "bg-slate-100 text-slate-600",
    };
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-tighter ${styles[mode] || styles.single}`}>
        {mode}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="p-8 space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[400px] w-full rounded-xl" />
      </div>
    );
  }

  return (
    <section className="px-10 py-12 space-y-8">
      <div>
        <h1 className="text-4xl font-extrabold tracking-tight text-on-surface mb-2 font-headline">
          {t("title")}
        </h1>
        <p className="text-slate-500 font-medium">{t("subtitle")}</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-6">
        <div className="bg-surface-container-lowest p-6 rounded-xl shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{t("totalTemplates")}</p>
          <p className="text-3xl font-black font-headline text-on-surface mt-2">{stats.totalTemplates}</p>
        </div>
        <div className="bg-surface-container-lowest p-6 rounded-xl shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{t("totalActions")}</p>
          <p className="text-3xl font-black font-headline text-on-surface mt-2">{stats.totalActions}</p>
        </div>
        <div className="bg-surface-container-lowest p-6 rounded-xl shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{t("projects")}</p>
          <p className="text-3xl font-black font-headline text-on-surface mt-2">
            {new Set(templates.map((t) => t.projectName)).size}
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">search</span>
        <input
          className="pl-10 pr-4 py-2.5 bg-surface-container-low border-none rounded-xl text-sm w-full focus:ring-2 focus:ring-primary/20"
          placeholder={t("searchPlaceholder")}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            load(e.target.value);
          }}
        />
      </div>

      {/* Table */}
      <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-surface-container-low">
              <th className="px-6 py-4 text-[10px] font-extrabold uppercase tracking-widest text-slate-500">{t("colName")}</th>
              <th className="px-6 py-4 text-[10px] font-extrabold uppercase tracking-widest text-slate-500">{t("colProject")}</th>
              <th className="px-6 py-4 text-[10px] font-extrabold uppercase tracking-widest text-slate-500">{t("colSteps")}</th>
              <th className="px-6 py-4 text-[10px] font-extrabold uppercase tracking-widest text-slate-500">{t("colMode")}</th>
              <th className="px-6 py-4 text-[10px] font-extrabold uppercase tracking-widest text-slate-500">{t("colCreated")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {templates.map((tpl) => (
              <tr key={tpl.id} className="hover:bg-surface-container-high/50 transition-colors">
                <td className="px-6 py-5">
                  <p className="font-bold text-primary text-sm">{tpl.name}</p>
                  {tpl.description && (
                    <p className="text-xs text-slate-500 truncate max-w-[200px] mt-0.5">{tpl.description}</p>
                  )}
                </td>
                <td className="px-6 py-5 text-sm text-slate-600">{tpl.projectName}</td>
                <td className="px-6 py-5 text-sm text-slate-600">{tpl.stepCount}</td>
                <td className="px-6 py-5">{modeBadge(tpl.executionMode)}</td>
                <td className="px-6 py-5 text-xs text-slate-400">{timeAgo(tpl.createdAt)}</td>
              </tr>
            ))}
            {templates.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                  {t("empty")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
