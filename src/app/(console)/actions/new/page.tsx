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

export default function NewActionPage() {
  const t = useTranslations("actions");
  const { current } = useProject();
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit");

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

  // Load existing action data in edit mode
  useEffect(() => {
    if (!current || !editId) return;
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
    }>(`/api/projects/${current.id}/actions/${editId}`)
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
      .catch(() => toast.error("Failed to load action"));
  }, [current, editId]);

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
      if (editId) {
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
    system: "System",
    user: "User",
    assistant: "Assistant",
  };

  const roleStyle: Record<string, string> = {
    system: "bg-on-surface/5 text-on-surface-variant",
    user: "bg-primary/5 text-primary",
    assistant: "bg-secondary/5 text-secondary",
  };

  return (
    <main className="ml-0 min-h-screen flex flex-col bg-surface overflow-x-hidden">
      {/* Top Nav / Breadcrumb — design-draft line 151-173 */}
      <header className="sticky top-0 w-full px-6 py-3 bg-slate-50/80 backdrop-blur-xl flex justify-between items-center z-40">
        <nav className="flex items-center text-xs text-slate-500 gap-2">
          <Link href="/actions" className="hover:text-primary transition-colors">
            {t("title")}
          </Link>
          <span className="material-symbols-outlined text-sm">chevron_right</span>
          <span className="text-primary font-semibold">
            {editId ? t("editTitle") : t("createTitle")}
          </span>
        </nav>
      </header>

      {/* Editor Content — design-draft line 175-296 */}
      <div className="p-8 max-w-7xl mx-auto w-full flex-1">
        <div className="mb-10">
          <h1 className="font-headline font-extrabold text-4xl text-on-surface tracking-tight mb-2">
            {editId ? t("editTitle") : t("createTitle")}
          </h1>
          <p className="text-on-surface-variant max-w-2xl">{t("createSubtitle")}</p>
        </div>

        <div className="grid grid-cols-12 gap-6">
          {/* Left Column — design-draft line 183-255 */}
          <div className="col-span-12 lg:col-span-8 space-y-6">
            {/* Basic Info — design-draft line 185-208 */}
            <section className="bg-surface-container-lowest rounded-xl p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-6">
                <span
                  className="material-symbols-outlined text-primary"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  info
                </span>
                <h2 className="font-headline font-bold text-lg text-on-surface">
                  {t("basicInfo")}
                </h2>
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div className="col-span-2 md:col-span-1">
                  <label className="block text-[10px] font-bold text-outline uppercase tracking-wider mb-2">
                    {t("name")}
                  </label>
                  <input
                    className="w-full bg-surface-container-low border-none border-b-2 border-outline-variant/30 focus:border-primary focus:ring-0 rounded-lg p-3 text-sm transition-all"
                    placeholder={t("namePlaceholder")}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="col-span-2 md:col-span-1">
                  <label className="block text-[10px] font-bold text-outline uppercase tracking-wider mb-2">
                    {t("model")}
                  </label>
                  <input
                    className="w-full bg-surface-container-low border-none border-b-2 border-outline-variant/30 focus:border-primary focus:ring-0 rounded-lg p-3 text-sm font-mono transition-all"
                    placeholder={t("modelPlaceholder")}
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-[10px] font-bold text-outline uppercase tracking-wider mb-2">
                    {t("descriptionLabel")}
                  </label>
                  <textarea
                    className="w-full bg-surface-container-low border-none border-b-2 border-outline-variant/30 focus:border-primary focus:ring-0 rounded-lg p-3 text-sm transition-all"
                    placeholder={t("descriptionPlaceholder")}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={2}
                  />
                </div>
              </div>
            </section>

            {/* Messages Editor — design-draft line 210-255 */}
            <section className="bg-surface-container-lowest rounded-xl p-6 shadow-sm">
              <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-2">
                  <span
                    className="material-symbols-outlined text-primary"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    forum
                  </span>
                  <h2 className="font-headline font-bold text-lg text-on-surface">
                    {t("messagesEditor")}
                  </h2>
                </div>
                <button
                  onClick={addMessage}
                  className="flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary hover:bg-primary/20 rounded-full transition-all text-sm font-semibold"
                >
                  <span className="material-symbols-outlined text-lg">add</span>
                  {t("addMessage")}
                </button>
              </div>
              <div className="space-y-4">
                {messages.map((msg, i) => (
                  <div
                    key={i}
                    className="group relative bg-surface p-4 rounded-xl border border-outline-variant/10 hover:border-primary/30 transition-all"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <select
                        className={`px-2 py-0.5 text-[10px] font-extrabold rounded uppercase tracking-tighter border-none ${roleStyle[msg.role]}`}
                        value={msg.role}
                        onChange={(e) => updateMessage(i, "role", e.target.value)}
                      >
                        {Object.entries(roleLabel).map(([val, label]) => (
                          <option key={val} value={val}>
                            {label}
                          </option>
                        ))}
                      </select>
                      {messages.length > 1 && (
                        <button
                          onClick={() => removeMessage(i)}
                          className="opacity-0 group-hover:opacity-100 p-1 text-error hover:bg-error/10 rounded transition-all"
                        >
                          <span className="material-symbols-outlined text-sm">delete</span>
                        </button>
                      )}
                    </div>
                    <textarea
                      className="w-full bg-transparent border-none text-sm leading-relaxed text-on-surface resize-y min-h-[60px] focus:ring-0 p-0"
                      placeholder={t("messagePlaceholder")}
                      value={msg.content}
                      onChange={(e) => updateMessage(i, "content", e.target.value)}
                      rows={3}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-8 pt-6 border-t border-outline-variant/20">
                <label className="block text-[10px] font-bold text-outline uppercase tracking-wider mb-2">
                  {t("changelog")}
                </label>
                <input
                  className="w-full bg-surface-container-low border-none border-b-2 border-outline-variant/30 focus:border-primary focus:ring-0 rounded-lg p-3 text-sm italic transition-all"
                  placeholder={t("changelogPlaceholder")}
                  value={changelog}
                  onChange={(e) => setChangelog(e.target.value)}
                />
              </div>
            </section>
          </div>

          {/* Right Column: Variables Panel — design-draft line 258-295 */}
          <div className="col-span-12 lg:col-span-4">
            <section className="rounded-xl p-6 shadow-sm sticky top-24 border border-outline-variant/20 bg-white/70 backdrop-blur-xl">
              <div className="flex items-center gap-2 mb-6">
                <span
                  className="material-symbols-outlined text-primary"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  data_object
                </span>
                <h2 className="font-headline font-bold text-lg text-on-surface">
                  {t("variableDefinitions")}
                </h2>
              </div>

              <div className="space-y-6">
                {variables.map((v, i) => (
                  <div key={i} className="p-4 bg-surface-container-low rounded-lg space-y-3">
                    <div className="flex justify-between items-center">
                      <input
                        className="text-sm font-bold font-headline text-primary bg-transparent border-none p-0 focus:ring-0 w-32"
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
                        <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary" />
                        <span className="ms-2 text-[10px] font-bold text-outline uppercase">
                          {t("required")}
                        </span>
                      </label>
                    </div>
                    <input
                      className="w-full bg-white border-none border-b border-outline-variant/30 focus:border-primary focus:ring-0 rounded p-2 text-xs"
                      placeholder={t("variableDescPlaceholder")}
                      value={v.description}
                      onChange={(e) => updateVariable(i, "description", e.target.value)}
                    />
                    <input
                      className="w-full bg-white border-none border-b border-outline-variant/30 focus:border-primary focus:ring-0 rounded p-2 text-xs font-mono"
                      placeholder={t("defaultValuePlaceholder")}
                      value={v.defaultValue}
                      onChange={(e) => updateVariable(i, "defaultValue", e.target.value)}
                    />
                    <button
                      onClick={() => removeVariable(i)}
                      className="text-xs text-error/60 hover:text-error"
                    >
                      <span className="material-symbols-outlined text-sm">close</span>
                    </button>
                  </div>
                ))}
              </div>

              {variables.length === 0 && detectedVars.size === 0 && (
                <p className="text-xs text-slate-400 text-center py-6">{t("noVariablesDefined")}</p>
              )}

              {/* Auto-detected variables hint */}
              {detectedVars.size > 0 && (
                <div className="mt-6 p-4 bg-primary/5 rounded-lg border border-primary/10">
                  <p className="text-[11px] text-primary/80 leading-relaxed italic">
                    Variables are automatically detected from message content using the{" "}
                    {"{{variable}}"} syntax.
                  </p>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {[...detectedVars].map((v) => (
                      <span
                        key={v}
                        className="bg-primary/10 text-primary px-2 py-0.5 rounded font-mono text-xs font-medium"
                      >
                        {`{{${v}}}`}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <button
                onClick={addVariable}
                className="mt-4 w-full py-2 text-sm font-semibold text-primary bg-primary/10 hover:bg-primary/20 rounded-lg transition-all"
              >
                + Add Variable
              </button>
            </section>
          </div>
        </div>
      </div>

      {/* Footer Actions — design-draft line 300-316 */}
      <footer className="mt-auto px-8 py-6 bg-surface-container-low border-t border-outline-variant/20">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4 text-xs text-on-surface-variant">
            {editId && <span>Action ID: {editId}</span>}
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/actions"
              className="px-6 py-2.5 text-secondary font-semibold hover:bg-slate-200/50 rounded-xl transition-all"
            >
              {t("cancel")}
            </Link>
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="px-8 py-2.5 bg-gradient-to-r from-primary to-primary-container text-white font-bold rounded-xl shadow-lg shadow-primary/20 hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {saving ? "..." : t("save")}
            </button>
          </div>
        </div>
      </footer>
    </main>
  );
}
