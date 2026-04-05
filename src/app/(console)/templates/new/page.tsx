"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useProject } from "@/hooks/use-project";
import { toast } from "sonner";

/* ── Types ── */

interface MessageBlock {
  role: "system" | "user" | "assistant";
  content: string;
}

interface VariableRow {
  name: string;
  description: string;
  required: boolean;
  defaultValue: string;
}

const ROLE_STYLES: Record<string, { dot: string; label: string; border: string }> = {
  system: { dot: "bg-ds-primary", label: "text-ds-primary", border: "border-ds-primary/30" },
  user: { dot: "bg-ds-secondary", label: "text-ds-secondary", border: "border-ds-secondary/30" },
  assistant: { dot: "bg-ds-tertiary", label: "text-ds-tertiary", border: "border-ds-tertiary/30" },
};

/* ── Component ── */

export default function CreateTemplatePage() {
  const t = useTranslations("templates");
  const tc = useTranslations("common");
  const router = useRouter();
  const { current } = useProject();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [messages, setMessages] = useState<MessageBlock[]>([{ role: "system", content: "" }]);
  const [variables, setVariables] = useState<VariableRow[]>([]);
  const [saving, setSaving] = useState(false);

  /* ── Message handlers ── */

  const addMessage = () => {
    setMessages((prev) => [...prev, { role: "user", content: "" }]);
  };

  const removeMessage = (index: number) => {
    setMessages((prev) => prev.filter((_, i) => i !== index));
  };

  const updateMessage = (index: number, field: keyof MessageBlock, value: string) => {
    setMessages((prev) => prev.map((msg, i) => (i === index ? { ...msg, [field]: value } : msg)));
  };

  /* ── Variable handlers ── */

  const addVariable = () => {
    setVariables((prev) => [
      ...prev,
      { name: "", description: "", required: false, defaultValue: "" },
    ]);
  };

  const removeVariable = (index: number) => {
    setVariables((prev) => prev.filter((_, i) => i !== index));
  };

  const updateVariable = (index: number, field: keyof VariableRow, value: string | boolean) => {
    setVariables((prev) => prev.map((v, i) => (i === index ? { ...v, [field]: value } : v)));
  };

  /* ── Submit ── */

  const handleSubmit = async () => {
    if (!current) return;
    if (!name.trim()) {
      toast.error(t("nameRequired"));
      return;
    }
    if (messages.length === 0 || messages.every((m) => !m.content.trim())) {
      toast.error(t("messagesRequired"));
      return;
    }

    setSaving(true);
    try {
      const body = {
        name: name.trim(),
        description: description.trim() || undefined,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        variables: variables
          .filter((v) => v.name.trim())
          .map((v) => ({
            name: v.name.trim(),
            description: v.description.trim(),
            required: v.required,
            defaultValue: v.defaultValue.trim() || undefined,
          })),
      };

      const result = await apiFetch<{ id: string }>(`/api/projects/${current.id}/templates`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      toast.success(t("created"));
      router.push(`/templates/${result.id}`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t("saveError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-[1400px] mx-auto">
      {/* ═══ Header ═══ */}
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
        <div className="max-w-2xl">
          <h1 className="text-3xl font-extrabold tracking-tight font-[var(--font-heading)] text-ds-on-surface">
            {t("createTemplate")}
          </h1>
          <p className="text-ds-on-surface-variant text-base font-medium mt-1">
            {t("createSubtitle")}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/templates")}
            className="px-6 py-2.5 border border-ds-outline-variant text-ds-on-surface-variant font-bold rounded-xl hover:bg-ds-surface-container-low transition-all"
          >
            {tc("cancel")}
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-6 py-3 bg-ds-primary text-white rounded-xl font-bold flex items-center gap-2 shadow-md hover:shadow-xl transition-shadow active:scale-[0.98] disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-sm">save</span>
            {saving ? tc("loading") : t("saveTemplate")}
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
        {/* ── Left: Name + Messages Editor ── */}
        <div className="xl:col-span-8 space-y-8">
          {/* Template Info */}
          <section className="bg-ds-surface-container-lowest rounded-xl shadow-sm p-6 space-y-4">
            <div>
              <label className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 block mb-2">
                {t("templateName")} *
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("namePlaceholder")}
                className="w-full text-lg font-bold bg-ds-surface-container-low rounded-lg px-4 py-3 border-none focus:ring-2 focus:ring-ds-primary/20 outline-none placeholder:text-slate-400"
              />
            </div>
            <div>
              <label className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 block mb-2">
                {t("descriptionLabel")}
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("descriptionPlaceholder")}
                rows={2}
                className="w-full text-sm bg-ds-surface-container-low rounded-lg px-4 py-3 border-none focus:ring-2 focus:ring-ds-primary/20 outline-none placeholder:text-slate-400 resize-none"
              />
            </div>
          </section>

          {/* Messages Editor */}
          <section className="bg-ds-surface-container-lowest rounded-xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-ds-outline-variant/10 flex justify-between items-center">
              <h3 className="font-[var(--font-heading)] font-bold text-sm flex items-center gap-2">
                <span className="material-symbols-outlined text-ds-primary text-lg">edit_note</span>
                {t("messagesEditor")}
              </h3>
              <button
                onClick={addMessage}
                className="text-xs font-bold text-ds-primary hover:bg-ds-primary/5 px-3 py-1.5 rounded-lg transition-colors"
              >
                + {t("addMessage")}
              </button>
            </div>
            <div className="p-6 space-y-6">
              {messages.map((msg, index) => {
                const style = ROLE_STYLES[msg.role] ?? ROLE_STYLES.user;
                return (
                  <div key={index} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${style.dot}`} />
                        <select
                          value={msg.role}
                          onChange={(e) => updateMessage(index, "role", e.target.value)}
                          className={`text-xs font-black font-[var(--font-heading)] uppercase tracking-widest bg-transparent border-none focus:ring-0 cursor-pointer ${style.label} p-0`}
                        >
                          <option value="system">System</option>
                          <option value="user">User</option>
                          <option value="assistant">Assistant</option>
                        </select>
                      </div>
                      {messages.length > 1 && (
                        <button
                          onClick={() => removeMessage(index)}
                          className="material-symbols-outlined text-slate-400 hover:text-ds-error text-sm transition-colors"
                        >
                          delete
                        </button>
                      )}
                    </div>
                    <textarea
                      value={msg.content}
                      onChange={(e) => updateMessage(index, "content", e.target.value)}
                      placeholder={t("messagePlaceholder")}
                      rows={4}
                      className={`w-full font-mono text-sm bg-ds-surface-container-low rounded-lg p-4 border-l-4 ${style.border} focus:ring-2 focus:ring-ds-primary/20 outline-none border-t-0 border-r-0 border-b-0 resize-none placeholder:text-slate-400`}
                    />
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        {/* ── Right: Variables ── */}
        <div className="xl:col-span-4 space-y-8">
          <section className="bg-ds-surface-container-lowest rounded-xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-ds-outline-variant/10 flex justify-between items-center">
              <h3 className="font-[var(--font-heading)] font-bold text-sm flex items-center gap-2">
                <span className="material-symbols-outlined text-ds-primary text-lg">
                  settings_input_component
                </span>
                {t("variableDefinitions")}
              </h3>
              <button
                onClick={addVariable}
                className="text-xs font-bold text-ds-primary hover:bg-ds-primary/5 px-3 py-1.5 rounded-lg transition-colors"
              >
                + {t("addVariable")}
              </button>
            </div>
            <div className="p-4 space-y-4">
              {variables.length === 0 && (
                <p className="text-ds-outline text-sm text-center py-6">
                  {t("noVariablesDefined")}
                </p>
              )}
              {variables.map((v, index) => (
                <div key={index} className="bg-ds-surface-container-low rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <input
                      value={v.name}
                      onChange={(e) => updateVariable(index, "name", e.target.value)}
                      placeholder={t("variableNamePlaceholder")}
                      className="font-mono font-bold text-sm text-ds-primary bg-transparent border-none focus:ring-0 outline-none p-0 w-full placeholder:text-slate-400"
                    />
                    <button
                      onClick={() => removeVariable(index)}
                      className="material-symbols-outlined text-slate-400 hover:text-ds-error text-sm transition-colors flex-shrink-0"
                    >
                      close
                    </button>
                  </div>
                  <input
                    value={v.description}
                    onChange={(e) => updateVariable(index, "description", e.target.value)}
                    placeholder={t("variableDescPlaceholder")}
                    className="w-full text-xs text-ds-on-surface-variant bg-transparent border-none focus:ring-0 outline-none p-0 placeholder:text-slate-400"
                  />
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={v.required}
                        onChange={(e) => updateVariable(index, "required", e.target.checked)}
                        className="w-4 h-4 rounded border-ds-outline-variant text-ds-primary focus:ring-ds-primary/20"
                      />
                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                        {t("required")}
                      </span>
                    </label>
                  </div>
                  <input
                    value={v.defaultValue}
                    onChange={(e) => updateVariable(index, "defaultValue", e.target.value)}
                    placeholder={t("defaultValuePlaceholder")}
                    className="w-full text-xs bg-ds-surface-container-lowest rounded px-3 py-2 border-none focus:ring-2 focus:ring-ds-primary/20 outline-none placeholder:text-slate-400"
                  />
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
