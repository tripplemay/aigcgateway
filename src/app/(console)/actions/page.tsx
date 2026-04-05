"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useProject } from "@/hooks/use-project";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface ActionRow {
  id: string;
  name: string;
  description: string | null;
  model: string;
  activeVersion: { id: string; versionNumber: number } | null;
  updatedAt: string;
}

export default function ActionsPage() {
  const t = useTranslations("actions");
  const { current, loading: projLoading } = useProject();
  const router = useRouter();

  const [actions, setActions] = useState<ActionRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!current) return;
    setLoading(true);
    apiFetch<{ data: ActionRow[] }>(`/api/projects/${current.id}/actions?pageSize=100`)
      .then((d) => setActions(d.data))
      .catch(() => setActions([]))
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

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight font-[var(--font-heading)]">
            {t("title")}
          </h1>
          <p className="text-sm text-slate-500 mt-1">{t("subtitle")}</p>
        </div>
        <Link
          href="/actions/new"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-ds-primary text-white text-sm font-bold shadow-lg shadow-ds-primary/20 hover:opacity-90 transition"
        >
          <span className="material-symbols-outlined text-sm">add</span>
          {t("create")}
        </Link>
      </div>

      {/* List */}
      {actions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20">
          <span className="material-symbols-outlined text-4xl text-slate-300 mb-4">bolt</span>
          <h2 className="text-lg font-bold mb-1">{t("emptyTitle")}</h2>
          <p className="text-sm text-slate-500 mb-4">{t("emptyDesc")}</p>
          <button
            onClick={() => router.push("/actions/new")}
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
                <th className="text-left px-4 py-3 font-bold text-slate-500">{t("name")}</th>
                <th className="text-left px-4 py-3 font-bold text-slate-500">{t("model")}</th>
                <th className="text-left px-4 py-3 font-bold text-slate-500">{t("version")}</th>
                <th className="text-left px-4 py-3 font-bold text-slate-500">{t("description")}</th>
              </tr>
            </thead>
            <tbody>
              {actions.map((action) => (
                <tr
                  key={action.id}
                  className="border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30 cursor-pointer transition"
                  onClick={() => router.push(`/actions/${action.id}`)}
                >
                  <td className="px-4 py-3 font-bold text-ds-primary">{action.name}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400 font-mono text-xs">
                    {action.model}
                  </td>
                  <td className="px-4 py-3">
                    {action.activeVersion ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
                        v{action.activeVersion.versionNumber}
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-500 truncate max-w-xs">
                    {action.description || "—"}
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
