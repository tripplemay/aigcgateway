"use client";
import { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api-client";
import { useProject } from "@/hooks/use-project";
import { toast } from "sonner";

/* ── Types ── */

interface TemplateVariable {
  name: string;
  description: string;
  required: boolean;
  defaultValue?: string;
}

interface TemplateVersion {
  id: string;
  versionNumber: number;
  messages: { role: string; content: string }[];
  variables: TemplateVariable[];
  createdAt: string;
}

interface TemplateItem {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  activeVersionId: string | null;
  versionCount: number;
  latestVersion?: TemplateVersion | null;
  versions?: TemplateVersion[];
  createdAt: string;
  updatedAt: string;
}

interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/* ── Helpers ── */

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function getActiveVersion(t: TemplateItem): TemplateVersion | null {
  if (t.latestVersion) return t.latestVersion;
  if (t.versions && t.versions.length > 0) return t.versions[0];
  return null;
}

/* ── Component ── */

export default function TemplatesPage() {
  const t = useTranslations("templates");
  const tc = useTranslations("common");
  const router = useRouter();
  const { current } = useProject();

  const [tab, setTab] = useState<"my" | "global">("my");
  const [search, setSearch] = useState("");
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(false);
  const [forking, setForking] = useState<string | null>(null);

  const load = useCallback(
    async (page = 1) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("pageSize", "20");
        if (search) params.set("search", search);

        if (tab === "my" && current) {
          const r = await apiFetch<{ data: TemplateItem[]; pagination: Pagination }>(
            `/api/projects/${current.id}/templates?${params}`,
          );
          setTemplates(r.data);
          setPagination(r.pagination);
        } else if (tab === "global") {
          const r = await apiFetch<{ data: TemplateItem[]; pagination: Pagination }>(
            `/api/public-templates?${params}`,
          );
          setTemplates(r.data);
          setPagination(r.pagination);
        }
      } catch {
        toast.error(t("loadError"));
      } finally {
        setLoading(false);
      }
    },
    [tab, search, current, t],
  );

  useEffect(() => {
    if (tab === "my" && !current) return;
    load(1);
  }, [tab, current, load]);

  const handleSearch = () => {
    load(1);
  };

  const handleFork = async (templateId: string) => {
    if (!current) return;
    setForking(templateId);
    try {
      await apiFetch(`/api/projects/${current.id}/templates/fork`, {
        method: "POST",
        body: JSON.stringify({ templateId }),
      });
      toast.success(t("forkSuccess"));
      setTab("my");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t("forkError"));
    } finally {
      setForking(null);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* ═══ Page Header ═══ */}
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="max-w-2xl">
          <h1 className="text-3xl font-extrabold tracking-tight font-[var(--font-heading)] text-ds-on-surface">
            {t("title")}
          </h1>
          <p className="text-ds-on-surface-variant text-base font-medium mt-1">
            {t("subtitle")}
          </p>
        </div>
        {tab === "my" && (
          <button
            onClick={() => router.push("/templates/new")}
            className="px-6 py-3 bg-ds-primary text-white rounded-xl font-bold flex items-center gap-2 shadow-md hover:shadow-xl transition-shadow active:scale-[0.98]"
          >
            <span className="material-symbols-outlined text-sm">auto_awesome</span>
            <span>{t("createTemplate")}</span>
          </button>
        )}
      </header>

      {/* ═══ Tab Switch ═══ */}
      <div className="flex items-center gap-1 p-1 bg-ds-surface-container-low rounded-xl w-fit shadow-inner">
        <button
          onClick={() => setTab("my")}
          className={`px-8 py-2.5 rounded-lg text-sm font-bold transition-all ${
            tab === "my"
              ? "bg-white text-ds-primary shadow-sm"
              : "text-ds-on-surface-variant hover:text-ds-on-surface"
          }`}
        >
          {t("myTemplates")}
        </button>
        <button
          onClick={() => setTab("global")}
          className={`px-8 py-2.5 rounded-lg text-sm font-bold transition-all ${
            tab === "global"
              ? "bg-white text-ds-primary shadow-sm"
              : "text-ds-on-surface-variant hover:text-ds-on-surface"
          }`}
        >
          {t("globalLibrary")}
        </button>
      </div>

      {/* ═══ Search Bar ═══ */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
            search
          </span>
          <input
            className="pl-9 pr-4 py-2 text-sm rounded-full bg-ds-surface-container-low border-none focus:ring-2 focus:ring-ds-primary/20 w-full transition-all placeholder:text-slate-400 outline-none"
            type="text"
            placeholder={t("searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
        </div>
      </div>

      {/* ═══ Template Table ═══ */}
      <div className="bg-ds-surface-container-lowest rounded-xl border border-ds-surface-container-high overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-ds-surface-container-low/50 border-b border-ds-surface-container-high">
                <th className="px-6 py-4 text-[11px] font-black uppercase tracking-widest text-slate-500 font-[var(--font-heading)]">
                  {t("colName")}
                </th>
                <th className="px-6 py-4 text-[11px] font-black uppercase tracking-widest text-slate-500 font-[var(--font-heading)]">
                  {t("colVersion")}
                </th>
                <th className="px-6 py-4 text-[11px] font-black uppercase tracking-widest text-slate-500 font-[var(--font-heading)]">
                  {t("colCategory")}
                </th>
                <th className="px-6 py-4 text-[11px] font-black uppercase tracking-widest text-slate-500 font-[var(--font-heading)]">
                  {t("colCreated")}
                </th>
                <th className="px-6 py-4 text-[11px] font-black uppercase tracking-widest text-slate-500 font-[var(--font-heading)] text-right">
                  {t("colActions")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ds-surface-container">
              {loading && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-ds-outline">
                    {tc("loading")}
                  </td>
                </tr>
              )}
              {!loading && templates.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-ds-outline">
                    {t("empty")}
                  </td>
                </tr>
              )}
              {!loading &&
                templates.map((tpl) => {
                  const ver = getActiveVersion(tpl);
                  return (
                    <tr
                      key={tpl.id}
                      className="group hover:bg-ds-surface-container-low transition-colors"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-4">
                          <div className="w-8 h-8 rounded-lg bg-ds-primary/10 flex items-center justify-center text-ds-primary">
                            <span
                              className="material-symbols-outlined text-lg"
                              style={{ fontVariationSettings: "'FILL' 1" }}
                            >
                              extension
                            </span>
                          </div>
                          <div>
                            <h4 className="font-bold text-sm text-ds-on-surface group-hover:text-ds-primary transition-colors">
                              {tpl.name}
                            </h4>
                            {tpl.description && (
                              <p className="text-xs text-ds-on-surface-variant line-clamp-1 max-w-md">
                                {tpl.description}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <code className="text-[11px] font-mono font-bold bg-ds-primary/10 text-ds-primary px-2 py-0.5 rounded">
                          v{ver?.versionNumber ?? "—"}
                        </code>
                      </td>
                      <td className="px-6 py-4">
                        {tpl.category ? (
                          <span className="px-2 py-1 bg-ds-secondary-container text-ds-on-secondary-container rounded text-[10px] font-bold tracking-tight uppercase">
                            {tpl.category}
                          </span>
                        ) : (
                          <span className="text-xs text-ds-outline">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-xs font-medium text-ds-on-surface-variant">
                        {formatDate(tpl.createdAt)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() =>
                              router.push(
                                tab === "my"
                                  ? `/templates/${tpl.id}`
                                  : `/templates/${tpl.id}?public=true`,
                              )
                            }
                            className="px-3 py-1.5 bg-ds-surface-container-highest text-ds-on-surface-variant rounded text-[11px] font-bold hover:bg-ds-primary/10 hover:text-ds-primary transition-all"
                          >
                            {t("details")}
                          </button>
                          {tab === "global" && (
                            <button
                              onClick={() => handleFork(tpl.id)}
                              disabled={forking === tpl.id}
                              className="px-3 py-1.5 bg-ds-primary/10 text-ds-primary rounded text-[11px] font-bold hover:bg-ds-primary hover:text-white transition-all disabled:opacity-50"
                            >
                              {forking === tpl.id ? tc("loading") : t("fork")}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
        {/* Pagination */}
        <div className="px-6 py-3 bg-ds-surface-container-low/30 border-t border-ds-surface-container-high flex justify-between items-center text-[11px] font-bold text-slate-400 uppercase tracking-widest">
          <span>
            {t("showing", {
              from: (pagination.page - 1) * pagination.pageSize + 1,
              to: Math.min(pagination.page * pagination.pageSize, pagination.total),
              total: pagination.total,
            })}
          </span>
          <div className="flex gap-4">
            <button
              onClick={() => load(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="hover:text-ds-primary transition-colors flex items-center gap-1 disabled:opacity-30"
            >
              <span className="material-symbols-outlined text-sm">chevron_left</span> {t("prev")}
            </button>
            <button
              onClick={() => load(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages}
              className="hover:text-ds-primary transition-colors flex items-center gap-1 disabled:opacity-30"
            >
              {t("next")} <span className="material-symbols-outlined text-sm">chevron_right</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
