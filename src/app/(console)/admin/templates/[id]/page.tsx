"use client";
import { useTranslations, useLocale } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useAsyncData } from "@/hooks/use-async-data";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import Link from "next/link";
import { timeAgo } from "@/lib/utils";
import { PageContainer } from "@/components/page-container";
import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { StatusChip } from "@/components/status-chip";

// ============================================================
// Types
// ============================================================

interface ActionVersion {
  versionNumber: number;
  messages: Array<{ role: string; content: string }>;
  variables: Array<{ name: string; description?: string }>;
}

interface StepAction {
  id: string;
  name: string;
  model: string;
  description?: string;
  activeVersionId: string | null;
  versions: ActionVersion[];
}

interface StepDetail {
  id: string;
  order: number;
  role: string;
  action: StepAction;
}

interface AdminTemplateDetail {
  id: string;
  name: string;
  description: string | null;
  isPublic: boolean;
  qualityScore: number | null;
  createdAt: string;
  updatedAt: string;
  project: { id: string; name: string };
  steps: StepDetail[];
}

// ============================================================
// Component
// ============================================================

export default function AdminTemplateDetailPage() {
  const t = useTranslations("adminTemplates");
  const tc = useTranslations("common");
  const tTpl = useTranslations("templates");
  const locale = useLocale();
  const params = useParams();
  const router = useRouter();
  const templateId = params.id as string;

  const {
    data: template,
    loading,
    refetch,
  } = useAsyncData<AdminTemplateDetail>(
    () => apiFetch<AdminTemplateDetail>(`/api/admin/templates/${templateId}`),
    [templateId],
  );

  const handleTogglePublic = async () => {
    if (!template) return;
    try {
      await apiFetch(`/api/admin/templates/${templateId}`, {
        method: "PATCH",
        body: JSON.stringify({ isPublic: !template.isPublic }),
      });
      toast.success(t("publicToggled"));
      refetch();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleDelete = async () => {
    if (!template || !confirm(t("confirmDelete", { name: template.name }))) return;
    try {
      await apiFetch(`/api/admin/templates/${templateId}`, { method: "DELETE" });
      toast.success(t("deleted"));
      router.push("/admin/templates");
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  if (loading || !template) {
    return (
      <div className="p-8 space-y-6">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-10 w-80" />
        <div className="grid grid-cols-12 gap-10">
          <div className="col-span-12 lg:col-span-8 space-y-6">
            <Skeleton className="h-24 w-full rounded-2xl" />
            <Skeleton className="h-24 w-full rounded-2xl" />
          </div>
          <div className="col-span-12 lg:col-span-4">
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  const hasSplitter = template.steps.some((s) => s.role === "SPLITTER");
  const executionMode =
    template.steps.length <= 1
      ? tTpl("modeSingle")
      : hasSplitter
        ? tTpl("modeFanout")
        : tTpl("modeSequential");

  const modelCounts = new Map<string, number>();
  template.steps.forEach((s) => {
    const m = s.action.model.split("/").pop() || s.action.model;
    modelCounts.set(m, (modelCounts.get(m) || 0) + 1);
  });

  return (
    <PageContainer>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-ds-on-surface-variant/60">
        <Link href="/admin/templates" className="hover:text-ds-primary transition-colors">
          {t("title")}
        </Link>
        <span className="material-symbols-outlined text-xs">chevron_right</span>
        <span className="text-ds-on-surface font-medium">{template.name}</span>
      </nav>

      <PageHeader
        title={template.name}
        subtitle={template.description ?? undefined}
        badge={<StatusChip variant="info">{executionMode}</StatusChip>}
        actions={
          <button
            type="button"
            onClick={handleDelete}
            className="px-6 py-3 bg-ds-surface-container-highest text-ds-on-surface-variant font-semibold rounded-xl hover:bg-ds-surface-container-high transition-colors flex items-center gap-2"
          >
            <span className="material-symbols-outlined scale-90">delete</span>
            {tc("delete")}
          </button>
        }
      />

      {/* ═══ Grid ═══ */}
      <div className="grid grid-cols-12 gap-10">
        {/* Left: Pipeline Steps */}
        <div className="col-span-12 lg:col-span-8 space-y-8">
          {template.steps.map((step) => {
            const activeVer = step.action.versions[0];
            const systemMsg = activeVer?.messages?.find(
              (m: { role: string }) => m.role === "system",
            );
            const systemMsgPreview = systemMsg?.content
              ? systemMsg.content.length > 120
                ? systemMsg.content.slice(0, 120) + "..."
                : systemMsg.content
              : null;
            const variables = activeVer?.variables ?? [];

            return (
              <div key={step.id} className="flex items-start gap-6">
                <div className="w-16 h-16 rounded-2xl bg-ds-primary text-white flex items-center justify-center font-[var(--font-heading)] font-extrabold text-2xl z-10 shadow-xl shadow-ds-primary/20">
                  {step.order + 1}
                </div>
                <div className="flex-1 bg-ds-surface-container-lowest p-6 rounded-2xl shadow-sm">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="font-[var(--font-heading)] font-bold text-xl text-ds-on-surface">
                        {step.action.name}
                      </h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs font-medium text-slate-400">{tTpl("action")}</span>
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
                    <StatusChip variant="neutral">{step.role}</StatusChip>
                  </div>

                  {/* Action preview: system message + variables */}
                  {(systemMsgPreview || variables.length > 0) && (
                    <div className="mt-3 pt-3 border-t border-ds-surface-container-low space-y-3">
                      {systemMsgPreview && (
                        <p className="text-xs text-ds-on-surface-variant leading-relaxed italic">
                          {systemMsgPreview}
                        </p>
                      )}
                      {variables.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {(variables as Array<{ name: string }>).map((v) => (
                            <span
                              key={v.name}
                              className="px-2 py-0.5 bg-ds-primary/5 text-ds-primary text-[10px] font-mono rounded"
                            >
                              {`{{${v.name}}}`}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Right: Metadata */}
        <div className="col-span-12 lg:col-span-4 space-y-6">
          {/* Template Info */}
          <SectionCard title={tTpl("templateInfo")}>
            <div className="space-y-6">
              {[
                { label: t("colProject"), value: template.project.name },
                {
                  label: tTpl("createdAt"),
                  value: new Date(template.createdAt).toLocaleDateString(locale),
                },
                {
                  label: tTpl("updated"),
                  value: timeAgo(template.updatedAt, locale),
                  valueClass: "text-ds-primary",
                },
                {
                  label: tTpl("totalSteps"),
                  value: `${template.steps.length} ${t("steps")}`,
                },
                { label: tTpl("executionMode"), value: executionMode },
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
          </SectionCard>

          {/* Public toggle */}
          <SectionCard>
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-ds-on-surface uppercase tracking-widest mb-1">
                  {t("colPublic")}
                </h4>
                <p className="text-xs text-ds-on-surface-variant">
                  {template.isPublic ? t("visibilityPublic") : t("visibilityPrivate")}
                </p>
              </div>
              <Switch checked={template.isPublic} onCheckedChange={handleTogglePublic} />
            </div>
          </SectionCard>

          {/* Quality Score */}
          <SectionCard>
            <h4 className="text-xs font-bold text-ds-on-surface uppercase tracking-widest mb-3">
              {t("colQuality")}
            </h4>
            <div className="flex items-center gap-2">
              {template.qualityScore != null ? (
                <>
                  <span
                    className="material-symbols-outlined text-ds-tertiary"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    star
                  </span>
                  <span className="text-2xl font-extrabold font-[var(--font-heading)] text-ds-on-surface">
                    {template.qualityScore.toFixed(1)}
                  </span>
                </>
              ) : (
                <span className="text-sm text-ds-on-surface-variant">{"\u2014"}</span>
              )}
            </div>
          </SectionCard>

          {/* Resources Used */}
          {modelCounts.size > 0 && (
            <div className="bg-ds-surface-container p-6 rounded-xl">
              <h4 className="text-xs font-bold text-ds-on-secondary-container uppercase tracking-widest mb-4">
                {tTpl("resourcesUsed")}
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
          )}

          {/* Reserved variables */}
          {template.steps.length > 1 && (
            <div className="bg-ds-primary/5 p-4 rounded-xl border border-ds-primary/10">
              <p className="text-[10px] font-bold text-ds-primary uppercase tracking-wider mb-3">
                {tTpl("reservedVariables")}
              </p>
              <div className="space-y-2 text-xs text-slate-600">
                {!hasSplitter && (
                  <p>
                    <code className="font-mono text-ds-primary bg-ds-primary/10 px-1.5 py-0.5 rounded">
                      {"{{previous_output}}"}
                    </code>{" "}
                    — {tTpl("reservedPreviousOutput")}
                  </p>
                )}
                {hasSplitter && (
                  <>
                    <p>
                      <code className="font-mono text-ds-primary bg-ds-primary/10 px-1.5 py-0.5 rounded">
                        {"{{branch_input}}"}
                      </code>{" "}
                      — {tTpl("reservedBranchInput")}
                    </p>
                    <p>
                      <code className="font-mono text-ds-primary bg-ds-primary/10 px-1.5 py-0.5 rounded">
                        {"{{all_outputs}}"}
                      </code>{" "}
                      — {tTpl("reservedAllOutputs")}
                    </p>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </PageContainer>
  );
}
