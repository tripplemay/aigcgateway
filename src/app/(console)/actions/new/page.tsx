"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useProject } from "@/hooks/use-project";
import { useRouter } from "next/navigation";
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
      const data = await apiFetch<{ id: string }>(`/api/projects/${current.id}/actions`, {
        method: "POST",
        body: JSON.stringify({ name, description, model, messages, variables, changelog }),
      });
      toast.success(t("created"));
      router.push(`/actions/${data.id}`);
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
    <main className="p-8 max-w-7xl mx-auto w-full flex-1">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-500 mb-6">
        <Link href="/actions" className="hover:text-primary transition-colors">
          {t("title")}
        </Link>
        <span className="material-symbols-outlined text-xs">chevron_right</span>
        <span className="text-primary font-medium">{t("createTitle")}</span>
      </div>

      <div className="mb-10">
        <h1 className="font-headline font-extrabold text-4xl text-on-surface tracking-tight mb-2">
          {t("createTitle")}
        </h1>
        <p className="text-on-surface-variant max-w-2xl">{t("createSubtitle")}</p>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Left: Basic Info + Messages */}
        <div className="col-span-12 lg:col-span-8 space-y-6">
          {/* Basic Info */}
          <section className="bg-surface-container-lowest rounded-xl p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-6">
              <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>info</span>
              <h2 className="font-headline font-bold text-lg">{t("basicInfo")}</h2>
            </div>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="block text-[10px] font-bold text-outline uppercase tracking-wider mb-2">{t("name")}</label>
                <input
                  className="w-full bg-surface-container-low border-none rounded-lg p-3 text-sm"
                  placeholder={t("namePlaceholder")}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-outline uppercase tracking-wider mb-2">{t("model")}</label>
                <input
                  className="w-full bg-surface-container-low border-none rounded-lg p-3 text-sm font-mono"
                  placeholder={t("modelPlaceholder")}
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                />
              </div>
              <div className="col-span-2">
                <label className="block text-[10px] font-bold text-outline uppercase tracking-wider mb-2">{t("descriptionLabel")}</label>
                <textarea
                  className="w-full bg-surface-container-low border-none rounded-lg p-3 text-sm"
                  placeholder={t("descriptionPlaceholder")}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                />
              </div>
            </div>
          </section>

          {/* Messages Editor */}
          <section className="bg-surface-container-lowest rounded-xl p-6 shadow-sm">
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>forum</span>
                <h2 className="font-headline font-bold text-lg">{t("messagesEditor")}</h2>
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
                <div key={i} className="group relative bg-surface p-4 rounded-xl border border-outline-variant/10 hover:border-primary/30 transition-all">
                  <div className="flex items-center justify-between mb-3">
                    <select
                      className={`px-2 py-0.5 text-[10px] font-extrabold rounded uppercase tracking-tighter border-none ${roleStyle[msg.role]}`}
                      value={msg.role}
                      onChange={(e) => updateMessage(i, "role", e.target.value)}
                    >
                      {Object.entries(roleLabel).map(([val, label]) => (
                        <option key={val} value={val}>{label}</option>
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
              <label className="block text-[10px] font-bold text-outline uppercase tracking-wider mb-2">{t("changelog")}</label>
              <input
                className="w-full bg-surface-container-low border-none rounded-lg p-3 text-sm italic"
                placeholder={t("changelogPlaceholder")}
                value={changelog}
                onChange={(e) => setChangelog(e.target.value)}
              />
            </div>
          </section>
        </div>

        {/* Right: Variables Panel */}
        <div className="col-span-12 lg:col-span-4">
          <section className="bg-surface-container-lowest rounded-xl p-6 shadow-sm sticky top-24 border border-outline-variant/20">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>data_object</span>
                <h2 className="font-headline font-bold text-lg">{t("variableDefinitions")}</h2>
              </div>
              <button
                onClick={addVariable}
                className="p-1.5 bg-primary/10 text-primary hover:bg-primary/20 rounded-lg transition-all"
              >
                <span className="material-symbols-outlined text-sm">add</span>
              </button>
            </div>

            {/* Auto-detected variables hint */}
            {detectedVars.size > 0 && (
              <div className="mb-4 p-3 bg-primary/5 rounded-lg">
                <p className="text-[10px] font-bold text-primary uppercase tracking-wider mb-2">{t("detectedVars")}</p>
                <div className="flex flex-wrap gap-1.5">
                  {[...detectedVars].map((v) => (
                    <span key={v} className="bg-primary/10 text-primary px-2 py-0.5 rounded font-mono text-xs font-medium">
                      {`{{${v}}}`}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {variables.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-8">{t("noVariablesDefined")}</p>
            ) : (
              <div className="space-y-4">
                {variables.map((v, i) => (
                  <div key={i} className="bg-surface p-4 rounded-xl border border-outline-variant/10 space-y-3">
                    <div className="flex items-center justify-between">
                      <input
                        className="font-mono text-sm font-bold text-primary bg-transparent border-none p-0 focus:ring-0 w-full"
                        placeholder={t("variableNamePlaceholder")}
                        value={v.name}
                        onChange={(e) => updateVariable(i, "name", e.target.value)}
                      />
                      <button onClick={() => removeVariable(i)} className="text-error/60 hover:text-error">
                        <span className="material-symbols-outlined text-sm">close</span>
                      </button>
                    </div>
                    <input
                      className="w-full text-xs text-slate-500 bg-transparent border-none p-0 focus:ring-0"
                      placeholder={t("variableDescPlaceholder")}
                      value={v.description}
                      onChange={(e) => updateVariable(i, "description", e.target.value)}
                    />
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 text-xs text-slate-500">
                        <input
                          type="checkbox"
                          checked={v.required}
                          onChange={(e) => updateVariable(i, "required", e.target.checked)}
                          className="rounded border-slate-300 text-primary focus:ring-primary/20"
                        />
                        {t("required")}
                      </label>
                      <input
                        className="text-xs font-mono text-slate-400 bg-transparent border-none p-0 focus:ring-0 text-right w-24"
                        placeholder={t("defaultValuePlaceholder")}
                        value={v.defaultValue}
                        onChange={(e) => updateVariable(i, "defaultValue", e.target.value)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Footer actions */}
      <div className="mt-8 flex justify-end gap-4">
        <Link
          href="/actions"
          className="px-5 py-2.5 bg-surface-container-low text-on-surface hover:bg-surface-container-high transition-colors font-semibold rounded-xl"
        >
          {t("cancel")}
        </Link>
        <button
          onClick={handleSubmit}
          disabled={saving}
          className="px-6 py-2.5 bg-gradient-to-r from-[#5443b9] to-[#6d5dd3] text-white font-bold rounded-xl flex items-center gap-2 shadow-lg shadow-primary/20 hover:opacity-90 transition-all active:scale-95 disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-sm">save</span>
          {saving ? "..." : t("save")}
        </button>
      </div>
    </main>
  );
}
