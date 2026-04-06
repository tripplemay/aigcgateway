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

  // Load existing template data in edit mode
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
      .catch(() => toast.error("Failed to load template"));
  }, [current, editId]);

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
    <main className="p-8 md:p-12 lg:p-16 min-h-screen">
      {/* Header — design-draft line 143-161 */}
      <header className="mb-12 flex justify-between items-end">
        <div>
          <nav className="flex items-center gap-2 text-outline mb-4 text-xs font-bold tracking-widest uppercase">
            <Link href="/templates" className="hover:text-primary transition-colors">
              {t("title")}
            </Link>
            <span className="material-symbols-outlined text-sm">chevron_right</span>
            <span className="text-primary">{editId ? t("editTitle") : t("createTitle")}</span>
          </nav>
          <h2 className="font-headline font-extrabold text-4xl tracking-tight text-on-surface">
            {editId ? t("editTitle") : t("createTitle")}
          </h2>
          <p className="text-on-surface-variant mt-2 max-w-xl">{t("createSubtitle")}</p>
        </div>
        <div className="flex gap-4">
          <Link
            href="/templates"
            className="px-6 py-2.5 text-sm font-bold text-outline hover:text-on-surface transition-colors"
          >
            {t("cancel")}
          </Link>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-8 py-2.5 bg-gradient-to-r from-primary to-primary-container text-white text-sm font-bold rounded-lg shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
          >
            {saving ? "..." : t("saveTemplate")}
          </button>
        </div>
      </header>

      <div className="grid grid-cols-12 gap-8">
        {/* Left Column: Basic Info — design-draft line 164-208 */}
        <div className="col-span-12 lg:col-span-4 space-y-8">
          <section className="bg-surface-container-lowest rounded-xl p-6 shadow-sm">
            <h3 className="font-headline font-bold text-lg mb-6 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">info</span>
              {t("basicInfo")}
            </h3>
            <div className="space-y-6">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-outline mb-2">
                  {t("templateName")}
                </label>
                <input
                  className="w-full bg-surface-container-low border-none border-b-2 border-transparent focus:border-primary focus:ring-0 rounded-lg py-3 px-4 font-medium transition-all"
                  placeholder={t("namePlaceholder")}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-outline mb-2">
                  {t("descriptionLabel")}
                </label>
                <textarea
                  className="w-full bg-surface-container-low border-none border-b-2 border-transparent focus:border-primary focus:ring-0 rounded-lg py-3 px-4 font-medium transition-all resize-none"
                  placeholder={t("descriptionPlaceholder")}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                />
              </div>
            </div>
          </section>
        </div>

        {/* Right Column: Step Builder — design-draft line 210-332 */}
        <div className="col-span-12 lg:col-span-8 space-y-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-headline font-bold text-lg flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">account_tree</span>
              {t("executionSequence")}
            </h3>
            <button
              onClick={addStep}
              className="flex items-center gap-2 bg-white px-4 py-2 rounded-lg text-sm font-bold text-primary shadow-sm hover:shadow-md hover:bg-primary hover:text-white transition-all group"
            >
              <span className="material-symbols-outlined text-sm transition-transform group-hover:rotate-90">
                add
              </span>
              {t("addStep")}
            </button>
          </div>

          {/* Steps List — design-draft line 223-312 */}
          <div className="space-y-4">
            {steps.map((step, i) => (
              <div
                key={i}
                className="group relative flex items-start gap-4 p-5 rounded-xl border border-transparent hover:border-outline-variant/30 transition-all shadow-sm bg-white/70 backdrop-blur-xl"
              >
                <div className="mt-2 cursor-grab active:cursor-grabbing text-outline opacity-40 group-hover:opacity-100 transition-opacity">
                  <span className="material-symbols-outlined">drag_indicator</span>
                </div>
                <div className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                  {/* Order — design-draft line 230-232 */}
                  <div className="md:col-span-1">
                    <label className="block text-[9px] font-black uppercase text-outline mb-1">
                      Order
                    </label>
                    <div className="bg-surface-container-high/50 w-full text-center py-2 rounded-md font-black text-primary">
                      {i + 1}
                    </div>
                  </div>
                  {/* Action — design-draft line 233-244 */}
                  <div className="md:col-span-6">
                    <label className="block text-[9px] font-black uppercase text-outline mb-1">
                      Action Engine
                    </label>
                    <div className="relative">
                      <select
                        className="w-full bg-surface-container-low border-none rounded-lg py-2 px-3 text-sm font-semibold appearance-none focus:ring-2 focus:ring-primary/20"
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
                  {/* Role — design-draft line 245-255 */}
                  <div className="md:col-span-4">
                    <label className="block text-[9px] font-black uppercase text-outline mb-1">
                      Execution Role
                    </label>
                    <div className="relative">
                      <select
                        className="w-full bg-surface-container-low border-none rounded-lg py-2 px-3 text-sm font-semibold appearance-none focus:ring-2 focus:ring-primary/20"
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
                  {/* Delete — design-draft line 256-260 */}
                  <div className="md:col-span-1 flex justify-end">
                    {steps.length > 1 && (
                      <button
                        onClick={() => removeStep(i)}
                        className="p-2 text-outline-variant hover:text-error transition-colors rounded-lg hover:bg-error/5"
                      >
                        <span className="material-symbols-outlined">delete</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {/* Add Step Placeholder — design-draft line 307-312 */}
            <button
              onClick={addStep}
              className="w-full py-8 rounded-xl border-2 border-dashed border-outline-variant/40 text-outline hover:border-primary/40 hover:text-primary transition-all flex flex-col items-center justify-center gap-2 group"
            >
              <div className="w-10 h-10 rounded-full bg-surface-container-high flex items-center justify-center group-hover:bg-primary/10">
                <span className="material-symbols-outlined">add_circle</span>
              </div>
              <span className="text-xs font-bold tracking-widest uppercase">
                Insert Intermediate Step
              </span>
            </button>
          </div>

          {/* Reserved variable hints */}
          {steps.length > 1 && (
            <div className="mt-6 p-4 bg-primary/5 rounded-xl border border-primary/10">
              <p className="text-[10px] font-bold text-primary uppercase tracking-wider mb-2">
                {t("reservedVariables")}
              </p>
              <div className="space-y-1 text-xs text-slate-600">
                <p>
                  <code className="font-mono text-primary">{"{{previous_output}}"}</code> —{" "}
                  {t("reservedPreviousOutput")}
                </p>
                {steps.some((s) => s.role === "SPLITTER") && (
                  <>
                    <p>
                      <code className="font-mono text-primary">{"{{branch_input}}"}</code> —{" "}
                      {t("reservedBranchInput")}
                    </p>
                    <p>
                      <code className="font-mono text-primary">{"{{all_outputs}}"}</code> —{" "}
                      {t("reservedAllOutputs")}
                    </p>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
