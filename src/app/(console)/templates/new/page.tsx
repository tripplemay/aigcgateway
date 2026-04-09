"use client";
import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useProject } from "@/hooks/use-project";
import { useRouter, useSearchParams } from "next/navigation";
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
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit");

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

  useEffect(() => {
    if (!current || !editId) return;
    apiFetch<{
      name: string;
      description: string | null;
      steps: { actionId: string; order: number; role: string; action: { id: string } }[];
    }>(`/api/projects/${current.id}/templates/${editId}`)
      .then((data) => {
        setName(data.name);
        setDescription(data.description || "");
        setSteps(
          data.steps.map((s) => ({
            actionId: s.action.id,
            order: s.order,
            role: s.role,
          })),
        );
      })
      .catch(() => toast.error(t("loadFailed")));
  }, [current, editId, t]);

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
      if (editId) {
        await apiFetch(`/api/projects/${current.id}/templates/${editId}`, {
          method: "PUT",
          body: JSON.stringify({ name, description, steps }),
        });
        toast.success(t("updated"));
        router.push(`/templates/${editId}`);
      } else {
        const data = await apiFetch<{ id: string }>(`/api/projects/${current.id}/templates`, {
          method: "POST",
          body: JSON.stringify({ name, description, steps }),
        });
        toast.success(t("created"));
        router.push(`/templates/${data.id}`);
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* ═══ Header ═══ */}
      <div className="flex justify-between items-end">
        <div>
          <nav className="flex items-center gap-2 text-sm text-slate-500 mb-4">
            <Link href="/templates" className="hover:text-ds-primary transition-colors">
              {t("title")}
            </Link>
            <span className="material-symbols-outlined text-xs">chevron_right</span>
            <span className="text-ds-primary font-semibold">
              {editId ? t("editTitle") : t("createTitle")}
            </span>
          </nav>
          <h2 className="font-[var(--font-heading)] font-extrabold text-4xl tracking-tight text-ds-on-surface">
            {editId ? t("editTitle") : t("createTitle")}
          </h2>
          <p className="text-ds-on-surface-variant mt-2 max-w-xl">{t("createSubtitle")}</p>
        </div>
        <div className="flex gap-4">
          <Link
            href="/templates"
            className="px-6 py-2.5 text-sm font-bold text-ds-outline hover:text-ds-on-surface transition-colors"
          >
            {t("cancel")}
          </Link>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="px-8 py-2.5 bg-gradient-to-r from-ds-primary to-ds-primary-container text-white text-sm font-bold rounded-lg shadow-lg shadow-ds-primary/20 hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
          >
            {saving ? "..." : t("saveTemplate")}
          </button>
        </div>
      </div>

      {/* ═══ Grid ═══ */}
      <div className="grid grid-cols-12 gap-8">
        {/* Left: Basic Info + Stats */}
        <div className="col-span-12 lg:col-span-4 space-y-8">
          <section className="bg-ds-surface-container-lowest rounded-xl p-6 shadow-sm">
            <h3 className="font-[var(--font-heading)] font-bold text-lg mb-6 flex items-center gap-2">
              <span className="material-symbols-outlined text-ds-primary">info</span>
              {t("basicInfo")}
            </h3>
            <div className="space-y-6">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-ds-outline mb-2">
                  {t("templateName")}
                </label>
                <input
                  className="w-full bg-ds-surface-container-low border-none rounded-lg py-3 px-4 font-medium transition-all outline-none focus:ring-2 focus:ring-ds-primary/20"
                  placeholder={t("namePlaceholder")}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-ds-outline mb-2">
                  {t("descriptionLabel")}
                </label>
                <textarea
                  className="w-full bg-ds-surface-container-low border-none rounded-lg py-3 px-4 font-medium transition-all resize-none outline-none focus:ring-2 focus:ring-ds-primary/20"
                  placeholder={t("descriptionPlaceholder")}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                />
              </div>
            </div>
          </section>

          {/* Pipeline Stats */}
          <section className="bg-ds-surface-container-low rounded-xl p-6">
            <p className="text-[10px] font-black uppercase tracking-widest text-ds-outline mb-4">
              {t("pipelineStats")}
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white p-4 rounded-lg">
                <p className="text-[10px] text-ds-outline font-bold">{t("stepsLabel")}</p>
                <p className="text-xl font-[var(--font-heading)] font-bold text-ds-primary">{steps.length}</p>
              </div>
              <div className="bg-white p-4 rounded-lg">
                <p className="text-[10px] text-ds-outline font-bold">{t("modeLabel")}</p>
                <p className="text-xl font-[var(--font-heading)] font-bold text-ds-primary">
                  {steps.some((s) => s.role === "SPLITTER")
                    ? t("modeFanout")
                    : steps.length > 1
                      ? t("modeSequential")
                      : t("modeSingle")}
                </p>
              </div>
            </div>
          </section>
        </div>

        {/* Right: Step Builder */}
        <div className="col-span-12 lg:col-span-8 space-y-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-[var(--font-heading)] font-bold text-lg flex items-center gap-2">
              <span className="material-symbols-outlined text-ds-primary">account_tree</span>
              {t("executionSequence")}
            </h3>
            <button
              type="button"
              onClick={addStep}
              className="flex items-center gap-2 bg-white px-4 py-2 rounded-lg text-sm font-bold text-ds-primary shadow-sm hover:shadow-md hover:bg-ds-primary hover:text-white transition-all group"
            >
              <span className="material-symbols-outlined text-sm transition-transform group-hover:rotate-90">
                add
              </span>
              {t("addStep")}
            </button>
          </div>

          {/* Steps */}
          <div className="space-y-4">
            {steps.map((step, i) => (
              <div
                key={i}
                className="group relative flex items-start gap-4 p-5 rounded-xl border border-transparent hover:border-ds-outline-variant/30 transition-all shadow-sm bg-white/70 backdrop-blur-xl"
              >
                <div className="mt-2 cursor-grab active:cursor-grabbing text-ds-outline opacity-40 group-hover:opacity-100 transition-opacity">
                  <span className="material-symbols-outlined">drag_indicator</span>
                </div>
                <div className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                  <div className="md:col-span-1">
                    <label className="block text-[9px] font-black uppercase text-ds-outline mb-1">
                      {t("orderLabel")}
                    </label>
                    <div className="bg-ds-surface-container-high/50 w-full text-center py-2 rounded-md font-black text-ds-primary">
                      {i + 1}
                    </div>
                  </div>
                  <div className="md:col-span-6">
                    <label className="block text-[9px] font-black uppercase text-ds-outline mb-1">
                      {t("actionEngine")}
                    </label>
                    <div className="relative">
                      <select
                        className="w-full bg-ds-surface-container-low border-none rounded-lg py-2 px-3 text-sm font-semibold appearance-none focus:ring-2 focus:ring-ds-primary/20 outline-none"
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
                      <span className="material-symbols-outlined absolute right-2 top-2 text-sm pointer-events-none">
                        expand_more
                      </span>
                    </div>
                  </div>
                  <div className="md:col-span-4">
                    <label className="block text-[9px] font-black uppercase text-ds-outline mb-1">
                      {t("executionRole")}
                    </label>
                    <div className="relative">
                      <select
                        className="w-full bg-ds-surface-container-low border-none rounded-lg py-2 px-3 text-sm font-semibold appearance-none focus:ring-2 focus:ring-ds-primary/20 outline-none"
                        value={step.role}
                        onChange={(e) => updateStep(i, "role", e.target.value)}
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {roleLabels[r]}
                          </option>
                        ))}
                      </select>
                      <span className="material-symbols-outlined absolute right-2 top-2 text-sm pointer-events-none">
                        expand_more
                      </span>
                    </div>
                  </div>
                  <div className="md:col-span-1 flex justify-end">
                    {steps.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeStep(i)}
                        className="p-2 text-ds-outline-variant hover:text-ds-error transition-colors rounded-lg hover:bg-ds-error/5"
                      >
                        <span className="material-symbols-outlined">delete</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {/* Add Step Placeholder */}
            <button
              type="button"
              onClick={addStep}
              className="w-full py-8 rounded-xl border-2 border-dashed border-ds-outline-variant/40 text-ds-outline hover:border-ds-primary/40 hover:text-ds-primary transition-all flex flex-col items-center justify-center gap-2 group"
            >
              <div className="w-10 h-10 rounded-full bg-ds-surface-container-high flex items-center justify-center group-hover:bg-ds-primary/10">
                <span className="material-symbols-outlined">add_circle</span>
              </div>
              <span className="text-xs font-bold tracking-widest uppercase">
                {t("insertStep")}
              </span>
            </button>
          </div>

          {/* Reserved variables */}
          {steps.length > 1 && (
            <div className="mt-6 p-4 bg-ds-primary/5 rounded-xl border border-ds-primary/10">
              <p className="text-[10px] font-bold text-ds-primary uppercase tracking-wider mb-2">
                {t("reservedVariables")}
              </p>
              <div className="space-y-1 text-xs text-slate-600">
                <p>
                  <code className="font-mono text-ds-primary">{"{{previous_output}}"}</code> —{" "}
                  {t("reservedPreviousOutput")}
                </p>
                {steps.some((s) => s.role === "SPLITTER") && (
                  <>
                    <p>
                      <code className="font-mono text-ds-primary">{"{{branch_input}}"}</code> —{" "}
                      {t("reservedBranchInput")}
                    </p>
                    <p>
                      <code className="font-mono text-ds-primary">{"{{all_outputs}}"}</code> —{" "}
                      {t("reservedAllOutputs")}
                    </p>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Deploy CTA */}
          <div className="mt-12 p-8 rounded-2xl bg-indigo-900 text-indigo-50 relative overflow-hidden">
            <div className="relative z-10">
              <h4 className="font-[var(--font-heading)] font-bold text-xl mb-2">{t("readyToDeploy")}</h4>
              <p className="text-indigo-200 text-sm max-w-md">{t("readyToDeployDesc")}</p>
              <div className="mt-6">
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={saving}
                  className="px-6 py-3 bg-white text-indigo-900 rounded-lg text-sm font-bold shadow-xl hover:scale-105 transition-transform disabled:opacity-50"
                >
                  {saving ? "..." : t("saveTemplate")}
                </button>
              </div>
            </div>
            <div className="absolute -right-12 -bottom-12 w-64 h-64 bg-ds-primary-container/20 blur-3xl rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
