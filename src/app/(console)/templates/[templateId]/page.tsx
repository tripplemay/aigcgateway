"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useProject } from "@/hooks/use-project";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { timeAgo } from "@/lib/utils";

interface StepDetail {
  id: string;
  order: number;
  role: string;
  action: { id: string; name: string; model: string; description?: string };
}

interface TemplateDetail {
  id: string;
  name: string;
  description: string | null;
  steps: StepDetail[];
  createdAt: string;
  updatedAt: string;
}

export default function TemplateDetailPage() {
  const t = useTranslations("templates");
  const { current } = useProject();
  const params = useParams();
  const router = useRouter();
  const templateId = params.templateId as string;

  const [template, setTemplate] = useState<TemplateDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!current) return;
    setLoading(true);
    apiFetch<TemplateDetail>(`/api/projects/${current.id}/templates/${templateId}`)
      .then(setTemplate)
      .catch(() => toast.error("Failed to load template"))
      .finally(() => setLoading(false));
  }, [current, templateId]);

  const handleDelete = async () => {
    if (!current || !confirm(t("confirmDelete"))) return;
    try {
      await apiFetch(`/api/projects/${current.id}/templates/${templateId}`, { method: "DELETE" });
      toast.success(t("deleted"));
      router.push("/templates");
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  if (loading || !template) {
    return (
      <div className="p-8 space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[400px] w-full rounded-xl" />
      </div>
    );
  }

  const hasSplitter = template.steps.some((s) => s.role === "SPLITTER");
  const executionMode =
    template.steps.length <= 1
      ? t("modeSingle")
      : hasSplitter
        ? t("modeFanout")
        : t("modeSequential");

  const executionModeRaw =
    template.steps.length <= 1 ? "Single" : hasSplitter ? "Fan-out" : "Sequential";

  // Count models used
  const modelCounts = new Map<string, number>();
  template.steps.forEach((s) => {
    const m = s.action.model.split("/").pop() || s.action.model;
    modelCounts.set(m, (modelCounts.get(m) || 0) + 1);
  });

  return (
    <main className="pt-8 px-10 pb-16 min-h-screen">
      {/* Header — design-draft line 181-199 */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-12">
        <div className="max-w-2xl">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-sm text-slate-500 mb-4">
            <Link href="/templates" className="hover:text-primary transition-colors">
              {t("title")}
            </Link>
            <span className="material-symbols-outlined text-xs">chevron_right</span>
            <span className="text-primary font-medium">{template.name}</span>
          </div>
          <div className="flex items-center gap-3 mb-3">
            <h1 className="text-4xl font-extrabold font-headline tracking-tight text-on-surface">
              {template.name}
            </h1>
            <span className="px-3 py-1 bg-primary/10 text-primary rounded-full text-[10px] font-bold tracking-widest uppercase">
              {executionModeRaw}
            </span>
          </div>
          <p className="text-on-surface-variant text-lg leading-relaxed">
            {template.description || "—"}
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleDelete}
            className="px-6 py-3 bg-surface-container-highest text-on-surface-variant font-semibold rounded-xl hover:bg-surface-container-high transition-colors flex items-center gap-2"
          >
            <span className="material-symbols-outlined scale-90">delete</span>
            {t("delete")}
          </button>
          <Link
            href={`/templates/new?edit=${templateId}`}
            className="px-6 py-3 bg-gradient-to-r from-primary to-primary-container text-white font-bold rounded-xl shadow-lg shadow-primary/20 hover:opacity-90 transition-opacity flex items-center gap-2"
          >
            <span className="material-symbols-outlined scale-90">edit</span>
            {t("edit")}
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-10">
        {/* Orchestration Pipeline — design-draft line 202-280 */}
        <div className="col-span-12 lg:col-span-8 space-y-8 relative">
          {/* Pipeline connector CSS inline for the vertical line */}
          <style>{`
            .pipeline-step { position: relative; }
            .pipeline-connector::before {
              content: '';
              position: absolute;
              left: 2rem;
              top: 4rem;
              bottom: -2rem;
              width: 2px;
              background: linear-gradient(to bottom, #6d5dd3 0%, #dae2fd 100%);
              z-index: 0;
            }
            .pipeline-step:last-child .pipeline-connector::before {
              display: none;
            }
          `}</style>
          {template.steps.map((step) => (
            <div key={step.id} className="pipeline-step relative flex items-start gap-6">
              <div className="pipeline-connector" />
              <div className="w-16 h-16 rounded-2xl bg-primary text-white flex items-center justify-center font-headline font-extrabold text-2xl z-10 shadow-xl shadow-primary/20">
                {step.order + 1}
              </div>
              <div className="flex-1 bg-surface-container-lowest/60 backdrop-blur-md p-6 rounded-2xl border border-white/40 shadow-sm hover:shadow-md transition-shadow group cursor-pointer">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="font-headline font-bold text-xl text-on-surface group-hover:text-primary transition-colors">
                      {step.action.name}
                    </h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs font-medium text-slate-400">Action</span>
                      <span className="w-1 h-1 rounded-full bg-slate-300" />
                      <span className="text-xs font-semibold text-primary">
                        {step.action.model.split("/").pop()}
                      </span>
                    </div>
                  </div>
                  <Link
                    href={`/actions/${step.action.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="material-symbols-outlined text-slate-400 group-hover:rotate-180 transition-transform duration-300"
                  >
                    unfold_more
                  </Link>
                </div>
                <div className="flex items-center gap-4">
                  <span className="px-3 py-1 bg-surface-container-high text-on-secondary-container text-[10px] font-bold tracking-wider rounded uppercase">
                    {step.role}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Metadata Sidebar — design-draft line 282-328 */}
        <div className="col-span-12 lg:col-span-4 space-y-6">
          {/* Template Info Card */}
          <div className="bg-surface-container-lowest p-8 rounded-xl border border-slate-100 shadow-sm">
            <div className="flex items-center gap-3 mb-8">
              <span className="material-symbols-outlined text-primary">info</span>
              <h2 className="font-headline font-bold text-lg tracking-tight">
                {t("templateInfo")}
              </h2>
            </div>
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                  {t("createdAt")}
                </span>
                <span className="text-sm font-semibold text-on-surface">
                  {new Date(template.createdAt).toLocaleDateString()}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                  {t("updated")}
                </span>
                <span className="text-sm font-semibold text-primary">
                  {timeAgo(template.updatedAt)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                  {t("totalSteps")}
                </span>
                <span className="text-sm font-semibold text-on-surface">
                  {template.steps.length} Steps
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                  {t("executionMode")}
                </span>
                <span className="text-sm font-semibold text-on-surface">{executionMode}</span>
              </div>
            </div>
          </div>

          {/* Resources Used Card — design-draft line 315-327 */}
          <div className="bg-surface-container p-6 rounded-xl">
            <h4 className="text-xs font-bold text-on-secondary-container uppercase tracking-widest mb-4">
              Resources Used
            </h4>
            <div className="space-y-4">
              {[...modelCounts.entries()].map(([model, count]) => (
                <div key={model} className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-primary" />
                  <span className="text-sm font-medium">
                    {model} ({count}x)
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Reserved variables hint */}
          {template.steps.length > 1 && (
            <div className="bg-primary/5 p-4 rounded-xl border border-primary/10">
              <p className="text-[10px] font-bold text-primary uppercase tracking-wider mb-3">
                {t("reservedVariables")}
              </p>
              <div className="space-y-2 text-xs text-slate-600">
                {!hasSplitter && (
                  <p>
                    <code className="font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                      {"{{previous_output}}"}
                    </code>{" "}
                    — {t("reservedPreviousOutput")}
                  </p>
                )}
                {hasSplitter && (
                  <>
                    <p>
                      <code className="font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                        {"{{branch_input}}"}
                      </code>{" "}
                      — {t("reservedBranchInput")}
                    </p>
                    <p>
                      <code className="font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                        {"{{all_outputs}}"}
                      </code>{" "}
                      — {t("reservedAllOutputs")}
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
