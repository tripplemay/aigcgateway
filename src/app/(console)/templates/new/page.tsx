"use client";
import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useProject } from "@/hooks/use-project";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";

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
    setSteps(steps.filter((_, idx) => idx !== i).map((s, idx) => ({ ...s, order: idx })));
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

  const roleLabels: Record<string, string> = {
    SEQUENTIAL: t("roleSequential"),
    SPLITTER: t("roleSplitter"),
    BRANCH: t("roleBranch"),
    MERGE: t("roleMerge"),
  };

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

  return (
    <main className="p-8 max-w-5xl mx-auto w-full">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-500 mb-6">
        <Link href="/templates" className="hover:text-primary transition-colors">{t("title")}</Link>
        <span className="material-symbols-outlined text-xs">chevron_right</span>
        <span className="text-primary font-medium">{t("createTitle")}</span>
      </div>

      <div className="mb-10">
        <h1 className="font-headline font-extrabold text-4xl text-on-surface tracking-tight mb-2">
          {t("createTitle")}
        </h1>
        <p className="text-on-surface-variant max-w-2xl">{t("createSubtitle")}</p>
      </div>

      {/* Basic Info */}
      <section className="bg-surface-container-lowest rounded-xl p-6 shadow-sm mb-6">
        <div className="flex items-center gap-2 mb-6">
          <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>info</span>
          <h2 className="font-headline font-bold text-lg">{t("basicInfo")}</h2>
        </div>
        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className="block text-[10px] font-bold text-outline uppercase tracking-wider mb-2">{t("templateName")}</label>
            <input
              className="w-full bg-surface-container-low border-none rounded-lg p-3 text-sm"
              placeholder={t("namePlaceholder")}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-outline uppercase tracking-wider mb-2">{t("executionMode")}</label>
            <div className="bg-surface-container-low rounded-lg p-3 text-sm font-medium text-slate-600">
              {executionMode}
            </div>
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

      {/* Execution Sequence */}
      <section className="bg-surface-container-lowest rounded-xl p-6 shadow-sm mb-6">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>account_tree</span>
            <h2 className="font-headline font-bold text-lg">{t("executionSequence")}</h2>
          </div>
          <button
            onClick={addStep}
            className="flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary hover:bg-primary/20 rounded-full transition-all text-sm font-semibold"
          >
            <span className="material-symbols-outlined text-lg">add</span>
            {t("addStep")}
          </button>
        </div>

        <div className="space-y-3">
          {steps.map((step, i) => (
            <div key={i}>
              <div className="flex items-center gap-3 p-4 bg-surface rounded-xl border border-outline-variant/10 hover:border-primary/20 transition-all">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                  {i + 1}
                </div>
                <select
                  className="flex-1 bg-surface-container-low border-none rounded-lg p-2.5 text-sm"
                  value={step.actionId}
                  onChange={(e) => updateStep(i, "actionId", e.target.value)}
                >
                  <option value="">{t("selectAction")}</option>
                  {actions.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.model.split("/").pop()})
                    </option>
                  ))}
                </select>
                <select
                  className="w-36 bg-surface-container-low border-none rounded-lg p-2.5 text-xs font-bold"
                  value={step.role}
                  onChange={(e) => updateStep(i, "role", e.target.value)}
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>{roleLabels[r]}</option>
                  ))}
                </select>
                {steps.length > 1 && (
                  <button
                    onClick={() => removeStep(i)}
                    className="p-1.5 text-error/60 hover:text-error hover:bg-error/10 rounded-lg transition-all"
                  >
                    <span className="material-symbols-outlined text-sm">delete</span>
                  </button>
                )}
              </div>
              {i < steps.length - 1 && (
                <div className="flex justify-center py-1">
                  <div className="w-0.5 h-4 bg-outline-variant/30" />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Reserved variable hints */}
        {steps.length > 1 && (
          <div className="mt-6 p-4 bg-primary/5 rounded-xl border border-primary/10">
            <p className="text-[10px] font-bold text-primary uppercase tracking-wider mb-2">{t("reservedVariables")}</p>
            <div className="space-y-1 text-xs text-slate-600">
              <p><code className="font-mono text-primary">{"{{previous_output}}"}</code> — {t("reservedPreviousOutput")}</p>
              {steps.some((s) => s.role === "SPLITTER") && (
                <>
                  <p><code className="font-mono text-primary">{"{{branch_input}}"}</code> — {t("reservedBranchInput")}</p>
                  <p><code className="font-mono text-primary">{"{{all_outputs}}"}</code> — {t("reservedAllOutputs")}</p>
                </>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Footer */}
      <div className="flex justify-end gap-4">
        <Link
          href="/templates"
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
          {saving ? "..." : t("saveTemplate")}
        </button>
      </div>
    </main>
  );
}
