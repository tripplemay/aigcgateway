"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useProject } from "@/hooks/use-project";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";

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
}

export default function TemplateDetailPage() {
  const t = useTranslations("templates");
  const { current } = useProject();
  const params = useParams();
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

  if (loading || !template) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const executionMode = template.steps.some((s) => s.role === "SPLITTER")
    ? t("modeFanout")
    : template.steps.length > 1
      ? t("modeSequential")
      : t("modeSingle");

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

  const roleBadgeColor = (role: string) => {
    switch (role) {
      case "SPLITTER":
        return "bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400";
      case "BRANCH":
        return "bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400";
      case "MERGE":
        return "bg-teal-50 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400";
      default:
        return "bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400";
    }
  };

  return (
    <div className="p-6 max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight font-[var(--font-heading)]">
          {template.name}
        </h1>
        <p className="text-sm text-slate-500 mt-1">{template.description || "—"}</p>
        <div className="flex items-center gap-2 mt-2">
          <span className="text-xs font-bold text-slate-500">{t("executionMode")}:</span>
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
            {executionMode}
          </span>
          <span className="text-xs text-slate-400">
            {template.steps.length} {t("steps")}
          </span>
        </div>
      </div>

      {/* Steps visualization */}
      <div className="space-y-3">
        <h2 className="text-lg font-bold">{t("steps")}</h2>
        {template.steps.map((step, i) => (
          <div
            key={step.id}
            className="flex items-center gap-3 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
          >
            <span className="text-sm font-black text-slate-300 w-8">#{step.order}</span>
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${roleBadgeColor(step.role)}`}
            >
              {roleLabel(step.role)}
            </span>
            <div className="flex-1">
              <p className="text-sm font-bold text-ds-primary">{step.action.name}</p>
              <p className="text-xs font-mono text-slate-400">{step.action.model}</p>
            </div>
            {i > 0 && (
              <div className="text-[10px] text-slate-400 bg-slate-50 dark:bg-slate-800 rounded px-2 py-1">
                {step.role === "BRANCH"
                  ? "{{branch_input}}"
                  : step.role === "MERGE"
                    ? "{{all_outputs}}"
                    : "{{previous_output}}"}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
