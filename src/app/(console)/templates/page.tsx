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

  const modeBadge = (mode: string) => {
    const styles: Record<string, string> = {
      sequential: "bg-indigo-100 text-indigo-700",
      "fan-out": "bg-amber-100 text-amber-700",
      single: "bg-slate-100 text-slate-600",
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
      <div className="flex justify-between items-end mb-10">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-on-surface mb-2 font-headline">
            {t("title")}
          </h1>
          <p className="text-slate-500 font-medium">{t("subtitle")}</p>
        </div>
        <Link
          href="/templates/new"
          className="bg-gradient-to-r from-primary to-primary-container text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 shadow-xl shadow-indigo-500/20 hover:scale-[0.98] transition-all"
        >
          <span className="material-symbols-outlined text-lg">add_circle</span>
          {t("create")}
        </Link>
      </div>

      {templates.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24">
          <div className="w-16 h-16 rounded-2xl bg-surface-container-high flex items-center justify-center mb-6">
            <span className="material-symbols-outlined text-3xl text-slate-400">extension</span>
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
              {templates.map((tpl) => (
                <tr
                  key={tpl.id}
                  className="group hover:bg-surface-container-low transition-colors duration-150 cursor-pointer"
                  onClick={() => router.push(`/templates/${tpl.id}`)}
                >
                  <td className="px-6 py-5">
                    <span className="text-primary font-bold text-sm tracking-tight">
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
              {t("showing")} <span className="text-on-surface">{templates.length}</span>
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
