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
  const [search, setSearch] = useState("");

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

  const filtered = search
    ? actions.filter(
        (a) =>
          a.name.toLowerCase().includes(search.toLowerCase()) ||
          a.description?.toLowerCase().includes(search.toLowerCase()),
      )
    : actions;

  return (
    <>
      {/* Header — design-draft line 144-162 */}
      <header className="sticky top-0 z-40 bg-[#faf8ff] dark:bg-slate-950 flex justify-between items-center w-full px-8 py-4 shadow-[0px_20px_40px_rgba(19,27,46,0.04)]">
        <div>
          <h2 className="text-2xl font-black text-[#131b2e] dark:text-slate-100 font-headline tracking-[-0.02em]">
            {t("title")}
          </h2>
          <p className="text-sm text-slate-500 font-medium">{t("subtitle")}</p>
        </div>
        <div className="flex items-center gap-6">
          {/* Search — design-draft line 150-153 */}
          <div className="relative group">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">
              search
            </span>
            <input
              className="pl-10 pr-4 py-2 bg-surface-container-low border-none rounded-xl text-sm w-64 focus:ring-2 focus:ring-primary/20 transition-all"
              placeholder={t("searchPlaceholder")}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {/* Notification & Help — design-draft line 154-157 */}
          <div className="flex items-center gap-4 text-slate-500">
            <button className="hover:text-primary transition-colors">
              <span className="material-symbols-outlined">notifications</span>
            </button>
            <button className="hover:text-primary transition-colors">
              <span className="material-symbols-outlined">help_outline</span>
            </button>
          </div>
          {/* Create button — design-draft line 158-161 */}
          <Link
            href="/actions/new"
            className="bg-gradient-to-r from-[#5443b9] to-[#6d5dd3] text-white px-5 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 hover:opacity-90 transition-all active:scale-95 shadow-lg shadow-primary/20"
          >
            <span className="material-symbols-outlined text-sm">add</span>
            {t("create")}
          </Link>
        </div>
      </header>

      {/* Section — design-draft line 164-328 */}
      <section className="p-8 space-y-8 flex-1">
        {actions.length === 0 ? (
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
            {/* Left: Table — design-draft line 166-268 */}
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
                    {filtered.map((action) => {
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
                {/* Pagination footer — design-draft line 248-254 */}
                <div className="px-6 py-4 flex items-center justify-between bg-surface-container-low/30">
                  <p className="text-xs text-slate-500 font-medium">
                    {t("showing")} <span className="text-on-surface">{filtered.length}</span>{" "}
                    {t("of")} <span className="text-on-surface">{actions.length}</span>{" "}
                    {t("actionsUnit")}
                  </p>
                  <div className="flex gap-2">
                    <button className="px-3 py-1.5 rounded-lg bg-surface text-slate-400 border border-outline-variant/30 cursor-not-allowed">
                      <span className="material-symbols-outlined text-sm">chevron_left</span>
                    </button>
                    <button className="px-3 py-1.5 rounded-lg bg-surface text-slate-600 border border-outline-variant/30 hover:bg-slate-50 transition-colors">
                      <span className="material-symbols-outlined text-sm">chevron_right</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* CTA banner — design-draft line 256-268 */}
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

            {/* Right sidebar — design-draft line 270-327 */}
            <div className="col-span-12 lg:col-span-3 space-y-6">
              {/* Action Latency — design-draft line 271-297 */}
              <div className="bg-surface-container-lowest p-6 rounded-xl shadow-sm">
                <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-4">
                  Action Latency
                </h4>
                <div className="flex items-end gap-1.5 h-32 mb-4">
                  {[60, 45, 80, 65, 40, 90, 75].map((h, i) => (
                    <div
                      key={i}
                      className={`flex-1 rounded-t-lg transition-all hover:bg-primary-container ${i === 3 ? "bg-primary-container" : "bg-surface-container-high"}`}
                      style={{ height: `${h}%` }}
                    />
                  ))}
                </div>
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-2xl font-black font-headline text-on-surface">
                      {actions.length}
                    </p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">
                      {t("totalActions")}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-black font-headline text-on-surface">
                      {actions.filter((a) => a.activeVersion).length}
                    </p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">
                      {t("withActiveVersion")}
                    </p>
                  </div>
                </div>
              </div>

              {/* Action Health — design-draft line 298-319 */}
              <div className="bg-surface-container-lowest p-6 rounded-xl shadow-sm relative overflow-hidden">
                <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-6">
                  Action Health
                </h4>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold">{t("successful")}</span>
                    <span className="text-xs font-black text-primary">—</span>
                  </div>
                  <div className="w-full bg-surface-container-high h-1.5 rounded-full overflow-hidden">
                    <div className="bg-primary h-full rounded-full" style={{ width: "100%" }} />
                  </div>
                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <div>
                      <p className="text-lg font-bold font-headline">{actions.length}</p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase">
                        {t("totalActions")}
                      </p>
                    </div>
                    <div>
                      <p className="text-lg font-bold font-headline">
                        {new Set(actions.map((a) => a.model)).size}
                      </p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase">
                        {t("uniqueModels")}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Promo card — design-draft line 320-327 */}
              <div className="rounded-xl overflow-hidden shadow-sm aspect-square relative group cursor-pointer bg-gradient-to-br from-primary/20 to-secondary/10">
                <div className="absolute inset-0 bg-gradient-to-t from-on-surface/90 to-transparent p-6 flex flex-col justify-end">
                  <p className="text-white text-sm font-bold mb-1">Vertex AI integration</p>
                  <p className="text-slate-300 text-[10px]">
                    Supports specialized models for healthcare and finance industries.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
