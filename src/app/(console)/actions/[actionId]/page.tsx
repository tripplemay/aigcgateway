"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useProject } from "@/hooks/use-project";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { timeAgo } from "@/lib/utils";

interface ActionVersion {
  id: string;
  versionNumber: number;
  messages: { role: string; content: string }[];
  variables: { name: string; description?: string; required: boolean; defaultValue?: string }[];
  changelog: string | null;
  createdAt: string;
}

interface ActionDetail {
  id: string;
  name: string;
  description: string | null;
  model: string;
  activeVersionId: string | null;
  versions: ActionVersion[];
  createdAt: string;
}

export default function ActionDetailPage() {
  const t = useTranslations("actions");
  const { current } = useProject();
  const params = useParams();
  const router = useRouter();
  const actionId = params.actionId as string;

  const [action, setAction] = useState<ActionDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    if (!current) return;
    setLoading(true);
    apiFetch<ActionDetail>(`/api/projects/${current.id}/actions/${actionId}`)
      .then(setAction)
      .catch(() => toast.error("Failed to load action"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, actionId]);

  const handleActivate = async (versionId: string) => {
    if (!current) return;
    try {
      await apiFetch(`/api/projects/${current.id}/actions/${actionId}/active-version`, {
        method: "PUT",
        body: JSON.stringify({ versionId }),
      });
      toast.success(t("versionActivated"));
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleDelete = async () => {
    if (!current || !confirm(t("confirmDelete"))) return;
    try {
      await apiFetch(`/api/projects/${current.id}/actions/${actionId}`, { method: "DELETE" });
      toast.success(t("deleted"));
      router.push("/actions");
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  if (loading || !action) {
    return (
      <div className="p-8 space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[400px] w-full rounded-xl" />
      </div>
    );
  }

  const activeVersion = action.versions.find((v) => v.id === action.activeVersionId);

  return (
    <main className="p-8 min-h-screen">
      {/* Breadcrumb & Top Bar — design-draft line 150-174 */}
      <header className="flex flex-col gap-6 mb-10">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Link href="/actions" className="hover:text-primary transition-colors">
            {t("title")}
          </Link>
          <span className="material-symbols-outlined text-xs">chevron_right</span>
          <span className="text-primary font-medium">{action.name}</span>
        </div>
        <div className="flex justify-between items-start">
          <div className="space-y-1">
            <div className="flex items-center gap-4">
              <h1 className="text-4xl font-headline font-bold tracking-tight text-on-background">
                {action.name}
              </h1>
              <span className="px-3 py-1 bg-surface-container-high text-primary rounded-full text-xs font-bold uppercase tracking-wider">
                {action.model.split("/").pop()}
              </span>
            </div>
            <p className="text-slate-600 text-lg max-w-2xl mt-2">
              {action.description || t("noDescription")}
            </p>
          </div>
          <div className="flex gap-3">
            <Link
              href={`/actions/new?edit=${actionId}`}
              className="px-5 py-2.5 bg-surface-container-low text-on-surface hover:bg-surface-container-high transition-colors font-semibold rounded-xl flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-sm">edit</span>
              {t("edit")}
            </Link>
            <button
              onClick={handleDelete}
              className="px-5 py-2.5 bg-surface-container-low text-error hover:bg-error/10 transition-colors font-semibold rounded-xl flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-sm">delete</span>
              {t("delete")}
            </button>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-12 gap-8">
        {/* Left Column — design-draft line 178-285 */}
        <div className="col-span-12 lg:col-span-8 space-y-8">
          {/* Active Version Section — design-draft line 180-243 */}
          {activeVersion && (
            <section className="bg-surface-container-lowest rounded-xl p-8 shadow-sm border border-outline-variant/10">
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                  <h2 className="text-xl font-headline font-bold">{t("activeVersion")}</h2>
                  <span className="bg-primary/10 text-primary text-xs font-black px-3 py-1 rounded-full border border-primary/20">
                    V{activeVersion.versionNumber}
                  </span>
                </div>
                <span className="text-xs uppercase tracking-widest text-slate-400">
                  {timeAgo(activeVersion.createdAt)}
                </span>
              </div>

              {/* Messages Preview — design-draft line 189-208 */}
              <div className="space-y-6 mb-10">
                {activeVersion.messages.map((msg, i) => (
                  <div
                    key={i}
                    className={
                      msg.role === "system"
                        ? "bg-surface-container-low p-5 rounded-xl rounded-tl-none border-l-4 border-primary/40"
                        : "bg-surface rounded-xl p-5 border border-outline-variant/20"
                    }
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="material-symbols-outlined text-sm text-primary">
                        {msg.role === "system"
                          ? "terminal"
                          : msg.role === "assistant"
                            ? "smart_toy"
                            : "person"}
                      </span>
                      <span className="text-xs font-black uppercase tracking-widest text-primary">
                        {msg.role === "system"
                          ? "System Message"
                          : msg.role === "assistant"
                            ? "Assistant"
                            : "User Prompt"}
                      </span>
                    </div>
                    <p className="text-on-surface leading-relaxed whitespace-pre-wrap">
                      {msg.content.split(/(\{\{[^}]+\}\})/).map((part, j) =>
                        part.startsWith("{{") ? (
                          <span
                            key={j}
                            className="text-[#6D5DD3] bg-[rgba(109,93,211,0.1)] font-mono px-1 py-0.5 rounded font-semibold"
                          >
                            {part}
                          </span>
                        ) : (
                          <span key={j}>{part}</span>
                        ),
                      )}
                    </p>
                  </div>
                ))}
              </div>

              {/* Variables Table — design-draft line 210-242 */}
              {activeVersion.variables.length > 0 && (
                <div>
                  <h3 className="text-sm font-black text-on-surface-variant uppercase tracking-widest mb-4">
                    {t("variableDefinitions")}
                  </h3>
                  <div className="overflow-hidden bg-surface-container-lowest">
                    <table className="w-full text-left">
                      <thead className="bg-surface-container-high/30">
                        <tr className="text-[10px] text-slate-500 font-black uppercase tracking-[0.1em]">
                          <th className="px-4 py-3">{t("varName")}</th>
                          <th className="px-4 py-3">{t("description")}</th>
                          <th className="px-4 py-3">{t("required")}</th>
                          <th className="px-4 py-3">{t("defaultValue")}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-surface-container-low">
                        {activeVersion.variables.map((v, i) => (
                          <tr
                            key={i}
                            className="hover:bg-surface-container-high/20 transition-colors"
                          >
                            <td className="px-4 py-4 font-mono text-xs text-primary font-bold">
                              {v.name}
                            </td>
                            <td className="px-4 py-4 text-sm text-slate-600">
                              {v.description || "—"}
                            </td>
                            <td className="px-4 py-4">
                              {v.required ? (
                                <span
                                  className="material-symbols-outlined text-primary"
                                  style={{ fontVariationSettings: "'FILL' 1" }}
                                >
                                  check_circle
                                </span>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                            <td className="px-4 py-4 text-xs font-mono text-slate-400">
                              {v.defaultValue || "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Version History — design-draft line 244-284 */}
          <section className="bg-surface-container-lowest rounded-xl p-8 shadow-sm border border-outline-variant/10">
            <h2 className="text-xl font-headline font-bold mb-6">{t("versionHistory")}</h2>
            <div className="space-y-4">
              {action.versions.map((v) => {
                const isActive = v.id === action.activeVersionId;
                return (
                  <div
                    key={v.id}
                    className={`flex items-center justify-between p-4 rounded-xl ${
                      isActive
                        ? "bg-surface border-l-4 border-primary"
                        : "bg-surface-container-low/30 hover:bg-surface-container-low transition-colors"
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                          isActive ? "bg-primary/10 text-primary" : "bg-slate-200 text-slate-600"
                        }`}
                      >
                        {v.versionNumber}
                      </div>
                      <div>
                        <h4 className="font-bold text-on-surface">
                          v{v.versionNumber}
                          {isActive && ` (${t("active")})`}
                        </h4>
                        <p className="text-xs text-slate-500">
                          {timeAgo(v.createdAt)}
                          {v.changelog && ` · "${v.changelog}"`}
                        </p>
                      </div>
                    </div>
                    {isActive ? (
                      <span className="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded font-bold">
                        {t("active")}
                      </span>
                    ) : (
                      <button
                        onClick={() => handleActivate(v.id)}
                        className="text-xs font-bold text-primary hover:underline px-3"
                      >
                        {t("activate")}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        {/* Right Column: Sidebar — design-draft line 288-367 */}
        <aside className="col-span-12 lg:col-span-4 space-y-6">
          {/* Action Insights Card — design-draft line 290-330 */}
          <div className="bg-surface-container-lowest rounded-xl p-6 shadow-sm border border-outline-variant/10 sticky top-8">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-6">
              {t("metadata")}
            </h3>
            <div className="space-y-6">
              <div className="flex items-center justify-between group">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-slate-400 group-hover:text-primary transition-colors">
                    calendar_today
                  </span>
                  <span className="text-sm font-medium text-slate-600">{t("createdAt")}</span>
                </div>
                <span className="text-sm font-bold text-on-surface">
                  {new Date(action.createdAt).toLocaleDateString()}
                </span>
              </div>
              <div className="flex items-center justify-between group">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-slate-400 group-hover:text-primary transition-colors">
                    layers
                  </span>
                  <span className="text-sm font-medium text-slate-600">{t("totalVersions")}</span>
                </div>
                <span className="text-sm font-bold text-on-surface">
                  {action.versions.length} total
                </span>
              </div>
              <div className="flex items-center justify-between group">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-slate-400 group-hover:text-primary transition-colors">
                    smart_toy
                  </span>
                  <span className="text-sm font-medium text-slate-600">{t("model")}</span>
                </div>
                <span className="text-sm font-bold text-on-surface font-mono">
                  {action.model.split("/").pop()}
                </span>
              </div>
            </div>
            {/* Decorative graphic — design-draft line 323-329 */}
            <div className="mt-8 rounded-lg overflow-hidden h-32 relative">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-secondary/10 z-10" />
              <div className="absolute bottom-2 left-2 z-20">
                <span className="text-[10px] font-black text-white bg-black/40 px-2 py-1 backdrop-blur rounded uppercase tracking-tighter">
                  System Health: Stable
                </span>
              </div>
            </div>
          </div>

          {/* Performance Matrix — design-draft line 332-359 */}
          <div className="bg-[#131b2e] rounded-xl p-6 shadow-xl text-white">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-6">
              Performance Matrix
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-white/5 rounded-xl border border-white/10">
                <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                  Versions
                </span>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-headline font-extrabold text-primary-fixed-dim">
                    {action.versions.length}
                  </span>
                  <span className="text-xs font-medium text-slate-400">total</span>
                </div>
              </div>
              <div className="p-4 bg-white/5 rounded-xl border border-white/10">
                <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                  Model
                </span>
                <div className="flex items-baseline gap-1">
                  <span className="text-sm font-headline font-extrabold text-primary-fixed-dim truncate">
                    {action.model.split("/").pop()}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Developer Quick-Link Card — design-draft line 361-367 */}
          <div className="bg-surface-container-high rounded-xl p-6 border border-primary/10">
            <h3 className="text-sm font-bold text-primary mb-3">Developer Quick-Link</h3>
            <div className="bg-on-background/5 p-3 rounded font-mono text-[11px] text-slate-600 break-all select-all cursor-pointer">
              POST /v1/actions/run
            </div>
            <p className="text-[10px] mt-2 text-slate-500 italic">Action ID: {action.id}</p>
          </div>
        </aside>
      </div>
    </main>
  );
}
