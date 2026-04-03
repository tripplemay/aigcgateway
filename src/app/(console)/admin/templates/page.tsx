"use client";
import { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
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

/* ── Component ── */

export default function AdminTemplatesPage() {
  const t = useTranslations("adminTemplates");
  const tc = useTranslations("common");

  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1, pageSize: 20, total: 0, totalPages: 0,
  });
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [loading, setLoading] = useState(false);

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formCategory, setFormCategory] = useState("");
  const [formMessages, setFormMessages] = useState("");
  const [formVariables, setFormVariables] = useState("");
  const [creating, setCreating] = useState(false);

  // Editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editCategory, setEditCategory] = useState("");

  const load = useCallback(
    async (page = 1) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("pageSize", "20");
        if (search) params.set("search", search);
        if (categoryFilter) params.set("category", categoryFilter);
        const r = await apiFetch<{ data: TemplateItem[]; pagination: Pagination }>(
          `/api/admin/templates?${params}`,
        );
        setTemplates(r.data);
        setPagination(r.pagination);
      } catch {
        toast.error(t("loadError"));
      } finally {
        setLoading(false);
      }
    },
    [search, categoryFilter, t],
  );

  useEffect(() => {
    load(1);
  }, [load]);

  // Derived: distinct categories from loaded data
  const categories = Array.from(
    new Set(templates.map((t) => t.category).filter(Boolean) as string[]),
  ).sort();

  const handleCreate = async () => {
    setCreating(true);
    try {
      const messages = JSON.parse(formMessages);
      const variables = JSON.parse(formVariables);
      await apiFetch("/api/admin/templates", {
        method: "POST",
        body: JSON.stringify({
          name: formName,
          description: formDesc || undefined,
          category: formCategory || undefined,
          messages,
          variables,
        }),
      });
      toast.success(t("created"));
      setShowCreate(false);
      setFormName("");
      setFormDesc("");
      setFormCategory("");
      setFormMessages("");
      setFormVariables("");
      load(1);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t("createError"));
    } finally {
      setCreating(false);
    }
  };

  const handleUpdate = async (id: string) => {
    try {
      await apiFetch(`/api/admin/templates/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: editName,
          description: editDesc,
          category: editCategory || null,
        }),
      });
      toast.success(t("updated"));
      setEditingId(null);
      load(pagination.page);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t("updateError"));
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(t("confirmDelete", { name }))) return;
    try {
      await apiFetch(`/api/admin/templates/${id}`, { method: "DELETE" });
      toast.success(t("deleted"));
      load(pagination.page);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t("deleteError"));
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* ═══ Header ═══ */}
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight font-[var(--font-heading)] text-ds-on-surface">
            {t("title")}
          </h1>
          <p className="text-ds-on-surface-variant text-base font-medium mt-1">
            {t("subtitle")}
          </p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="px-6 py-3 bg-ds-primary text-white rounded-xl font-bold flex items-center gap-2 shadow-md hover:shadow-xl transition-shadow active:scale-[0.98]"
        >
          <span className="material-symbols-outlined text-sm">add</span>
          <span>{t("createTemplate")}</span>
        </button>
      </header>

      {/* ═══ Stats Bento ═══ */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-ds-surface-container-lowest p-6 rounded-xl shadow-sm">
          <span className="text-[10px] font-bold text-ds-primary uppercase tracking-widest">{t("totalTemplates")}</span>
          <h3 className="text-3xl font-extrabold mt-2 font-[var(--font-heading)]">{pagination.total}</h3>
        </div>
        <div className="bg-ds-surface-container-lowest p-6 rounded-xl shadow-sm">
          <span className="text-[10px] font-bold text-ds-tertiary uppercase tracking-widest">{t("categories")}</span>
          <h3 className="text-3xl font-extrabold mt-2 font-[var(--font-heading)]">{categories.length}</h3>
        </div>
        <div className="bg-ds-surface-container-lowest p-6 rounded-xl shadow-sm">
          <span className="text-[10px] font-bold text-ds-secondary uppercase tracking-widest">{t("public")}</span>
          <h3 className="text-3xl font-extrabold mt-2 font-[var(--font-heading)]">{pagination.total}</h3>
        </div>
      </section>

      {/* ═══ Create Form ═══ */}
      {showCreate && (
        <div className="bg-ds-surface-container-lowest rounded-xl p-6 shadow-sm space-y-4 border border-ds-primary/20">
          <h3 className="font-[var(--font-heading)] font-bold text-lg">{t("newTemplate")}</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <input
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder={t("namePlaceholder")}
              className="px-4 py-3 text-sm bg-ds-surface-container-low rounded-lg border-none focus:ring-2 focus:ring-ds-primary/20 outline-none"
            />
            <input
              value={formDesc}
              onChange={(e) => setFormDesc(e.target.value)}
              placeholder={t("descPlaceholder")}
              className="px-4 py-3 text-sm bg-ds-surface-container-low rounded-lg border-none focus:ring-2 focus:ring-ds-primary/20 outline-none"
            />
            <input
              value={formCategory}
              onChange={(e) => setFormCategory(e.target.value)}
              placeholder={t("categoryPlaceholder")}
              className="px-4 py-3 text-sm bg-ds-surface-container-low rounded-lg border-none focus:ring-2 focus:ring-ds-primary/20 outline-none"
            />
          </div>
          <textarea
            value={formMessages}
            onChange={(e) => setFormMessages(e.target.value)}
            placeholder='Messages JSON: [{"role": "system", "content": "..."}]'
            className="w-full font-mono text-sm bg-ds-surface-container-low rounded-lg p-4 border-none focus:ring-2 focus:ring-ds-primary/20 outline-none min-h-[100px]"
          />
          <textarea
            value={formVariables}
            onChange={(e) => setFormVariables(e.target.value)}
            placeholder='Variables JSON: [{"name": "role", "description": "...", "required": true}]'
            className="w-full font-mono text-sm bg-ds-surface-container-low rounded-lg p-4 border-none focus:ring-2 focus:ring-ds-primary/20 outline-none min-h-[80px]"
          />
          <div className="flex gap-3">
            <button
              onClick={handleCreate}
              disabled={creating || !formName || !formMessages || !formVariables}
              className="px-6 py-2.5 bg-ds-primary text-white font-bold rounded-xl disabled:opacity-50"
            >
              {creating ? tc("loading") : tc("save")}
            </button>
            <button
              onClick={() => setShowCreate(false)}
              className="px-6 py-2.5 text-ds-on-surface-variant font-bold"
            >
              {tc("cancel")}
            </button>
          </div>
        </div>
      )}

      {/* ═══ Filters ═══ */}
      <div className="flex flex-wrap items-center gap-3">
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
            onKeyDown={(e) => e.key === "Enter" && load(1)}
          />
        </div>
        <div className="flex items-center gap-2 overflow-x-auto">
          <button
            onClick={() => setCategoryFilter("")}
            className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
              !categoryFilter
                ? "bg-ds-primary text-white shadow-md"
                : "bg-ds-surface-container-high text-slate-600 hover:bg-white hover:shadow-sm"
            }`}
          >
            {tc("all")}
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
                categoryFilter === cat
                  ? "bg-ds-primary text-white shadow-md"
                  : "bg-ds-surface-container-high text-slate-600 hover:bg-white hover:shadow-sm"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* ═══ Template Table ═══ */}
      <div className="bg-ds-surface-container-lowest rounded-xl border border-ds-surface-container-high overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-ds-surface-container-low/50 border-b border-ds-surface-container-high">
                <th className="px-6 py-4 text-[11px] font-black uppercase tracking-widest text-slate-500">{t("colName")}</th>
                <th className="px-6 py-4 text-[11px] font-black uppercase tracking-widest text-slate-500">{t("colCategory")}</th>
                <th className="px-6 py-4 text-[11px] font-black uppercase tracking-widest text-slate-500">{t("colVersions")}</th>
                <th className="px-6 py-4 text-[11px] font-black uppercase tracking-widest text-slate-500">{t("colCreated")}</th>
                <th className="px-6 py-4 text-[11px] font-black uppercase tracking-widest text-slate-500 text-right">{t("colActions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ds-surface-container">
              {loading && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-ds-outline">{tc("loading")}</td>
                </tr>
              )}
              {!loading && templates.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-ds-outline">{t("empty")}</td>
                </tr>
              )}
              {!loading && templates.map((tpl) => {
                const isEditing = editingId === tpl.id;
                const ver = tpl.versions?.[0];
                return (
                  <tr key={tpl.id} className="group hover:bg-ds-surface-container-low transition-colors">
                    <td className="px-6 py-4">
                      {isEditing ? (
                        <div className="space-y-2">
                          <input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="text-sm font-bold bg-transparent border-b border-ds-primary focus:outline-none w-full"
                          />
                          <input
                            value={editDesc}
                            onChange={(e) => setEditDesc(e.target.value)}
                            className="text-xs text-ds-on-surface-variant bg-transparent border-b border-ds-outline-variant focus:outline-none w-full"
                            placeholder={t("descPlaceholder")}
                          />
                        </div>
                      ) : (
                        <div>
                          <h4 className="font-bold text-sm text-ds-on-surface group-hover:text-ds-primary transition-colors">
                            {tpl.name}
                          </h4>
                          {tpl.description && (
                            <p className="text-xs text-ds-on-surface-variant line-clamp-1 max-w-md">{tpl.description}</p>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {isEditing ? (
                        <input
                          value={editCategory}
                          onChange={(e) => setEditCategory(e.target.value)}
                          className="text-xs bg-transparent border-b border-ds-outline-variant focus:outline-none w-24"
                          placeholder={t("categoryPlaceholder")}
                        />
                      ) : tpl.category ? (
                        <span className="px-2 py-1 bg-ds-secondary-container text-ds-on-secondary-container rounded text-[10px] font-bold tracking-tight uppercase">
                          {tpl.category}
                        </span>
                      ) : (
                        <span className="text-xs text-ds-outline">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <code className="text-[11px] font-mono font-bold bg-ds-primary/10 text-ds-primary px-2 py-0.5 rounded">
                        {tpl.versionCount} {t("versionUnit")}
                      </code>
                      {ver && (
                        <span className="text-[10px] text-slate-400 ml-2">
                          (v{ver.versionNumber})
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-xs font-medium text-ds-on-surface-variant">
                      {formatDate(tpl.createdAt)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        {isEditing ? (
                          <>
                            <button
                              onClick={() => handleUpdate(tpl.id)}
                              className="px-3 py-1.5 bg-ds-primary text-white rounded text-[11px] font-bold"
                            >
                              {tc("save")}
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="px-3 py-1.5 text-ds-on-surface-variant rounded text-[11px] font-bold"
                            >
                              {tc("cancel")}
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => {
                                setEditingId(tpl.id);
                                setEditName(tpl.name);
                                setEditDesc(tpl.description || "");
                                setEditCategory(tpl.category || "");
                              }}
                              className="px-3 py-1.5 bg-ds-surface-container-highest text-ds-on-surface-variant rounded text-[11px] font-bold hover:bg-ds-primary/10 hover:text-ds-primary transition-all opacity-0 group-hover:opacity-100"
                            >
                              {t("edit")}
                            </button>
                            <button
                              onClick={() => handleDelete(tpl.id, tpl.name)}
                              className="px-3 py-1.5 text-ds-error rounded text-[11px] font-bold hover:bg-ds-error/10 transition-all opacity-0 group-hover:opacity-100"
                            >
                              {t("delete")}
                            </button>
                          </>
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
            {pagination.total > 0
              ? `${(pagination.page - 1) * pagination.pageSize + 1}-${Math.min(pagination.page * pagination.pageSize, pagination.total)} / ${pagination.total}`
              : "0"}
          </span>
          <div className="flex gap-4">
            <button
              onClick={() => load(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="hover:text-ds-primary transition-colors flex items-center gap-1 disabled:opacity-30"
            >
              <span className="material-symbols-outlined text-sm">chevron_left</span>
            </button>
            <button
              onClick={() => load(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages}
              className="hover:text-ds-primary transition-colors flex items-center gap-1 disabled:opacity-30"
            >
              <span className="material-symbols-outlined text-sm">chevron_right</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
