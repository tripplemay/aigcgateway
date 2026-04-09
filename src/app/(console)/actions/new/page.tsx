"use client";
import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useProject } from "@/hooks/use-project";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";

interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

interface VarDef {
  name: string;
  description: string;
  required: boolean;
  defaultValue: string;
}

const ROLE_STYLE: Record<string, string> = {
  system: "bg-ds-on-surface/5 text-ds-on-surface-variant",
  user: "bg-ds-primary/5 text-ds-primary",
  assistant: "bg-ds-secondary/5 text-ds-secondary",
};

export default function NewActionPage() {
  const t = useTranslations("actions");
  const { current } = useProject();
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit");
  const newVersionId = searchParams.get("newVersion");
  const sourceActionId = editId || newVersionId;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [model, setModel] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    { role: "system", content: "" },
    { role: "user", content: "" },
  ]);
  const [variables, setVariables] = useState<VarDef[]>([]);
  const [changelog, setChangelog] = useState("");
  const [saving, setSaving] = useState(false);
  const [availableModels, setAvailableModels] = useState<string[]>([]);

  // Load existing action data in edit/newVersion mode
  useEffect(() => {
    if (!current || !sourceActionId) return;
    apiFetch<{
      name: string;
      description: string | null;
      model: string;
      activeVersionId: string | null;
      versions: {
        id: string;
        messages: Message[];
        variables: VarDef[];
      }[];
    }>(`/api/projects/${current.id}/actions/${sourceActionId}`)
      .then((data) => {
        setName(data.name);
        setDescription(data.description || "");
        setModel(data.model);
        const activeVer =
          data.versions.find((v) => v.id === data.activeVersionId) ?? data.versions[0];
        if (activeVer) {
          setMessages(activeVer.messages);
          setVariables(
            activeVer.variables.map((v) => ({
              name: v.name,
              description: v.description || "",
              required: v.required,
              defaultValue: v.defaultValue || "",
            })),
          );
        }
      })
      .catch(() => toast.error(t("loadFailed")));
  }, [current, sourceActionId, t]);

  // Fetch available models for dropdown
  useEffect(() => {
    fetch("/v1/models")
      .then((r) => r.json())
      .then((d: { data: { id: string }[] }) => {
        setAvailableModels(d.data.map((m) => m.id));
      })
      .catch(() => {});
  }, []);

  const addMessage = () => setMessages([...messages, { role: "user", content: "" }]);
  const removeMessage = (i: number) => setMessages(messages.filter((_, idx) => idx !== i));
  const updateMessage = (i: number, field: keyof Message, value: string) => {
    const updated = [...messages];
    updated[i] = { ...updated[i], [field]: value };
    setMessages(updated);
  };

  const addVariable = () =>
    setVariables([...variables, { name: "", description: "", required: true, defaultValue: "" }]);
  const removeVariable = (i: number) => setVariables(variables.filter((_, idx) => idx !== i));
  const updateVariable = (i: number, field: keyof VarDef, value: string | boolean) => {
    const updated = [...variables];
    updated[i] = { ...updated[i], [field]: value };
    setVariables(updated);
  };

  // Auto-detect variables from message content
  const detectedVars = new Set<string>();
  messages.forEach((m) => {
    const matches = m.content.matchAll(/\{\{(\w+)\}\}/g);
    for (const match of matches) detectedVars.add(match[1]);
  });

  const handleSubmit = async () => {
    if (!current) return;
    if (!name.trim()) return toast.error(t("nameRequired"));
    if (!model.trim()) return toast.error(t("modelRequired"));
    if (messages.every((m) => !m.content.trim())) return toast.error(t("messagesRequired"));

    setSaving(true);
    try {
      if (newVersionId) {
        await apiFetch(`/api/projects/${current.id}/actions/${newVersionId}/versions`, {
          method: "POST",
          body: JSON.stringify({ messages, variables, changelog }),
        });
        toast.success(t("updated"));
        router.push(`/actions/${newVersionId}`);
      } else if (editId) {
        await apiFetch(`/api/projects/${current.id}/actions/${editId}`, {
          method: "PUT",
          body: JSON.stringify({ name, description, model }),
        });
        await apiFetch(`/api/projects/${current.id}/actions/${editId}/versions`, {
          method: "POST",
          body: JSON.stringify({ messages, variables, changelog }),
        });
        toast.success(t("updated"));
        router.push(`/actions/${editId}`);
      } else {
        const data = await apiFetch<{ id: string }>(`/api/projects/${current.id}/actions`, {
          method: "POST",
          body: JSON.stringify({ name, description, model, messages, variables, changelog }),
        });
        toast.success(t("created"));
        router.push(`/actions/${data.id}`);
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const roleLabel: Record<string, string> = {
    system: "system",
    user: "user",
    assistant: "assistant",
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* ═══ Breadcrumb ═══ */}
      <nav className="flex items-center text-sm gap-2">
        <Link href="/actions" className="text-slate-500 hover:text-ds-primary transition-colors">
          {t("title")}
        </Link>
        <span className="material-symbols-outlined text-slate-400 text-sm">chevron_right</span>
        <span className="text-ds-primary font-semibold">
          {newVersionId ? t("newVersion") : editId ? t("editTitle") : t("createTitle")}
        </span>
      </nav>

      {/* ═══ Page Header ═══ */}
      <div>
        <h1 className="font-[var(--font-heading)] font-extrabold text-4xl text-ds-on-surface tracking-tight mb-2">
          {editId ? t("editTitle") : t("createTitle")}
        </h1>
        <p className="text-ds-on-surface-variant max-w-2xl">{t("createSubtitle")}</p>
      </div>

      {/* ═══ Bento Grid ═══ */}
      <div className="grid grid-cols-12 gap-6">
        {/* Left Column */}
        <div className="col-span-12 lg:col-span-8 space-y-6">
          {/* Basic Info */}
          <section className="bg-ds-surface-container-lowest rounded-xl p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-6">
              <span
                className="material-symbols-outlined text-ds-primary"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                info
              </span>
              <h2 className="font-[var(--font-heading)] font-bold text-lg text-ds-on-surface">
                {t("basicInfo")}
              </h2>
            </div>
            <div className="grid grid-cols-2 gap-6">
              <div className="col-span-2 md:col-span-1">
                <label className="block text-[10px] font-bold text-ds-outline uppercase tracking-wider mb-2">
                  {t("name")}
                </label>
                <input
                  className="w-full bg-ds-surface-container-low border-none rounded-lg p-3 text-sm transition-all outline-none focus:ring-2 focus:ring-ds-primary/20"
                  placeholder={t("namePlaceholder")}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="col-span-2 md:col-span-1">
                <label className="block text-[10px] font-bold text-ds-outline uppercase tracking-wider mb-2">
                  {t("modelSelection")}
                </label>
                <div className="relative">
                  <input
                    className="w-full bg-ds-surface-container-low border-none rounded-lg p-3 text-sm transition-all outline-none focus:ring-2 focus:ring-ds-primary/20"
                    placeholder={t("modelPlaceholder")}
                    list="model-options"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                  />
                  <datalist id="model-options">
                    {availableModels.map((m) => (
                      <option key={m} value={m} />
                    ))}
                  </datalist>
                </div>
              </div>
              <div className="col-span-2">
                <label className="block text-[10px] font-bold text-ds-outline uppercase tracking-wider mb-2">
                  {t("descriptionLabel")}
                </label>
                <textarea
                  className="w-full bg-ds-surface-container-low border-none rounded-lg p-3 text-sm transition-all outline-none focus:ring-2 focus:ring-ds-primary/20"
                  placeholder={t("descriptionPlaceholder")}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                />
              </div>
            </div>
          </section>

          {/* Messages Editor */}
          <section className="bg-ds-surface-container-lowest rounded-xl p-6 shadow-sm">
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-2">
                <span
                  className="material-symbols-outlined text-ds-primary"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  forum
                </span>
                <h2 className="font-[var(--font-heading)] font-bold text-lg text-ds-on-surface">
                  {t("messagesEditor")}
                </h2>
              </div>
              <button
                type="button"
                onClick={addMessage}
                className="flex items-center gap-2 px-4 py-2 bg-ds-primary/10 text-ds-primary hover:bg-ds-primary/20 rounded-full transition-all text-sm font-semibold"
              >
                <span className="material-symbols-outlined text-lg">add</span>
                {t("addMessage")}
              </button>
            </div>
            <div className="space-y-4">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className="group relative bg-ds-surface p-4 rounded-xl border border-ds-outline-variant/10 hover:border-ds-primary/30 transition-all"
                >
                  <div className="flex items-center justify-between mb-3">
                    <select
                      className={`px-2 py-0.5 text-[10px] font-extrabold rounded uppercase tracking-tighter border-none ${ROLE_STYLE[msg.role]}`}
                      value={msg.role}
                      onChange={(e) => updateMessage(i, "role", e.target.value)}
                    >
                      {Object.keys(roleLabel).map((val) => (
                        <option key={val} value={val}>
                          {t(roleLabel[val])}
                        </option>
                      ))}
                    </select>
                    {messages.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeMessage(i)}
                        className="opacity-0 group-hover:opacity-100 p-1 text-ds-error hover:bg-ds-error/10 rounded transition-all"
                      >
                        <span className="material-symbols-outlined text-sm">delete</span>
                      </button>
                    )}
                  </div>
                  <textarea
                    className="w-full bg-transparent border-none text-sm leading-relaxed text-ds-on-surface resize-y min-h-[60px] focus:ring-0 p-0 outline-none"
                    placeholder={t("messagePlaceholder")}
                    value={msg.content}
                    onChange={(e) => updateMessage(i, "content", e.target.value)}
                    rows={3}
                  />
                </div>
              ))}
            </div>
            <div className="mt-8 pt-6 border-t border-ds-outline-variant/20">
              <label className="block text-[10px] font-bold text-ds-outline uppercase tracking-wider mb-2">
                {t("changelog")}
              </label>
              <input
                className="w-full bg-ds-surface-container-low border-none rounded-lg p-3 text-sm italic transition-all outline-none focus:ring-2 focus:ring-ds-primary/20"
                placeholder={t("changelogPlaceholder")}
                value={changelog}
                onChange={(e) => setChangelog(e.target.value)}
              />
            </div>
          </section>
        </div>

        {/* Right Column: Variables Panel */}
        <div className="col-span-12 lg:col-span-4">
          <section className="rounded-xl p-6 shadow-sm sticky top-24 border border-ds-outline-variant/20 bg-white/70 backdrop-blur-xl">
            <div className="flex items-center gap-2 mb-6">
              <span
                className="material-symbols-outlined text-ds-primary"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                data_object
              </span>
              <h2 className="font-[var(--font-heading)] font-bold text-lg text-ds-on-surface">
                {t("detectedVars")}
              </h2>
            </div>

            <div className="space-y-6">
              {variables.map((v, i) => (
                <div key={i} className="p-4 bg-ds-surface-container-low rounded-lg space-y-3">
                  <div className="flex justify-between items-center">
                    <input
                      className="text-sm font-bold font-[var(--font-heading)] text-ds-primary bg-transparent border-none p-0 focus:ring-0 w-32 outline-none"
                      placeholder={t("variableNamePlaceholder")}
                      value={v.name}
                      onChange={(e) => updateVariable(i, "name", e.target.value)}
                    />
                    <label className="relative inline-flex items-center cursor-pointer scale-75">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={v.required}
                        onChange={(e) => updateVariable(i, "required", e.target.checked)}
                      />
                      <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-ds-primary" />
                      <span className="ms-2 text-[10px] font-bold text-ds-outline uppercase">
                        {t("required")}
                      </span>
                    </label>
                  </div>
                  <input
                    className="w-full bg-white border-none rounded p-2 text-xs outline-none focus:ring-2 focus:ring-ds-primary/20"
                    placeholder={t("variableDescPlaceholder")}
                    value={v.description}
                    onChange={(e) => updateVariable(i, "description", e.target.value)}
                  />
                  <input
                    className="w-full bg-white border-none rounded p-2 text-xs font-mono outline-none focus:ring-2 focus:ring-ds-primary/20"
                    placeholder={t("defaultValuePlaceholder")}
                    value={v.defaultValue}
                    onChange={(e) => updateVariable(i, "defaultValue", e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => removeVariable(i)}
                    className="text-xs text-ds-error/60 hover:text-ds-error"
                  >
                    <span className="material-symbols-outlined text-sm">close</span>
                  </button>
                </div>
              ))}
            </div>

            {variables.length === 0 && detectedVars.size === 0 && (
              <p className="text-xs text-slate-400 text-center py-6">{t("noVariablesDefined")}</p>
            )}

            {detectedVars.size > 0 && (
              <div className="mt-6 p-4 bg-ds-primary/5 rounded-lg border border-ds-primary/10">
                <p className="text-[11px] text-ds-primary/80 leading-relaxed italic">
                  {t("detectedVarsHint")}
                </p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {[...detectedVars].map((v) => (
                    <span
                      key={v}
                      className="bg-ds-primary/10 text-ds-primary px-2 py-0.5 rounded font-mono text-xs font-medium"
                    >
                      {`{{${v}}}`}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={addVariable}
              className="mt-4 w-full py-2 text-sm font-semibold text-ds-primary bg-ds-primary/10 hover:bg-ds-primary/20 rounded-lg transition-all"
            >
              + {t("addVariable")}
            </button>
          </section>
        </div>
      </div>

      {/* ═══ Footer Actions ═══ */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t border-ds-outline-variant/20">
        <Link
          href="/actions"
          className="px-6 py-2.5 text-ds-secondary font-semibold hover:bg-slate-200/50 rounded-xl transition-all"
        >
          {t("cancel")}
        </Link>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={saving}
          className="px-8 py-2.5 bg-gradient-to-r from-ds-primary to-ds-primary-container text-white font-bold rounded-xl shadow-lg shadow-ds-primary/20 hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50"
        >
          {saving ? "..." : t("save")}
        </button>
      </div>
    </div>
  );
}
