"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useProject } from "@/hooks/use-project";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";

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
  const executionMode = template.steps.length <= 1 ? t("modeSingle") : hasSplitter ? t("modeFanout") : t("modeSequential");

  const roleBadge = (role: string) => {
    const styles: Record<string, string> = {
      SEQUENTIAL: "bg-indigo-100 text-indigo-700",
      SPLITTER: "bg-amber-100 text-amber-700",
      BRANCH: "bg-purple-100 text-purple-700",
      MERGE: "bg-teal-100 text-teal-700",
    };
    const labels: Record<string, string> = {
      SEQUENTIAL: t("roleSequential"),
      SPLITTER: t("roleSplitter"),
      BRANCH: t("roleBranch"),
      MERGE: t("roleMerge"),
    };
    return (
      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-tighter ${styles[role] || "bg-slate-100 text-slate-600"}`}>
        {labels[role] || role}
      </span>
    );
  };

  return (
    <main className="p-8">
      {/* Breadcrumb */}
      <header className="flex flex-col gap-6 mb-10">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Link href="/templates" className="hover:text-primary transition-colors">{t("title")}</Link>
          <span className="material-symbols-outlined text-xs">chevron_right</span>
          <span className="text-primary font-medium">{template.name}</span>
        </div>
        <div className="flex justify-between items-start">
          <div className="space-y-1">
            <h1 className="text-4xl font-headline font-bold tracking-tight">{template.name}</h1>
            <p className="text-slate-600 text-lg max-w-2xl mt-2">{template.description || "—"}</p>
          </div>
          <div className="flex gap-3">
            <Link
              href={`/templates/new?edit=${templateId}`}
              className="px-5 py-2.5 bg-surface-container-low text-on-surface hover:bg-surface-container-high transition-colors font-semibold rounded-xl flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-sm">edit</span>
              {t("edit")}
            </Link>
            <button
              onClick={handleDelete}
              className="px-5 py-2.5 bg-surface-container-low text-error hover:bg-error/10 transition-colors font-semibold rounded-xl flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-sm">delete</span>
              {t("delete")}
            </button>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-12 gap-8">
        {/* Left: Steps Pipeline */}
        <div className="col-span-12 lg:col-span-8">
          <section className="bg-surface-container-lowest rounded-xl p-8 shadow-sm border border-outline-variant/10">
            <h2 className="text-xl font-headline font-bold mb-8">{t("executionPipeline")}</h2>
            <div className="space-y-4">
              {template.steps.map((step, i) => (
                <div key={step.id}>
                  <div className="flex items-center gap-4 p-5 bg-surface rounded-xl border border-outline-variant/10 hover:border-primary/20 transition-all">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold shrink-0">
                      {step.order + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <span className="font-bold text-on-surface">{step.action.name}</span>
                        {roleBadge(step.role)}
                      </div>
                      <p className="text-xs font-mono text-slate-400">{step.action.model}</p>
                    </div>
                    <Link
                      href={`/actions/${step.action.id}`}
                      className="text-xs text-primary font-bold hover:underline shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {t("viewAction")}
                    </Link>
                  </div>
                  {i < template.steps.length - 1 && (
                    <div className="flex justify-center py-2">
                      <div className="w-0.5 h-6 bg-outline-variant/30" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Right: Template Info */}
        <div className="col-span-12 lg:col-span-4 space-y-6">
          <div className="bg-surface-container-lowest p-6 rounded-xl shadow-sm border border-outline-variant/10">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-6">
              {t("templateInfo")}
            </h4>
            <div className="space-y-5">
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase">{t("executionMode")}</p>
                <p className="text-sm font-medium mt-1">{executionMode}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase">{t("totalSteps")}</p>
                <p className="text-sm font-medium mt-1">{template.steps.length}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase">{t("createdAt")}</p>
                <p className="text-sm font-medium mt-1">{new Date(template.createdAt).toLocaleDateString()}</p>
              </div>
            </div>
          </div>

          {/* Reserved variables hint */}
          {template.steps.length > 1 && (
            <div className="bg-primary/5 p-4 rounded-xl border border-primary/10">
              <p className="text-[10px] font-bold text-primary uppercase tracking-wider mb-3">{t("reservedVariables")}</p>
              <div className="space-y-2 text-xs text-slate-600">
                {!hasSplitter && (
                  <p><code className="font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded">{"{{previous_output}}"}</code> — {t("reservedPreviousOutput")}</p>
                )}
                {hasSplitter && (
                  <>
                    <p><code className="font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded">{"{{branch_input}}"}</code> — {t("reservedBranchInput")}</p>
                    <p><code className="font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded">{"{{all_outputs}}"}</code> — {t("reservedAllOutputs")}</p>
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
