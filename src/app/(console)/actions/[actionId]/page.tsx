"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useProject } from "@/hooks/use-project";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";

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
}

export default function ActionDetailPage() {
  const t = useTranslations("actions");
  const { current } = useProject();
  const params = useParams();
  const actionId = params.actionId as string;

  const [action, setAction] = useState<ActionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [model, setModel] = useState("");

  const load = () => {
    if (!current) return;
    setLoading(true);
    apiFetch<ActionDetail>(`/api/projects/${current.id}/actions/${actionId}`)
      .then((d) => {
        setAction(d);
        setName(d.name);
        setDescription(d.description || "");
        setModel(d.model);
      })
      .catch(() => toast.error("Failed to load action"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, actionId]);

  const handleSave = async () => {
    if (!current) return;
    try {
      await apiFetch(`/api/projects/${current.id}/actions/${actionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, model }),
      });
      toast.success(t("updated"));
      setEditing(false);
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleActivate = async (versionId: string) => {
    if (!current) return;
    try {
      await apiFetch(`/api/projects/${current.id}/actions/${actionId}/active-version`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId }),
      });
      toast.success(t("versionActivated"));
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  if (loading || !action) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const activeVersion = action.versions.find((v) => v.id === action.activeVersionId);

  return (
    <div className="p-6 max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          {editing ? (
            <div className="space-y-2">
              <input
                className="text-2xl font-black tracking-tight font-[var(--font-heading)] bg-transparent border-b border-ds-primary outline-none"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <input
                className="block w-full text-sm text-slate-500 bg-transparent border-b border-slate-300 outline-none"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("descriptionPlaceholder")}
              />
              <input
                className="block w-full text-sm font-mono text-slate-600 bg-transparent border-b border-slate-300 outline-none"
                value={model}
                onChange={(e) => setModel(e.target.value)}
              />
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-black tracking-tight font-[var(--font-heading)]">
                {action.name}
              </h1>
              <p className="text-sm text-slate-500 mt-1">{action.description || "—"}</p>
              <p className="text-xs font-mono text-slate-400 mt-1">{action.model}</p>
            </>
          )}
        </div>
        <div className="flex gap-2">
          {editing ? (
            <>
              <button
                onClick={handleSave}
                className="px-4 py-2 rounded-xl bg-ds-primary text-white text-sm font-bold"
              >
                {t("save")}
              </button>
              <button
                onClick={() => setEditing(false)}
                className="px-4 py-2 rounded-xl border text-sm font-bold"
              >
                {t("cancel")}
              </button>
            </>
          ) : (
            <button
              onClick={() => setEditing(true)}
              className="px-4 py-2 rounded-xl border text-sm font-bold hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              {t("edit")}
            </button>
          )}
        </div>
      </div>

      {/* Active Version */}
      {activeVersion && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
              v{activeVersion.versionNumber}
            </span>
            <span className="text-xs text-slate-400">{t("activeVersion")}</span>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-bold text-slate-500">{t("messagesEditor")}</p>
            {activeVersion.messages.map((msg, i) => (
              <div key={i} className="flex gap-2 text-xs">
                <span className="font-bold text-ds-primary w-16 shrink-0">{msg.role}</span>
                <span className="text-slate-600 dark:text-slate-400 whitespace-pre-wrap">
                  {msg.content}
                </span>
              </div>
            ))}
          </div>

          {activeVersion.variables.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-bold text-slate-500">{t("variableDefinitions")}</p>
              {activeVersion.variables.map((v, i) => (
                <div key={i} className="text-xs text-slate-600 dark:text-slate-400">
                  <span className="font-mono font-bold">{`{{${v.name}}}`}</span>
                  {v.description && <span className="ml-2">{v.description}</span>}
                  {v.required && <span className="ml-2 text-red-400">{t("required")}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Version History */}
      <div className="space-y-3">
        <h2 className="text-lg font-bold">{t("versionHistory")}</h2>
        <div className="space-y-2">
          {action.versions.map((v) => (
            <div
              key={v.id}
              className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
            >
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold">v{v.versionNumber}</span>
                {v.id === action.activeVersionId && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400 font-bold">
                    {t("active")}
                  </span>
                )}
                {v.changelog && <span className="text-xs text-slate-500">{v.changelog}</span>}
              </div>
              {v.id !== action.activeVersionId && (
                <button
                  onClick={() => handleActivate(v.id)}
                  className="text-xs text-ds-primary font-bold hover:underline"
                >
                  {t("activate")}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
