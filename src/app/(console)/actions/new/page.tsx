"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useProject } from "@/hooks/use-project";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

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

  const handleSubmit = async () => {
    if (!current) return;
    if (!name.trim()) return toast.error(t("nameRequired"));
    if (!model.trim()) return toast.error(t("modelRequired"));
    if (messages.every((m) => !m.content.trim())) return toast.error(t("messagesRequired"));

    setSaving(true);
    try {
      const data = await apiFetch<{ id: string }>(`/api/projects/${current.id}/actions`, {
        method: "POST",
        body: JSON.stringify({ name, description, model, messages, variables }),
      });
      toast.success(t("created"));
      router.push(`/actions/${data.id}`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl space-y-6">
      <h1 className="text-2xl font-black tracking-tight font-[var(--font-heading)]">
        {t("createTitle")}
      </h1>

      {/* Basic info */}
      <div className="space-y-4">
        <div>
          <label className="text-sm font-bold text-slate-600 dark:text-slate-400">{t("name")}</label>
          <input
            className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
            placeholder={t("namePlaceholder")}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <label className="text-sm font-bold text-slate-600 dark:text-slate-400">{t("model")}</label>
          <input
            className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono"
            placeholder={t("modelPlaceholder")}
            value={model}
            onChange={(e) => setModel(e.target.value)}
          />
        </div>
        <div>
          <label className="text-sm font-bold text-slate-600 dark:text-slate-400">
            {t("descriptionLabel")}
          </label>
          <input
            className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
            placeholder={t("descriptionPlaceholder")}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
      </div>

      {/* Messages Editor */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-bold text-slate-600 dark:text-slate-400">
            {t("messagesEditor")}
          </label>
          <button
            onClick={addMessage}
            className="text-xs text-ds-primary font-bold hover:underline"
          >
            + {t("addMessage")}
          </button>
        </div>
        {messages.map((msg, i) => (
          <div key={i} className="flex gap-2">
            <select
              className="px-2 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold w-28"
              value={msg.role}
              onChange={(e) => updateMessage(i, "role", e.target.value)}
            >
              <option value="system">system</option>
              <option value="user">user</option>
              <option value="assistant">assistant</option>
            </select>
            <textarea
              className="flex-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm resize-y min-h-[60px]"
              placeholder={t("messagePlaceholder")}
              value={msg.content}
              onChange={(e) => updateMessage(i, "content", e.target.value)}
              rows={2}
            />
            {messages.length > 1 && (
              <button
                onClick={() => removeMessage(i)}
                className="text-red-400 hover:text-red-600 px-1"
              >
                <span className="material-symbols-outlined text-sm">delete</span>
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Variables */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-bold text-slate-600 dark:text-slate-400">
            {t("variableDefinitions")}
          </label>
          <button
            onClick={addVariable}
            className="text-xs text-ds-primary font-bold hover:underline"
          >
            + {t("addVariable")}
          </button>
        </div>
        {variables.length === 0 && (
          <p className="text-xs text-slate-400">{t("noVariablesDefined")}</p>
        )}
        {variables.map((v, i) => (
          <div key={i} className="flex gap-2 items-start">
            <input
              className="w-32 px-2 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
              placeholder={t("variableNamePlaceholder")}
              value={v.name}
              onChange={(e) => updateVariable(i, "name", e.target.value)}
            />
            <input
              className="flex-1 px-2 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
              placeholder={t("variableDescPlaceholder")}
              value={v.description}
              onChange={(e) => updateVariable(i, "description", e.target.value)}
            />
            <input
              className="w-28 px-2 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
              placeholder={t("defaultValuePlaceholder")}
              value={v.defaultValue}
              onChange={(e) => updateVariable(i, "defaultValue", e.target.value)}
            />
            <label className="flex items-center gap-1 text-xs text-slate-500 whitespace-nowrap">
              <input
                type="checkbox"
                checked={v.required}
                onChange={(e) => updateVariable(i, "required", e.target.checked)}
              />
              {t("required")}
            </label>
            <button
              onClick={() => removeVariable(i)}
              className="text-red-400 hover:text-red-600 px-1"
            >
              <span className="material-symbols-outlined text-sm">delete</span>
            </button>
          </div>
        ))}
      </div>

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={saving}
        className="px-6 py-2.5 rounded-xl bg-ds-primary text-white text-sm font-bold shadow-lg shadow-ds-primary/20 hover:opacity-90 transition disabled:opacity-50"
      >
        {saving ? "..." : t("save")}
      </button>
    </div>
  );
}
