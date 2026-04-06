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
    <main className="p-8">
      {/* Breadcrumb */}
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
              <h1 className="text-4xl font-headline font-bold tracking-tight">{action.name}</h1>
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
        {/* Left: Content */}
        <div className="col-span-12 lg:col-span-8 space-y-8">
          {/* Active Version */}
          {activeVersion && (
            <section className="bg-surface-container-lowest rounded-xl p-8 shadow-sm border border-outline-variant/10">
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                  <h2 className="text-xl font-headline font-bold">{t("activeVersion")}</h2>
                  <span className="bg-primary/10 text-primary text-xs font-black px-3 py-1 rounded-full border border-primary/20">
                    v{activeVersion.versionNumber}
                  </span>
                </div>
                <span className="text-xs uppercase tracking-widest text-slate-400">
                  {timeAgo(activeVersion.createdAt)}
                </span>
              </div>

              {/* Messages Preview */}
              <div className="space-y-4 mb-8">
                {activeVersion.messages.map((msg, i) => (
                  <div
                    key={i}
                    className={`p-5 rounded-xl ${
                      msg.role === "system"
                        ? "bg-surface-container-low border-l-4 border-primary/40"
                        : "bg-surface border border-outline-variant/20"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="material-symbols-outlined text-sm text-primary">
                        {msg.role === "system"
                          ? "terminal"
                          : msg.role === "assistant"
                            ? "smart_toy"
                            : "person"}
                      </span>
                      <span className="text-[10px] font-black uppercase tracking-widest text-primary">
                        {msg.role}
                      </span>
                    </div>
                    <p className="text-on-surface leading-relaxed whitespace-pre-wrap">
                      {msg.content.split(/(\{\{[^}]+\}\})/).map((part, j) =>
                        part.startsWith("{{") ? (
                          <span
                            key={j}
                            className="bg-primary/10 text-primary px-1.5 py-0.5 rounded font-mono font-medium text-sm"
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

              {/* Variables Table */}
              {activeVersion.variables.length > 0 && (
                <div>
                  <h3 className="text-sm font-black text-on-surface-variant uppercase tracking-widest mb-4">
                    {t("variableDefinitions")}
                  </h3>
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
              )}
            </section>
          )}

          {/* Version History */}
          <section className="bg-surface-container-lowest rounded-xl p-8 shadow-sm border border-outline-variant/10">
            <h2 className="text-xl font-headline font-bold mb-6">{t("versionHistory")}</h2>
            <div className="space-y-4">
              {action.versions.map((v) => (
                <div
                  key={v.id}
                  className={`flex items-center justify-between p-4 bg-surface rounded-xl ${
                    v.id === action.activeVersionId
                      ? "border-l-4 border-primary"
                      : "border border-outline-variant/10"
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                      {v.versionNumber}
                    </div>
                    <div>
                      <h4 className="font-bold text-on-surface">
                        v{v.versionNumber}
                        {v.id === action.activeVersionId && ` (${t("active")})`}
                      </h4>
                      <p className="text-xs text-slate-500">
                        {v.changelog || "—"} · {timeAgo(v.createdAt)}
                      </p>
                    </div>
                  </div>
                  {v.id === action.activeVersionId ? (
                    <span className="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded font-bold">
                      {t("active")}
                    </span>
                  ) : (
                    <button
                      onClick={() => handleActivate(v.id)}
                      className="text-xs text-primary font-bold hover:underline"
                    >
                      {t("activate")}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Right: Metadata */}
        <div className="col-span-12 lg:col-span-4 space-y-6">
          <div className="bg-surface-container-lowest p-6 rounded-xl shadow-sm border border-outline-variant/10">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-6">
              {t("metadata")}
            </h4>
            <div className="space-y-5">
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase">{t("createdAt")}</p>
                <p className="text-sm font-medium mt-1">
                  {new Date(action.createdAt).toLocaleDateString()}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase">
                  {t("totalVersions")}
                </p>
                <p className="text-sm font-medium mt-1">{action.versions.length}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase">{t("model")}</p>
                <p className="text-sm font-mono font-medium mt-1">{action.model}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
