"use client";
import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useProject } from "@/hooks/use-project";
import { useAsyncData } from "@/hooks/use-async-data";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusChip } from "@/components/status-chip";
import Link from "next/link";
import { timeAgo } from "@/lib/utils";

// ============================================================
// Types
// ============================================================

interface ActionVersion {
  versionNumber: number;
  messages: Array<{ role: string; content: string }>;
  variables: Array<{ name: string; description?: string }>;
}

interface StepDetail {
  id: string;
  order: number;
  role: string;
  action: {
    id: string;
    name: string;
    model: string;
    description?: string;
    activeVersionId: string | null;
    versions: ActionVersion[];
  };
}

interface TemplateDetail {
  id: string;
  name: string;
  description: string | null;
  steps: StepDetail[];
  createdAt: string;
  updatedAt: string;
}

// ============================================================
// Component
// ============================================================

export default function TemplateDetailPage() {
  const t = useTranslations("templates");
  const locale = useLocale();
  const { current } = useProject();
  const params = useParams();
  const router = useRouter();
  const templateId = params.templateId as string;
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());

  const toggleStep = (stepId: string) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(stepId)) next.delete(stepId);
      else next.add(stepId);
      return next;
    });
  };

  const { data: template, loading } = useAsyncData<TemplateDetail>(async () => {
    if (!current) return null as unknown as TemplateDetail;
    return apiFetch<TemplateDetail>(`/api/projects/${current.id}/templates/${templateId}`);
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
      <div className="space-y-6">
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

  // Count models used
  const modelCounts = new Map<string, number>();
  template.steps.forEach((s) => {
    const m = s.action.model.split("/").pop() || s.action.model;
    modelCounts.set(m, (modelCounts.get(m) || 0) + 1);
  });

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* ═══ Header ═══ */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
        <div className="max-w-2xl">
          <nav className="flex items-center gap-2 text-sm text-slate-500 mb-4">
            <Link href="/templates" className="hover:text-ds-primary transition-colors">
              {t("title")}
            </Link>
            <span className="material-symbols-outlined text-xs">chevron_right</span>
            <span className="text-ds-primary font-medium">{template.name}</span>
          </nav>
          <div className="flex items-center gap-3 mb-3">
            <h1 className="text-4xl font-extrabold font-[var(--font-heading)] tracking-tight text-ds-on-surface">
              {template.name}
            </h1>
            <StatusChip variant="info">{executionMode}</StatusChip>
          </div>
          <p className="text-ds-on-surface-variant text-lg leading-relaxed">
            {template.description || "\u2014"}
          </p>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleDelete}
            className="px-6 py-3 bg-ds-surface-container-highest text-ds-on-surface-variant font-semibold rounded-xl hover:bg-ds-surface-container-high transition-colors flex items-center gap-2"
          >
            <span className="material-symbols-outlined scale-90">delete</span>
            {t("delete")}
          </button>
          <Link
            href={`/templates/new?edit=${templateId}`}
            className="px-6 py-3 bg-gradient-to-r from-ds-primary to-ds-primary-container text-white font-bold rounded-xl shadow-lg shadow-ds-primary/20 hover:opacity-90 transition-opacity flex items-center gap-2"
          >
            <span className="material-symbols-outlined scale-90">edit</span>
            {t("edit")}
          </Link>
        </div>
      </div>

      {/* ═══ Grid ═══ */}
      <div className="grid grid-cols-12 gap-10">
        {/* Left: Pipeline Steps */}
        <div className="col-span-12 lg:col-span-8 space-y-8">
          {template.steps.map((step) => {
            const expanded = expandedSteps.has(step.id);
            const activeVer = step.action.versions?.[0];
            const systemMsg = activeVer?.messages?.find(
              (m: { role: string }) => m.role === "system",
            );
            const systemMsgPreview = systemMsg?.content
              ? systemMsg.content.length > 200
                ? systemMsg.content.slice(0, 200) + "..."
                : systemMsg.content
              : null;
            const variables = (activeVer?.variables ?? []) as Array<{ name: string }>;

            return (
              <div key={step.id} className="flex items-start gap-6">
                <div className="w-16 h-16 rounded-2xl bg-ds-primary text-white flex items-center justify-center font-[var(--font-heading)] font-extrabold text-2xl z-10 shadow-xl shadow-ds-primary/20">
                  {step.order + 1}
                </div>
                <div
                  className="flex-1 bg-ds-surface-container-lowest p-6 rounded-2xl shadow-sm hover:shadow-md transition-shadow group cursor-pointer"
                  onClick={() => toggleStep(step.id)}
                >
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="font-[var(--font-heading)] font-bold text-xl text-ds-on-surface group-hover:text-ds-primary transition-colors">
                        {step.action.name}
                      </h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs font-medium text-slate-400">{t("action")}</span>
                        <span className="w-1 h-1 rounded-full bg-slate-300" />
                        <span className="text-xs font-semibold text-ds-primary">
                          {step.action.model.split("/").pop()}
                        </span>
                        {activeVer && (
                          <>
                            <span className="w-1 h-1 rounded-full bg-slate-300" />
                            <span className="text-xs font-medium text-ds-tertiary">
                              v{activeVer.versionNumber}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/actions/${step.action.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="material-symbols-outlined text-slate-400 hover:text-ds-primary transition-colors"
                      >
                        open_in_new
                      </Link>
                      <span
                        className={`material-symbols-outlined text-slate-400 transition-transform ${expanded ? "rotate-180" : ""}`}
                      >
                        expand_more
                      </span>
                    </div>
                  </div>
                  <span className="px-3 py-1 bg-ds-surface-container-high text-ds-on-secondary-container text-[10px] font-bold tracking-wider rounded uppercase">
                    {step.role}
                  </span>

                  {/* Accordion content */}
                  {expanded && (systemMsgPreview || variables.length > 0) && (
                    <div className="mt-4 pt-4 border-t border-ds-surface-container-low space-y-3">
                      {systemMsgPreview && (
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                            {t("systemMessage")}
                          </p>
                          <p className="text-xs text-ds-on-surface-variant leading-relaxed italic">
                            {systemMsgPreview}
                          </p>
                        </div>
                      )}
                      {variables.length > 0 && (
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
                            {t("variables")}
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {variables.map((v) => (
                              <span
                                key={v.name}
                                className="px-2 py-0.5 bg-ds-primary/5 text-ds-primary text-[10px] font-mono rounded"
                              >
                                {`{{${v.name}}}`}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Add Step */}
          <Link
            href={`/templates/new?edit=${templateId}`}
            className="flex items-center gap-6 opacity-40 hover:opacity-100 transition-opacity cursor-pointer"
          >
            <div className="w-16 h-16 rounded-2xl border-2 border-dashed border-ds-primary flex items-center justify-center">
              <span className="material-symbols-outlined text-ds-primary">add</span>
            </div>
            <span className="font-[var(--font-heading)] font-bold text-lg text-ds-primary">
              {t("addOrchestrationStep")}
            </span>
          </Link>
        </div>

        {/* Right: Metadata */}
        <div className="col-span-12 lg:col-span-4 space-y-6">
          {/* Template Info */}
          <div className="bg-ds-surface-container-lowest p-8 rounded-xl shadow-sm">
            <div className="flex items-center gap-3 mb-8">
              <span className="material-symbols-outlined text-ds-primary">info</span>
              <h2 className="font-[var(--font-heading)] font-bold text-lg tracking-tight">
                {t("templateInfo")}
              </h2>
            </div>
            <div className="space-y-6">
              {[
                {
                  label: t("createdAt"),
                  value: new Date(template.createdAt).toLocaleDateString(locale),
                },
                {
                  label: t("updated"),
                  value: timeAgo(template.updatedAt, locale),
                  valueClass: "text-ds-primary",
                },
                { label: t("totalSteps"), value: `${template.steps.length} ${t("stepsUnit")}` },
                { label: t("executionMode"), value: executionMode },
              ].map((item) => (
                <div key={item.label} className="flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                    {item.label}
                  </span>
                  <span
                    className={`text-sm font-semibold ${item.valueClass ?? "text-ds-on-surface"}`}
                  >
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Resources Used */}
          <div className="bg-ds-surface-container p-6 rounded-xl">
            <h4 className="text-xs font-bold text-ds-on-secondary-container uppercase tracking-widest mb-4">
              {t("resourcesUsed")}
            </h4>
            <div className="space-y-4">
              {[...modelCounts.entries()].map(([model, count]) => (
                <div key={model} className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-ds-primary" />
                  <span className="text-sm font-medium">
                    {model} ({count}x)
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Reserved variables */}
          {template.steps.length > 1 && (
            <div className="bg-ds-primary/5 p-4 rounded-xl border border-ds-primary/10">
              <p className="text-[10px] font-bold text-ds-primary uppercase tracking-wider mb-3">
                {t("reservedVariables")}
              </p>
              <div className="space-y-2 text-xs text-slate-600">
                {!hasSplitter && (
                  <p>
                    <code className="font-mono text-ds-primary bg-ds-primary/10 px-1.5 py-0.5 rounded">
                      {"{{previous_output}}"}
                    </code>{" "}
                    — {t("reservedPreviousOutput")}
                  </p>
                )}
                {hasSplitter && (
                  <>
                    <p>
                      <code className="font-mono text-ds-primary bg-ds-primary/10 px-1.5 py-0.5 rounded">
                        {"{{branch_input}}"}
                      </code>{" "}
                      — {t("reservedBranchInput")}
                    </p>
                    <p>
                      <code className="font-mono text-ds-primary bg-ds-primary/10 px-1.5 py-0.5 rounded">
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
    </div>
  );
}
