"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useProject } from "@/hooks/use-project";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { timeAgo } from "@/lib/utils";

interface StepInfo {
  role: string;
  action: { name: string; model: string };
}

interface TemplateRow {
  id: string;
  name: string;
  description: string | null;
  stepCount: number;
  executionMode: string;
  steps: StepInfo[];
  updatedAt: string;
}

export default function TemplatesPage() {
  const t = useTranslations("templates");
  const { current, loading: projLoading } = useProject();
  const router = useRouter();

  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!current) return;
    setLoading(true);
    apiFetch<{ data: TemplateRow[] }>(`/api/projects/${current.id}/templates?pageSize=100`)
      .then((d) => setTemplates(d.data))
      .catch(() => setTemplates([]))
      .finally(() => setLoading(false));
  }, [current]);

  if (projLoading || loading) {
    return (
      <div className="p-8 space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-[400px] w-full rounded-xl" />
      </div>
    );
  }

  const filtered = search
    ? templates.filter(
        (tpl) =>
          tpl.name.toLowerCase().includes(search.toLowerCase()) ||
          tpl.description?.toLowerCase().includes(search.toLowerCase()),
      )
    : templates;

  const modeBadge = (mode: string) => {
    const styles: Record<string, string> = {
      sequential: "bg-indigo-100 text-indigo-700",
      "fan-out": "bg-purple-100 text-purple-700",
      single: "bg-slate-200 text-slate-700",
    };
    const labels: Record<string, string> = {
      sequential: t("modeSequential"),
      "fan-out": t("modeFanout"),
      single: t("modeSingle"),
    };
    return (
      <span
        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-tighter ${styles[mode] || styles.single}`}
      >
        {labels[mode] || mode}
      </span>
    );
  };

  return (
    <section className="px-10 py-12">
      {/* Page Header — design-draft line 172-180 */}
      <div className="flex justify-between items-end mb-10">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-on-surface mb-2 font-headline">
            {t("title")}
          </h1>
          <p className="text-slate-500 font-medium">{t("subtitle")}</p>
        </div>
        <div className="flex items-center gap-6">
          {/* Search — design-draft line 155-158 */}
          <div className="relative flex items-center">
            <span className="material-symbols-outlined absolute left-3 text-slate-400 text-sm">
              search
            </span>
            <input
              className="bg-surface-container-low border-none rounded-full py-1.5 pl-9 pr-4 text-sm w-64 focus:ring-2 focus:ring-primary/20 placeholder-slate-400"
              placeholder={t("searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Link
            href="/templates/new"
            className="bg-gradient-to-r from-primary to-primary-container text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 shadow-xl shadow-indigo-500/20 hover:scale-[0.98] transition-all"
          >
            <span className="material-symbols-outlined text-lg">add_circle</span>
            {t("create")}
          </Link>
        </div>
      </div>

      {templates.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24">
          <div className="w-16 h-16 rounded-2xl bg-surface-container-high flex items-center justify-center mb-6">
            <span className="material-symbols-outlined text-3xl text-slate-400">description</span>
          </div>
          <h2 className="text-xl font-bold font-headline mb-2">{t("emptyTitle")}</h2>
          <p className="text-sm text-slate-500 mb-6 max-w-md text-center">{t("emptyDesc")}</p>
          <Link
            href="/templates/new"
            className="bg-gradient-to-r from-[#5443b9] to-[#6d5dd3] text-white px-5 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 shadow-lg shadow-primary/20"
          >
            <span className="material-symbols-outlined text-sm">add</span>
            {t("create")}
          </Link>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Table Section — design-draft line 185-275 */}
          <div className="bg-surface-container-lowest rounded-xl p-1 shadow-sm overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-container-low">
                  <th className="px-6 py-4 text-[10px] font-extrabold uppercase tracking-widest text-slate-500">
                    {t("templateName")}
                  </th>
                  <th className="px-6 py-4 text-[10px] font-extrabold uppercase tracking-widest text-slate-500">
                    {t("steps")}
                  </th>
                  <th className="px-6 py-4 text-[10px] font-extrabold uppercase tracking-widest text-slate-500">
                    {t("executionMode")}
                  </th>
                  <th className="px-6 py-4 text-[10px] font-extrabold uppercase tracking-widest text-slate-500">
                    {t("descriptionLabel")}
                  </th>
                  <th className="px-6 py-4 text-[10px] font-extrabold uppercase tracking-widest text-slate-500">
                    {t("updated")}
                  </th>
                  <th className="px-6 py-4" />
                </tr>
              </thead>
              <tbody className="divide-y divide-transparent">
                {filtered.map((tpl) => (
                  <tr
                    key={tpl.id}
                    className="group hover:bg-surface-container-low transition-colors duration-150 cursor-pointer"
                    onClick={() => router.push(`/templates/${tpl.id}`)}
                  >
                    <td className="px-6 py-5">
                      <span className="text-primary font-bold text-sm tracking-tight hover:underline">
                        {tpl.name}
                      </span>
                    </td>
                    <td className="px-6 py-5">
                      <span className="text-slate-600 text-xs font-medium">
                        {tpl.stepCount} {t("stepsUnit")}
                      </span>
                    </td>
                    <td className="px-6 py-5">{modeBadge(tpl.executionMode)}</td>
                    <td className="px-6 py-5 max-w-xs">
                      <p className="text-slate-500 text-xs truncate">{tpl.description || "—"}</p>
                    </td>
                    <td className="px-6 py-5">
                      <span className="text-slate-400 text-xs">{timeAgo(tpl.updatedAt)}</span>
                    </td>
                    <td className="px-6 py-5 text-right">
                      <span className="material-symbols-outlined text-slate-300 group-hover:text-primary transition-colors">
                        chevron_right
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-6 py-4 flex items-center justify-between bg-surface-container-low/30">
              <p className="text-xs text-slate-500 font-medium">
                {t("showing")} <span className="text-on-surface">{filtered.length}</span> {t("of")}{" "}
                <span className="text-on-surface">{templates.length}</span>
              </p>
            </div>
          </div>

          {/* Featured Section: Bento Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6">
            <div className="col-span-1 bg-surface-container-low p-6 rounded-xl relative overflow-hidden group">
              <div className="relative z-10">
                <h3 className="font-headline text-lg font-bold text-on-surface mb-1">
                  {t("templateStats")}
                </h3>
                <p className="text-xs text-slate-500 mb-4">{t("templateStatsDesc")}</p>
                <div className="flex items-end gap-4">
                  <div>
                    <span className="text-3xl font-black text-primary">{templates.length}</span>
                    <span className="text-[10px] text-slate-500 font-bold block">
                      {t("totalTemplates")}
                    </span>
                  </div>
                  <div>
                    <span className="text-3xl font-black text-secondary">
                      {templates.reduce((sum, tpl) => sum + tpl.stepCount, 0)}
                    </span>
                    <span className="text-[10px] text-slate-500 font-bold block">
                      {t("totalSteps")}
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
            <div className="col-span-2 bg-gradient-to-br from-primary to-indigo-800 p-6 rounded-xl text-white flex justify-between items-center relative overflow-hidden">
              <div className="relative z-10">
                <h3 className="font-headline text-lg font-bold mb-1">{t("ctaTitle")}</h3>
                <p className="text-xs text-white/70 mb-4 max-w-sm">{t("ctaDesc")}</p>
                <Link
                  href="/templates/new"
                  className="bg-white text-primary px-4 py-2 rounded-lg text-xs font-bold hover:bg-slate-100 transition-colors inline-block"
                >
                  {t("create")}
                </Link>
              </div>
              <div className="relative z-10 hidden lg:block">
                <div className="flex -space-x-3">
                  <div className="w-10 h-10 rounded-full border-2 border-white/20 bg-white/10 flex items-center justify-center backdrop-blur-md">
                    <span className="material-symbols-outlined text-sm">bolt</span>
                  </div>
                  <div className="w-10 h-10 rounded-full border-2 border-white/20 bg-white/10 flex items-center justify-center backdrop-blur-md">
                    <span className="material-symbols-outlined text-sm">api</span>
                  </div>
                  <div className="w-10 h-10 rounded-full border-2 border-white/20 bg-white/10 flex items-center justify-center backdrop-blur-md">
                    <span className="material-symbols-outlined text-sm">auto_awesome</span>
                  </div>
                </div>
              </div>
              <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -mr-20 -mt-20 blur-3xl" />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
