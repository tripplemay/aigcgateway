"use client";
import { useEffect, useState } from "react";
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
      <div className="p-8 space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-[400px] w-full rounded-xl" />
      </div>
    );
  }

  return (
    <section className="p-8 space-y-8 flex-1">
      {actions.length === 0 ? (
        /* Empty state */
        <div className="flex flex-col items-center justify-center py-24">
          <div className="w-16 h-16 rounded-2xl bg-surface-container-high flex items-center justify-center mb-6">
            <span className="material-symbols-outlined text-3xl text-slate-400">bolt</span>
          </div>
          <h2 className="text-xl font-bold font-headline mb-2">{t("emptyTitle")}</h2>
          <p className="text-sm text-slate-500 mb-6 max-w-md text-center">{t("emptyDesc")}</p>
          <Link
            href="/actions/new"
            className="bg-gradient-to-r from-[#5443b9] to-[#6d5dd3] text-white px-5 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 hover:opacity-90 transition-all active:scale-95 shadow-lg shadow-primary/20"
          >
            <span className="material-symbols-outlined text-sm">add</span>
            {t("create")}
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-12 gap-8">
          {/* Main table — 9 cols */}
          <div className="col-span-12 lg:col-span-9 space-y-6">
            <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-container-low/50">
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                      {t("name")}
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
                    <th className="px-6 py-4" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {actions.map((action) => {
                    const varCount =
                      action.versions?.[0]?.variables
                        ? (action.versions[0].variables as unknown[]).length
                        : 0;
                    return (
                      <tr
                        key={action.id}
                        className="hover:bg-surface-container-high transition-colors group cursor-pointer"
                        onClick={() => router.push(`/actions/${action.id}`)}
                      >
                        <td className="px-6 py-5 font-bold text-primary">{action.name}</td>
                        <td className="px-6 py-5 text-sm font-medium text-slate-700 dark:text-slate-300">
                          {action.model.split("/").pop()}
                        </td>
                        <td className="px-6 py-5">
                          {action.activeVersion ? (
                            <span className="px-2 py-0.5 rounded-full bg-secondary-container text-on-secondary-container text-[10px] font-bold">
                              v{action.activeVersion.versionNumber}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-6 py-5 text-center">
                          <span className="px-2 py-0.5 rounded-lg bg-surface-container-low text-slate-600 text-xs font-bold border border-outline-variant/30">
                            {varCount}
                          </span>
                        </td>
                        <td className="px-6 py-5 text-xs text-slate-500 max-w-[200px] truncate">
                          {action.description || "—"}
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
              <div className="px-6 py-4 flex items-center justify-between bg-surface-container-low/30">
                <p className="text-xs text-slate-500 font-medium">
                  {t("showing")} <span className="text-on-surface">{actions.length}</span>
                </p>
              </div>
            </div>
          </div>

          {/* Sidebar stats — 3 cols */}
          <div className="col-span-12 lg:col-span-3 space-y-6">
            <div className="bg-surface-container-lowest p-6 rounded-xl shadow-sm">
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-4">
                {t("statsTitle")}
              </h4>
              <div className="space-y-4">
                <div>
                  <p className="text-2xl font-black font-headline text-on-surface">
                    {actions.length}
                  </p>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">
                    {t("totalActions")}
                  </p>
                </div>
                <div>
                  <p className="text-2xl font-black font-headline text-on-surface">
                    {actions.filter((a) => a.activeVersion).length}
                  </p>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">
                    {t("withActiveVersion")}
                  </p>
                </div>
                <div>
                  <p className="text-2xl font-black font-headline text-on-surface">
                    {new Set(actions.map((a) => a.model)).size}
                  </p>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">
                    {t("uniqueModels")}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
