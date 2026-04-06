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
  usedInTemplates?: number;
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
      {/* Breadcrumb — design-draft line 170-174 */}
      <nav className="flex items-center gap-2 mb-6 text-sm">
        <Link href="/actions" className="text-slate-500 hover:text-primary transition-colors">
          {t("title")}
        </Link>
        <span className="material-symbols-outlined text-slate-400 text-sm">chevron_right</span>
        <span className="text-primary font-semibold">{action.name}</span>
      </nav>

      {/* Header — design-draft line 177-201 */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10">
        <div>
          <div className="flex items-center gap-4 mb-2">
            <h1 className="text-4xl font-black tracking-tight text-on-surface font-headline">
              {action.name}
            </h1>
            <span className="px-3 py-1 bg-surface-container-high text-primary rounded-full text-xs font-black uppercase tracking-widest">
              {action.model.split("/").pop()}
            </span>
          </div>
          <p className="text-on-surface-variant max-w-2xl leading-relaxed">
            {action.description || t("noDescription")}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Delete — design-draft line 188-191 */}
          <button
            onClick={handleDelete}
            className="flex items-center gap-2 px-5 py-2.5 border border-error text-error rounded-xl font-bold hover:bg-error-container/20 transition-all"
          >
            <span className="material-symbols-outlined text-xl">delete</span>
            <span>{t("delete")}</span>
          </button>
          {/* Edit — design-draft line 192-195 */}
          <Link
            href={`/actions/new?edit=${actionId}`}
            className="flex items-center gap-2 px-5 py-2.5 bg-surface-container-low text-on-surface rounded-xl font-bold hover:bg-surface-container-high transition-all"
          >
            <span className="material-symbols-outlined text-xl">edit</span>
            <span>{t("edit")}</span>
          </Link>
          {/* New Version — design-draft line 196-199 */}
          <Link
            href={`/actions/new?newVersion=${actionId}`}
            className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-primary to-primary-container text-white rounded-xl font-bold shadow-lg shadow-primary/20 hover:scale-[0.98] transition-all"
          >
            <span className="material-symbols-outlined text-xl">add_circle</span>
            <span>{t("newVersion")}</span>
          </Link>
        </div>
      </div>

      {/* Dashboard Grid — design-draft line 204 */}
      <div className="grid grid-cols-12 gap-8 items-start">
        {/* Left Column — design-draft line 207-317 */}
        <div className="col-span-12 lg:col-span-8 space-y-8">
          {/* Active Version Card — design-draft line 210-272 */}
          {activeVersion && (
            <section className="bg-surface-container-lowest rounded-xl p-8 shadow-sm ring-1 ring-on-surface/5">
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                  <h2 className="text-xl font-black text-on-surface">{t("activeVersion")}</h2>
                  <span className="px-3 py-0.5 bg-primary/10 text-primary rounded-full text-xs font-bold">
                    V{activeVersion.versionNumber}
                  </span>
                </div>
                <span className="text-sm text-slate-400 font-medium">
                  {timeAgo(activeVersion.createdAt)}
                </span>
              </div>

              {/* Messages — design-draft line 220-239 */}
              <div className="space-y-6 mb-10">
                {activeVersion.messages.map((msg, i) => (
                  <div
                    key={i}
                    className={
                      msg.role === "system"
                        ? "border-l-4 border-primary/40 bg-surface-container-low p-5 rounded-r-xl"
                        : "border-l-4 border-slate-200 bg-white p-5 rounded-r-xl ring-1 ring-inset ring-slate-100"
                    }
                  >
                    <div
                      className={`flex items-center gap-2 mb-3 ${msg.role === "system" ? "text-primary" : "text-slate-500"}`}
                    >
                      <span className="material-symbols-outlined text-lg">
                        {msg.role === "system"
                          ? "terminal"
                          : msg.role === "assistant"
                            ? "smart_toy"
                            : "person"}
                      </span>
                      <span className="text-[10px] font-black uppercase tracking-widest">
                        {msg.role === "system"
                          ? "System Message"
                          : msg.role === "assistant"
                            ? "Assistant"
                            : "User Prompt"}
                      </span>
                    </div>
                    <p className="text-sm text-on-surface leading-relaxed whitespace-pre-wrap">
                      {msg.content.split(/(\{\{[^}]+\}\})/).map((part, j) =>
                        part.startsWith("{{") ? (
                          <span
                            key={j}
                            className="bg-primary/10 text-primary font-mono rounded px-1.5 py-0.5 mx-0.5 text-xs font-bold"
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

              {/* Variables Table — design-draft line 243-271 */}
              {activeVersion.variables.length > 0 && (
                <div className="mt-8">
                  <h3 className="text-[11px] font-black uppercase tracking-[0.15em] text-slate-400 mb-4">
                    {t("variableDefinitions")}
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="text-on-surface-variant/60 font-bold border-b border-outline-variant/10">
                          <th className="pb-3 px-2">{t("varName")}</th>
                          <th className="pb-3 px-2">{t("description")}</th>
                          <th className="pb-3 px-2">{t("required")}</th>
                          <th className="pb-3 px-2">{t("defaultValue")}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-outline-variant/10">
                        {activeVersion.variables.map((v, i) => (
                          <tr
                            key={i}
                            className="group hover:bg-surface-container-high/30 transition-colors"
                          >
                            <td className="py-4 px-2 font-mono text-primary font-bold">{v.name}</td>
                            <td className="py-4 px-2 text-on-surface-variant">
                              {v.description || "\u2014"}
                            </td>
                            <td className="py-4 px-2">
                              {v.required ? (
                                <span
                                  className="material-symbols-outlined text-primary text-lg"
                                  style={{ fontVariationSettings: "'FILL' 1" }}
                                >
                                  check_circle
                                </span>
                              ) : (
                                <span className="text-slate-400">{"\u2014"}</span>
                              )}
                            </td>
                            <td className="py-4 px-2 text-slate-400">
                              {v.defaultValue || "\u2014"}
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

          {/* Version History — design-draft line 275-317 (vertical timeline) */}
          <section className="bg-surface-container-lowest rounded-xl p-8 shadow-sm ring-1 ring-on-surface/5">
            <h2 className="text-xl font-black text-on-surface mb-8">{t("versionHistory")}</h2>
            <div className="relative space-y-10 pl-6">
              {/* Connecting Line */}
              <div className="absolute left-2.5 top-2 bottom-2 w-0.5 bg-slate-100" />

              {action.versions.map((v) => {
                const isActive = v.id === action.activeVersionId;
                return (
                  <div key={v.id} className="relative">
                    {/* Timeline node */}
                    <div
                      className={`absolute -left-6 top-1.5 w-5 h-5 rounded-full ${
                        isActive
                          ? "bg-primary ring-4 ring-primary/20 shadow-[0_0_15px_rgba(84,67,185,0.4)]"
                          : "bg-white ring-2 ring-slate-200"
                      }`}
                    />
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-3">
                          <span className="font-black text-on-surface">
                            v{v.versionNumber}
                            {isActive ? ` (${t("active")})` : ""}
                          </span>
                          {isActive && (
                            <span className="px-2 py-0.5 bg-primary/10 text-primary rounded-md text-[10px] font-black uppercase tracking-wider">
                              {t("active")}
                            </span>
                          )}
                        </div>
                        {!isActive && (
                          <p className="text-xs text-slate-400 mt-1">
                            {timeAgo(v.createdAt)}
                            {v.changelog && ` \u00B7 ${v.changelog}`}
                          </p>
                        )}
                      </div>
                      {isActive ? (
                        <span className="text-xs text-slate-400 font-medium">
                          {timeAgo(v.createdAt)}
                        </span>
                      ) : (
                        <button
                          onClick={() => handleActivate(v.id)}
                          className="text-xs font-bold text-primary hover:underline underline-offset-4"
                        >
                          {t("rollback")}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        {/* Right Column — design-draft line 321-393 */}
        <div className="col-span-12 lg:col-span-4 space-y-8 sticky top-24">
          {/* Action Insights — design-draft line 324-364 */}
          <section className="bg-surface-container-lowest rounded-xl p-6 shadow-sm ring-1 ring-on-surface/5">
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-6">
              {t("actionInsights")}
            </h3>
            <div className="space-y-5">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center text-slate-500">
                  <span className="material-symbols-outlined text-xl">calendar_today</span>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    {t("created")}
                  </p>
                  <p className="text-sm font-bold text-on-surface">
                    {new Date(action.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center text-slate-500">
                  <span className="material-symbols-outlined text-xl">history</span>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    {t("lastUpdated")}
                  </p>
                  <p className="text-sm font-bold text-secondary">
                    {timeAgo(action.versions[0]?.createdAt ?? action.createdAt)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center text-slate-500">
                  <span className="material-symbols-outlined text-xl">layers</span>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    {t("versions")}
                  </p>
                  <p className="text-sm font-bold text-on-surface">
                    {action.versions.length} total
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center text-slate-500">
                  <span className="material-symbols-outlined text-xl">link</span>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    {t("usageLabel")}
                  </p>
                  <p className="text-sm font-bold text-on-surface">
                    {t("usedInTemplates", { count: action.usedInTemplates ?? 0 })}
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Developer Quick-Link — design-draft line 367-381 */}
          <section className="bg-surface-container-high rounded-xl p-6 border border-primary/10">
            <div className="flex items-center gap-2 mb-4">
              <span className="material-symbols-outlined text-primary text-xl">terminal</span>
              <h3 className="text-sm font-bold text-primary">{t("devQuickLink")}</h3>
            </div>
            <div className="bg-on-background/5 p-3 rounded font-mono text-[11px] text-on-surface border border-on-background/10 mb-3 overflow-x-auto">
              POST /v1/actions/run
            </div>
            <p className="italic text-[10px] text-slate-500 px-1">Action ID: {action.id}</p>
          </section>

          {/* Support Documentation Teaser — design-draft line 384-392 */}
          <div className="p-6 bg-gradient-to-br from-secondary/5 to-primary/5 rounded-xl border border-outline-variant/10">
            <p className="text-xs text-slate-600 mb-4 leading-relaxed">{t("docsTeaser")}</p>
            <Link
              href="/quickstart"
              className="inline-flex items-center gap-1 text-xs font-black text-primary hover:gap-2 transition-all"
            >
              {t("viewDocs")}
              <span className="material-symbols-outlined text-sm">arrow_forward</span>
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
