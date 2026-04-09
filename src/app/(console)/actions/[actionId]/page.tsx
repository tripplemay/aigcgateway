"use client";
import { useTranslations, useLocale } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useProject } from "@/hooks/use-project";
import { useAsyncData } from "@/hooks/use-async-data";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import Link from "next/link";
import { timeAgo } from "@/lib/utils";

// ============================================================
// Types
// ============================================================

interface ActionVersion {
  id: string;
  versionNumber: number;
  messages: { role: string; content: string }[];
  variables: { name: string; description?: string; required: boolean; defaultValue?: string }[];
  changelog: string | null;
  createdAt: string;
}

interface ActionDetail {
  id: string;
  name: string;
  description: string | null;
  model: string;
  activeVersionId: string | null;
  versions: ActionVersion[];
  createdAt: string;
  usedInTemplates?: number;
}

const ROLE_LABELS: Record<string, string> = {
  system: "systemMessage",
  user: "userPrompt",
  assistant: "assistant",
};
const ROLE_ICONS: Record<string, string> = {
  system: "terminal",
  user: "person",
  assistant: "smart_toy",
};

// ============================================================
// Component
// ============================================================

export default function ActionDetailPage() {
  const t = useTranslations("actions");
  const locale = useLocale();
  const { current } = useProject();
  const params = useParams();
  const router = useRouter();
  const actionId = params.actionId as string;

  const {
    data: action,
    loading,
    refetch,
  } = useAsyncData<ActionDetail>(async () => {
    if (!current) return null as unknown as ActionDetail;
    return apiFetch<ActionDetail>(`/api/projects/${current.id}/actions/${actionId}`);
  }, [current, actionId]);

  const handleActivate = async (versionId: string) => {
    if (!current) return;
    try {
      await apiFetch(`/api/projects/${current.id}/actions/${actionId}/active-version`, {
        method: "PUT",
        body: JSON.stringify({ versionId }),
      });
      toast.success(t("versionActivated"));
      refetch();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleDelete = async () => {
    if (!current || !confirm(t("confirmDelete"))) return;
    try {
      await apiFetch(`/api/projects/${current.id}/actions/${actionId}`, { method: "DELETE" });
      toast.success(t("deleted"));
      router.push("/actions");
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  if (loading || !action) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[400px] w-full rounded-xl" />
      </div>
    );
  }

  const activeVersion = action.versions.find((v) => v.id === action.activeVersionId);

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* ═══ Breadcrumb ═══ */}
      <nav className="flex items-center gap-2 text-sm">
        <Link href="/actions" className="text-slate-500 hover:text-ds-primary transition-colors">
          {t("title")}
        </Link>
        <span className="material-symbols-outlined text-slate-400 text-sm">chevron_right</span>
        <span className="text-ds-primary font-semibold">{action.name}</span>
      </nav>

      {/* ═══ Header ═══ */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <div className="flex items-center gap-4 mb-2">
            <h1 className="text-4xl font-black tracking-tight text-ds-on-surface font-[var(--font-heading)]">
              {action.name}
            </h1>
            <span className="px-3 py-1 bg-ds-surface-container-high text-ds-primary rounded-full text-xs font-black uppercase tracking-widest">
              {action.model.split("/").pop()}
            </span>
          </div>
          <p className="text-ds-on-surface-variant max-w-2xl leading-relaxed">
            {action.description || t("noDescription")}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleDelete}
            className="flex items-center gap-2 px-5 py-2.5 border border-ds-error text-ds-error rounded-xl font-bold hover:bg-ds-error-container/20 transition-all"
          >
            <span className="material-symbols-outlined text-xl">delete</span>
            <span>{t("delete")}</span>
          </button>
          <Link
            href={`/actions/new?edit=${actionId}`}
            className="flex items-center gap-2 px-5 py-2.5 bg-ds-surface-container-low text-ds-on-surface rounded-xl font-bold hover:bg-ds-surface-container-high transition-all"
          >
            <span className="material-symbols-outlined text-xl">edit</span>
            <span>{t("edit")}</span>
          </Link>
          <Link
            href={`/actions/new?newVersion=${actionId}`}
            className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-ds-primary to-ds-primary-container text-white rounded-xl font-bold shadow-lg shadow-ds-primary/20 hover:scale-[0.98] transition-all"
          >
            <span className="material-symbols-outlined text-xl">add_circle</span>
            <span>{t("newVersion")}</span>
          </Link>
        </div>
      </div>

      {/* ═══ Grid Layout ═══ */}
      <div className="grid grid-cols-12 gap-8 items-start">
        {/* Left Column */}
        <div className="col-span-12 lg:col-span-8 space-y-8">
          {/* Active Version Card */}
          {activeVersion && (
            <section className="bg-ds-surface-container-lowest rounded-xl p-8 shadow-sm">
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                  <h2 className="text-xl font-[var(--font-heading)] font-bold">{t("activeVersion")}</h2>
                  <span className="px-3 py-0.5 bg-ds-primary/10 text-ds-primary rounded-full text-xs font-bold">
                    V{activeVersion.versionNumber}
                  </span>
                </div>
                <span className="text-sm text-slate-400 font-medium">
                  {timeAgo(activeVersion.createdAt, locale)}
                </span>
              </div>

              {/* Messages */}
              <div className="space-y-6 mb-10">
                {activeVersion.messages.map((msg, i) => (
                  <div
                    key={i}
                    className={
                      msg.role === "system"
                        ? "border-l-4 border-ds-primary/40 bg-ds-surface-container-low p-5 rounded-r-xl"
                        : "border-l-4 border-slate-200 bg-white p-5 rounded-r-xl ring-1 ring-inset ring-slate-100"
                    }
                  >
                    <div
                      className={`flex items-center gap-2 mb-3 ${msg.role === "system" ? "text-ds-primary" : "text-slate-500"}`}
                    >
                      <span className="material-symbols-outlined text-lg">
                        {ROLE_ICONS[msg.role] ?? "person"}
                      </span>
                      <span className="text-[10px] font-black uppercase tracking-widest">
                        {t(ROLE_LABELS[msg.role] ?? "userPrompt")}
                      </span>
                    </div>
                    <p className="text-sm text-ds-on-surface leading-relaxed whitespace-pre-wrap">
                      {msg.content.split(/(\{\{[^}]+\}\})/).map((part, j) =>
                        part.startsWith("{{") ? (
                          <span
                            key={j}
                            className="bg-ds-primary/10 text-ds-primary font-mono rounded px-1.5 py-0.5 mx-0.5 text-xs font-bold"
                          >
                            {part}
                          </span>
                        ) : (
                          <span key={j}>{part}</span>
                        ),
                      )}
                    </p>
                  </div>
                ))}
              </div>

              {/* Variables Table */}
              {activeVersion.variables.length > 0 && (
                <div className="mt-8">
                  <h3 className="text-[11px] font-black uppercase tracking-[0.15em] text-slate-400 mb-4">
                    {t("variableDefinitions")}
                  </h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="px-4 py-3">{t("varName")}</TableHead>
                        <TableHead className="px-4 py-3">{t("description")}</TableHead>
                        <TableHead className="px-4 py-3">{t("required")}</TableHead>
                        <TableHead className="px-4 py-3">{t("defaultValue")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="divide-y divide-ds-outline-variant/10">
                      {activeVersion.variables.map((v, i) => (
                        <TableRow key={i}>
                          <TableCell className="px-4 py-4 font-mono text-ds-primary font-bold">
                            {v.name}
                          </TableCell>
                          <TableCell className="px-4 py-4 text-ds-on-surface-variant">
                            {v.description || "\u2014"}
                          </TableCell>
                          <TableCell className="px-4 py-4">
                            {v.required ? (
                              <span
                                className="material-symbols-outlined text-ds-primary text-lg"
                                style={{ fontVariationSettings: "'FILL' 1" }}
                              >
                                check_circle
                              </span>
                            ) : (
                              <span className="text-slate-400">{"\u2014"}</span>
                            )}
                          </TableCell>
                          <TableCell className="px-4 py-4 text-slate-400">
                            {v.defaultValue || "\u2014"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </section>
          )}

          {/* Version History */}
          <section className="bg-ds-surface-container-lowest rounded-xl p-8 shadow-sm">
            <h2 className="text-xl font-[var(--font-heading)] font-bold mb-8">{t("versionHistory")}</h2>
            <div className="space-y-4">
              {action.versions.map((v) => {
                const isActive = v.id === action.activeVersionId;
                return (
                  <div
                    key={v.id}
                    className={`flex items-center justify-between p-4 rounded-xl ${
                      isActive
                        ? "bg-ds-surface border-l-4 border-ds-primary"
                        : "bg-ds-surface-container-low/30 hover:bg-ds-surface-container-low transition-colors"
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                          isActive
                            ? "bg-ds-primary/10 text-ds-primary"
                            : "bg-slate-200 text-slate-600"
                        }`}
                      >
                        {v.versionNumber}
                      </div>
                      <div>
                        <h4 className="font-bold text-ds-on-surface">
                          v{v.versionNumber}
                          {isActive ? ` (${t("active")})` : ""}
                        </h4>
                        <p className="text-xs text-slate-500">
                          {timeAgo(v.createdAt, locale)}
                          {v.changelog && ` \u00B7 "${v.changelog}"`}
                        </p>
                      </div>
                    </div>
                    {isActive ? (
                      <span className="text-xs px-2 py-0.5 bg-ds-primary/10 text-ds-primary rounded font-bold">
                        {t("active")}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleActivate(v.id)}
                        className="text-xs font-bold text-ds-primary hover:underline px-3"
                      >
                        {t("rollback")}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        {/* Right Column */}
        <div className="col-span-12 lg:col-span-4 space-y-8 sticky top-24">
          {/* Action Insights */}
          <section className="bg-ds-surface-container-lowest rounded-xl p-6 shadow-sm">
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-6">
              {t("actionInsights")}
            </h3>
            <div className="space-y-5">
              {[
                {
                  icon: "calendar_today",
                  label: t("createdAt"),
                  value: new Date(action.createdAt).toLocaleDateString(locale),
                },
                {
                  icon: "history",
                  label: t("lastUpdated"),
                  value: timeAgo(action.versions[0]?.createdAt ?? action.createdAt, locale),
                  valueClass: "text-ds-secondary",
                },
                {
                  icon: "layers",
                  label: t("totalVersions"),
                  value: String(action.versions.length),
                },
                {
                  icon: "link",
                  label: t("usageLabel"),
                  value: t("usedInTemplates", { count: action.usedInTemplates ?? 0 }),
                },
              ].map((item) => (
                <div key={item.icon} className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-ds-surface-container flex items-center justify-center text-slate-500">
                    <span className="material-symbols-outlined text-xl">{item.icon}</span>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      {item.label}
                    </p>
                    <p className={`text-sm font-bold ${item.valueClass ?? "text-ds-on-surface"}`}>
                      {item.value}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
