"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useProject } from "@/hooks/use-project";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface TemplateRow {
  id: string;
  name: string;
  description: string | null;
  stepCount: number;
  executionMode: string;
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
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const modeLabel = (mode: string) => {
    switch (mode) {
      case "sequential":
        return t("modeSequential");
      case "fan-out":
        return t("modeFanout");
      default:
        return t("modeSingle");
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight font-[var(--font-heading)]">
            {t("title")}
          </h1>
          <p className="text-sm text-slate-500 mt-1">{t("subtitle")}</p>
        </div>
        <Link
          href="/templates/new"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-ds-primary text-white text-sm font-bold shadow-lg shadow-ds-primary/20 hover:opacity-90 transition"
        >
          <span className="material-symbols-outlined text-sm">add</span>
          {t("create")}
        </Link>
      </div>

      {templates.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20">
          <span className="material-symbols-outlined text-4xl text-slate-300 mb-4">extension</span>
          <h2 className="text-lg font-bold mb-1">{t("emptyTitle")}</h2>
          <p className="text-sm text-slate-500 mb-4">{t("emptyDesc")}</p>
          <button
            onClick={() => router.push("/templates/new")}
            className="px-4 py-2 rounded-xl bg-ds-primary text-white text-sm font-bold"
          >
            {t("create")}
          </button>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                <th className="text-left px-4 py-3 font-bold text-slate-500">
                  {t("templateName")}
                </th>
                <th className="text-left px-4 py-3 font-bold text-slate-500">{t("steps")}</th>
                <th className="text-left px-4 py-3 font-bold text-slate-500">
                  {t("executionMode")}
                </th>
                <th className="text-left px-4 py-3 font-bold text-slate-500">
                  {t("descriptionLabel")}
                </th>
              </tr>
            </thead>
            <tbody>
              {templates.map((tpl) => (
                <tr
                  key={tpl.id}
                  className="border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30 cursor-pointer transition"
                  onClick={() => router.push(`/templates/${tpl.id}`)}
                >
                  <td className="px-4 py-3 font-bold text-ds-primary">{tpl.name}</td>
                  <td className="px-4 py-3">{tpl.stepCount}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                      {modeLabel(tpl.executionMode)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500 truncate max-w-xs">
                    {tpl.description || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
