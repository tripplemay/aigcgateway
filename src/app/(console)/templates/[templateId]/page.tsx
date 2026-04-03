"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useProject } from "@/hooks/use-project";
import { toast } from "sonner";

/* ── Types ── */

interface TemplateVariable {
  name: string;
  description: string;
  required: boolean;
  defaultValue?: string;
}

interface TemplateVersion {
  id: string;
  versionNumber: number;
  messages: { role: string; content: string }[];
  variables: TemplateVariable[];
  changelog: string | null;
  createdAt: string;
}

interface Template {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  activeVersionId: string | null;
  forkedFromId: string | null;
  createdAt: string;
  updatedAt: string;
  versions: TemplateVersion[];
}

/* ── Helpers ── */

const ROLE_STYLES: Record<string, { dot: string; label: string }> = {
  system: { dot: "bg-ds-primary", label: "text-ds-primary" },
  user: { dot: "bg-ds-secondary", label: "text-ds-secondary" },
  assistant: { dot: "bg-ds-tertiary", label: "text-ds-tertiary" },
};

function highlightVars(content: string): React.ReactNode[] {
  const parts = content.split(/({{[^}]+}})/g);
  return parts.map((part, i) =>
    part.startsWith("{{") ? (
      <span
        key={i}
        className="bg-ds-secondary-container/40 text-ds-primary-container px-1.5 py-0.5 rounded font-mono font-bold"
      >
        {part}
      </span>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* ── Component ── */

export default function TemplateDetailPage() {
  const t = useTranslations("templates");
  const tc = useTranslations("common");
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { current } = useProject();
  const templateId = params.templateId as string;
  const isPublicView = searchParams.get("public") === "true";

  const [template, setTemplate] = useState<Template | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");

  // New version state
  const [showNewVersion, setShowNewVersion] = useState(false);
  const [newMessages, setNewMessages] = useState("");
  const [newVariables, setNewVariables] = useState("");
  const [newChangelog, setNewChangelog] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!current) return;
    setLoading(true);
    try {
      const data = await apiFetch<Template>(
        `/api/projects/${current.id}/templates/${templateId}`,
      );
      setTemplate(data);
      setEditName(data.name);
      setEditDesc(data.description || "");
    } catch {
      toast.error(t("loadError"));
    } finally {
      setLoading(false);
    }
  }, [current, templateId, t]);

  useEffect(() => {
    if (current) load();
  }, [current, load]);

  const activeVersion = template?.versions.find((v) => v.id === template.activeVersionId) ??
    template?.versions[0] ?? null;

  const handleSaveMeta = async () => {
    if (!current || !template) return;
    try {
      const data = await apiFetch<Template>(
        `/api/projects/${current.id}/templates/${template.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ name: editName, description: editDesc }),
        },
      );
      setTemplate(data);
      setEditing(false);
      toast.success(t("saved"));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t("saveError"));
    }
  };

  const handleCreateVersion = async () => {
    if (!current || !template) return;
    setSaving(true);
    try {
      const messages = JSON.parse(newMessages);
      const variables = JSON.parse(newVariables);
      await apiFetch(`/api/projects/${current.id}/templates/${template.id}/versions`, {
        method: "POST",
        body: JSON.stringify({ messages, variables, changelog: newChangelog || undefined }),
      });
      toast.success(t("versionCreated"));
      setShowNewVersion(false);
      setNewMessages("");
      setNewVariables("");
      setNewChangelog("");
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t("saveError"));
    } finally {
      setSaving(false);
    }
  };

  const handleSetActive = async (versionId: string) => {
    if (!current || !template) return;
    try {
      const data = await apiFetch<Template>(
        `/api/projects/${current.id}/templates/${template.id}/active-version`,
        {
          method: "PATCH",
          body: JSON.stringify({ versionId }),
        },
      );
      setTemplate(data);
      toast.success(t("versionActivated"));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t("saveError"));
    }
  };

  const handleDelete = async () => {
    if (!current || !template) return;
    if (!confirm(t("confirmDelete"))) return;
    try {
      await apiFetch(`/api/projects/${current.id}/templates/${template.id}`, {
        method: "DELETE",
      });
      toast.success(t("deleted"));
      router.push("/templates");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t("deleteError"));
    }
  };

  if (loading || !template) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-pulse text-ds-outline">{tc("loading")}</div>
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto">
      {/* ═══ Header ═══ */}
      <section className="mb-10">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="max-w-3xl">
            <div className="flex items-center gap-3 mb-4">
              {template.category && (
                <span className="bg-ds-secondary-container text-ds-on-secondary-container px-3 py-1 rounded-full text-xs font-bold font-[var(--font-heading)] tracking-wider uppercase">
                  {template.category}
                </span>
              )}
              <span className="text-ds-outline text-xs font-medium">
                {t("createdOn")} {formatDate(template.createdAt)}
              </span>
            </div>
            {editing ? (
              <div className="space-y-3">
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="text-3xl font-extrabold font-[var(--font-heading)] text-ds-on-surface tracking-tight bg-transparent border-b-2 border-ds-primary focus:outline-none w-full"
                />
                <textarea
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  className="w-full text-ds-on-surface-variant text-base leading-relaxed bg-transparent border border-ds-outline-variant rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-ds-primary/20"
                  rows={2}
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveMeta}
                    className="px-4 py-2 bg-ds-primary text-white rounded-lg text-sm font-bold"
                  >
                    {tc("save")}
                  </button>
                  <button
                    onClick={() => setEditing(false)}
                    className="px-4 py-2 text-ds-on-surface-variant text-sm font-bold"
                  >
                    {tc("cancel")}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <h1 className="text-3xl font-extrabold font-[var(--font-heading)] text-ds-on-surface tracking-tight mb-3">
                  {template.name}
                </h1>
                {template.description && (
                  <p className="text-ds-on-surface-variant text-base leading-relaxed">
                    {template.description}
                  </p>
                )}
              </>
            )}
            {activeVersion && (
              <div className="flex items-center gap-6 mt-6">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-ds-primary">verified</span>
                  <span className="font-[var(--font-heading)] font-bold text-sm">
                    v{activeVersion.versionNumber}
                  </span>
                </div>
                <div className="h-4 w-px bg-ds-outline-variant/30" />
                <span className="text-ds-outline text-sm">
                  {template.versions.length} {t("versions")}
                </span>
              </div>
            )}
          </div>
          {!isPublicView && (
            <div className="flex items-center gap-3">
              <button
                onClick={() => setEditing(true)}
                className="px-6 py-2.5 border border-ds-outline-variant text-ds-primary font-bold rounded-xl hover:bg-ds-primary/5 transition-all"
              >
                {t("editTemplate")}
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2.5 text-ds-error font-bold rounded-xl hover:bg-ds-error/5 transition-all"
              >
                <span className="material-symbols-outlined text-sm">delete</span>
              </button>
            </div>
          )}
        </div>
      </section>

      {/* ═══ Grid: Content + Sidebar ═══ */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
        {/* ── Prompt Content (left) ── */}
        <div className="xl:col-span-8 space-y-8">
          {/* Messages */}
          <div className="bg-ds-surface-container-lowest rounded-xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-[var(--font-heading)] text-xl font-bold flex items-center gap-2">
                <span className="material-symbols-outlined text-ds-primary">chat_bubble</span>
                {t("promptContent")}
              </h2>
              {activeVersion && (
                <span className="text-[10px] font-bold bg-ds-surface-container text-ds-on-surface-variant px-2 py-1 rounded uppercase tracking-tighter">
                  Messages: {activeVersion.messages.length}
                </span>
              )}
            </div>
            <div className="space-y-6">
              {activeVersion?.messages.map((msg, i) => {
                const style = ROLE_STYLES[msg.role] ?? ROLE_STYLES.user;
                return (
                  <div key={i} className="group">
                    <div className="flex items-center gap-3 mb-2 px-2">
                      <div className={`w-2 h-2 rounded-full ${style.dot}`} />
                      <span
                        className={`text-xs font-black font-[var(--font-heading)] uppercase tracking-widest ${style.label}`}
                      >
                        {msg.role}
                      </span>
                    </div>
                    <div className="bg-ds-surface-container-low rounded-xl p-5 border-l-4 border-ds-primary/20 transition-all hover:bg-ds-surface-container-high/50">
                      <p className="text-sm leading-relaxed text-ds-on-surface">
                        {highlightVars(msg.content)}
                      </p>
                    </div>
                  </div>
                );
              })}
              {!activeVersion && (
                <p className="text-ds-outline text-center py-8">{t("noVersions")}</p>
              )}
            </div>
          </div>

          {/* New Version Form */}
          {!isPublicView && (
            <div className="bg-ds-surface-container-lowest rounded-xl shadow-sm overflow-hidden">
              <button
                onClick={() => setShowNewVersion(!showNewVersion)}
                className="w-full px-6 py-4 flex items-center justify-between hover:bg-ds-surface-container-low transition-colors"
              >
                <h3 className="font-[var(--font-heading)] font-bold text-sm flex items-center gap-2">
                  <span className="material-symbols-outlined text-ds-primary text-lg">add_circle</span>
                  {t("createNewVersion")}
                </h3>
                <span className="material-symbols-outlined text-slate-400">
                  {showNewVersion ? "expand_less" : "expand_more"}
                </span>
              </button>
              {showNewVersion && (
                <div className="p-6 border-t border-ds-outline-variant/10 space-y-4">
                  <div>
                    <label className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 block mb-2">
                      Messages (JSON)
                    </label>
                    <textarea
                      value={newMessages}
                      onChange={(e) => setNewMessages(e.target.value)}
                      placeholder={`[{"role": "system", "content": "..."}, {"role": "user", "content": "..."}]`}
                      className="w-full font-mono text-sm bg-ds-surface-container-low rounded-lg p-4 border-none focus:ring-2 focus:ring-ds-primary/20 outline-none min-h-[120px]"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 block mb-2">
                      Variables (JSON)
                    </label>
                    <textarea
                      value={newVariables}
                      onChange={(e) => setNewVariables(e.target.value)}
                      placeholder={`[{"name": "role", "description": "...", "required": true}]`}
                      className="w-full font-mono text-sm bg-ds-surface-container-low rounded-lg p-4 border-none focus:ring-2 focus:ring-ds-primary/20 outline-none min-h-[80px]"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 block mb-2">
                      Changelog
                    </label>
                    <input
                      value={newChangelog}
                      onChange={(e) => setNewChangelog(e.target.value)}
                      className="w-full text-sm bg-ds-surface-container-low rounded-lg px-4 py-3 border-none focus:ring-2 focus:ring-ds-primary/20 outline-none"
                      placeholder={t("changelogPlaceholder")}
                    />
                  </div>
                  <button
                    onClick={handleCreateVersion}
                    disabled={saving}
                    className="px-6 py-2.5 bg-ds-primary text-white font-bold rounded-xl shadow-md hover:opacity-90 transition-all disabled:opacity-50"
                  >
                    {saving ? tc("loading") : t("saveVersion")}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Sidebar (right) ── */}
        <div className="xl:col-span-4 space-y-8">
          {/* Parameters */}
          <div className="bg-ds-surface-container-low rounded-xl p-6 h-fit">
            <h2 className="font-[var(--font-heading)] text-xl font-bold mb-6 flex items-center gap-2">
              <span className="material-symbols-outlined text-ds-primary">settings_input_component</span>
              {t("parameters")}
            </h2>
            <div className="space-y-4">
              {activeVersion?.variables.map((v) => (
                <div key={v.name} className="bg-ds-surface-container-lowest p-4 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <code className="text-ds-primary-container font-bold text-sm">{`{{${v.name}}}`}</code>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded font-black uppercase ${
                        v.required
                          ? "bg-red-100 text-red-700"
                          : "bg-slate-200 text-slate-700"
                      }`}
                    >
                      {v.required ? t("required") : t("optional")}
                    </span>
                  </div>
                  {v.description && (
                    <p className="text-xs text-ds-outline font-medium">{v.description}</p>
                  )}
                  {v.defaultValue && (
                    <p className="text-xs text-ds-on-surface-variant mt-1">
                      {t("default")}: <code className="font-mono">{v.defaultValue}</code>
                    </p>
                  )}
                </div>
              ))}
              {(!activeVersion || activeVersion.variables.length === 0) && (
                <p className="text-ds-outline text-sm text-center py-4">{t("noVariables")}</p>
              )}
            </div>
          </div>

          {/* Version History */}
          <div className="bg-ds-surface-container-lowest rounded-xl shadow-sm p-6">
            <h3 className="font-[var(--font-heading)] font-bold text-sm mb-6 flex items-center justify-between">
              {t("versionHistory")}
              <span className="text-[10px] font-bold bg-ds-surface-container px-2 py-1 rounded text-slate-500 uppercase">
                {t("latest")}: v{template.versions[0]?.versionNumber ?? "—"}
              </span>
            </h3>
            <div className="space-y-4 relative before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-[1px] before:bg-ds-outline-variant/20">
              {template.versions.map((ver) => {
                const isActive = ver.id === template.activeVersionId;
                return (
                  <div key={ver.id} className="relative pl-8">
                    <div
                      className={`absolute left-0 top-1 w-5 h-5 rounded-full border-4 border-white shadow-sm ${
                        isActive ? "bg-green-500" : "bg-slate-300"
                      }`}
                    />
                    <div
                      className={`p-3 rounded-lg ${
                        isActive
                          ? "bg-green-50/50 border border-green-200/50"
                          : "hover:bg-ds-surface-container-low/50 cursor-pointer"
                      }`}
                      onClick={() => !isActive && !isPublicView && handleSetActive(ver.id)}
                    >
                      <div className="flex justify-between items-start mb-1">
                        <span
                          className={`text-xs font-bold flex items-center gap-1 ${
                            isActive ? "text-green-700" : "text-slate-700"
                          }`}
                        >
                          v{ver.versionNumber}
                          {isActive && (
                            <span className="bg-green-600 text-white text-[8px] px-1 rounded">
                              ACTIVE
                            </span>
                          )}
                        </span>
                        <span className="text-[10px] text-slate-400 font-medium">
                          {formatDate(ver.createdAt)}
                        </span>
                      </div>
                      {ver.changelog && (
                        <p className="text-[11px] text-slate-600">{ver.changelog}</p>
                      )}
                    </div>
                  </div>
                );
              })}
              {template.versions.length === 0 && (
                <p className="text-ds-outline text-sm text-center py-4 pl-0">{t("noVersions")}</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
