"use client";
import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useProject } from "@/hooks/use-project";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

interface ActionOption {
  id: string;
  name: string;
  model: string;
}

interface StepDef {
  actionId: string;
  order: number;
  role: string;
}

const ROLES = ["SEQUENTIAL", "SPLITTER", "BRANCH", "MERGE"] as const;

export default function NewTemplatePage() {
  const t = useTranslations("templates");
  const { current } = useProject();
  const router = useRouter();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState<StepDef[]>([{ actionId: "", order: 0, role: "SEQUENTIAL" }]);
  const [actions, setActions] = useState<ActionOption[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!current) return;
    apiFetch<{ data: ActionOption[] }>(`/api/projects/${current.id}/actions?pageSize=100`)
      .then((d) => setActions(d.data))
      .catch(() => {});
  }, [current]);

  const addStep = () =>
    setSteps([...steps, { actionId: "", order: steps.length, role: "SEQUENTIAL" }]);

  const removeStep = (i: number) => {
    const updated = steps.filter((_, idx) => idx !== i).map((s, idx) => ({ ...s, order: idx }));
    setSteps(updated);
  };

  const updateStep = (i: number, field: keyof StepDef, value: string | number) => {
    const updated = [...steps];
    updated[i] = { ...updated[i], [field]: value };
    setSteps(updated);
  };

  const executionMode = steps.some((s) => s.role === "SPLITTER")
    ? "Fan-out"
    : steps.length > 1
      ? "Sequential"
      : "Single";

  const handleSubmit = async () => {
    if (!current) return;
    if (!name.trim()) return toast.error(t("nameRequired"));
    if (steps.some((s) => !s.actionId)) return toast.error(t("selectAction"));

    setSaving(true);
    try {
      const data = await apiFetch<{ id: string }>(`/api/projects/${current.id}/templates`, {
        method: "POST",
        body: JSON.stringify({ name, description, steps }),
      });
      toast.success(t("created"));
      router.push(`/templates/${data.id}`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const roleLabel = (role: string) => {
    switch (role) {
      case "SEQUENTIAL":
        return t("roleSequential");
      case "SPLITTER":
        return t("roleSplitter");
      case "BRANCH":
        return t("roleBranch");
      case "MERGE":
        return t("roleMerge");
      default:
        return role;
    }
  };

  return (
    <div className="p-6 max-w-4xl space-y-6">
      <h1 className="text-2xl font-black tracking-tight font-[var(--font-heading)]">
        {t("createTitle")}
      </h1>

      <div className="space-y-4">
        <div>
          <label className="text-sm font-bold text-slate-600 dark:text-slate-400">
            {t("templateName")}
          </label>
          <input
            className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
            placeholder={t("namePlaceholder")}
            value={name}
            onChange={(e) => setName(e.target.value)}
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

      {/* Execution mode indicator */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold text-slate-500">{t("executionMode")}:</span>
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
          {executionMode}
        </span>
      </div>

      {/* Steps editor */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-bold text-slate-600 dark:text-slate-400">
            {t("steps")}
          </label>
          <button onClick={addStep} className="text-xs text-ds-primary font-bold hover:underline">
            + {t("addStep")}
          </button>
        </div>

        {steps.map((step, i) => (
          <div
            key={i}
            className="flex gap-2 items-center p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
          >
            <span className="text-xs font-bold text-slate-400 w-8">#{i}</span>
            <select
              className="flex-1 px-2 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              value={step.actionId}
              onChange={(e) => updateStep(i, "actionId", e.target.value)}
            >
              <option value="">{t("selectAction")}</option>
              {actions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.model})
                </option>
              ))}
            </select>
            <select
              className="w-32 px-2 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold"
              value={step.role}
              onChange={(e) => updateStep(i, "role", e.target.value)}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {roleLabel(r)}
                </option>
              ))}
            </select>
            {steps.length > 1 && (
              <button
                onClick={() => removeStep(i)}
                className="text-red-400 hover:text-red-600 px-1"
              >
                <span className="material-symbols-outlined text-sm">delete</span>
              </button>
            )}
          </div>
        ))}

        {/* Reserved variable hints */}
        {steps.length > 1 && (
          <div className="text-xs text-slate-400 bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 space-y-1">
            <p className="font-bold">{t("reservedVariables")}:</p>
            <p>
              <code className="font-mono">{"{{previous_output}}"}</code> —{" "}
              {t("reservedPreviousOutput")}
            </p>
            {steps.some((s) => s.role === "SPLITTER") && (
              <>
                <p>
                  <code className="font-mono">{"{{branch_input}}"}</code> —{" "}
                  {t("reservedBranchInput")}
                </p>
                <p>
                  <code className="font-mono">{"{{all_outputs}}"}</code> — {t("reservedAllOutputs")}
                </p>
              </>
            )}
          </div>
        )}
      </div>

      <button
        onClick={handleSubmit}
        disabled={saving}
        className="px-6 py-2.5 rounded-xl bg-ds-primary text-white text-sm font-bold shadow-lg shadow-ds-primary/20 hover:opacity-90 transition disabled:opacity-50"
      >
        {saving ? "..." : t("saveTemplate")}
      </button>
    </div>
  );
}
