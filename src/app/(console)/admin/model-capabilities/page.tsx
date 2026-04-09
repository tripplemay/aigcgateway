"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useAsyncData } from "@/hooks/use-async-data";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

interface ModelItem {
  id: string;
  name: string;
  displayName: string;
  modality: string;
  enabled: boolean;
  capabilities: Record<string, boolean> | null;
  supportedSizes: string[] | null;
  activeChannelCount: number;
  channels: { provider: string }[];
}

const CAP_KEYS = [
  "streaming",
  "json_mode",
  "function_calling",
  "vision",
  "reasoning",
  "search",
] as const;

export default function ModelCapabilitiesPage() {
  const t = useTranslations("modelCapabilities");
  const [search, setSearch] = useState("");
  const [modalityFilter, setModalityFilter] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const { data: modelsResult, refetch: fetchModels } = useAsyncData<{ data: ModelItem[] }>(async () => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (modalityFilter) params.set("modality", modalityFilter);
    const q = params.toString() ? `?${params}` : "";
    const r = await apiFetch<{ data: ModelItem[] }>(`/api/admin/models${q}`);
    return { data: r.data.filter((m) => m.enabled && m.activeChannelCount > 0) };
  }, [search, modalityFilter]);

  const models = modelsResult?.data ?? [];
  const loading = !modelsResult;

  const paged = models.slice((page - 1) * pageSize, page * pageSize);
  const totalPages = Math.ceil(models.length / pageSize);

  const toggleCapability = async (model: ModelItem, key: string, value: boolean) => {
    const caps = { ...(model.capabilities ?? {}), [key]: value };
    try {
      await apiFetch(`/api/admin/models/${model.id}`, {
        method: "PATCH",
        body: JSON.stringify({ capabilities: caps }),
      });
      toast.success(t("saved"));
      fetchModels();
    } catch {
      toast.error(t("saveFailed"));
    }
  };

  const updateSizes = async (model: ModelItem, sizes: string[]) => {
    try {
      await apiFetch(`/api/admin/models/${model.id}`, {
        method: "PATCH",
        body: JSON.stringify({ supportedSizes: sizes }),
      });
      toast.success(t("sizesSaved"));
      fetchModels();
    } catch {
      toast.error(t("saveFailed"));
    }
  };

  const removeSize = (model: ModelItem, idx: number) => {
    const sizes = [...(model.supportedSizes ?? [])];
    sizes.splice(idx, 1);
    updateSizes(model, sizes);
  };

  const addSize = (model: ModelItem, size: string) => {
    if (!size.trim()) return;
    const sizes = [...(model.supportedSizes ?? []), size.trim()];
    updateSizes(model, sizes);
  };

  return (
    <main className="p-8 md:p-12 lg:p-16 min-h-screen">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-black tracking-tight font-[var(--font-heading)]">
          {t("title")}
        </h1>
        <p className="text-sm text-slate-500 mt-1">{t("subtitle")}</p>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-6">
        <Input
          placeholder={t("searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <select
          value={modalityFilter}
          onChange={(e) => setModalityFilter(e.target.value)}
          className="px-3 py-2 rounded-lg border text-sm bg-white dark:bg-slate-800"
        >
          <option value="">{t("allModalities")}</option>
          <option value="TEXT">{t("text")}</option>
          <option value="IMAGE">{t("image")}</option>
        </select>
      </div>

      {loading ? (
        <p className="text-slate-400 text-sm">{t("loading")}</p>
      ) : models.length === 0 ? (
        <p className="text-slate-400 text-sm">{t("noModels")}</p>
      ) : (
        <>
          {/* Table */}
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50 text-left">
                  <th className="px-4 py-3 font-bold">{t("colModel")}</th>
                  <th className="px-4 py-3 font-bold">{t("colModality")}</th>
                  <th className="px-4 py-3 font-bold">{t("colCapabilities")}</th>
                  {(!modalityFilter || modalityFilter === "IMAGE") && (
                    <th className="px-4 py-3 font-bold">{t("colSupportedSizes")}</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {paged.map((model) => (
                  <tr
                    key={model.id}
                    className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-800/30"
                  >
                    {/* Model name */}
                    <td className="px-4 py-3">
                      <div className="font-bold text-ds-on-surface">{model.displayName}</div>
                      <div className="text-xs text-slate-400 font-mono">{model.name}</div>
                    </td>

                    {/* Modality */}
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${
                          model.modality === "IMAGE"
                            ? "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300"
                            : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                        }`}
                      >
                        {model.modality === "IMAGE" ? t("image") : t("text")}
                      </span>
                    </td>

                    {/* Capabilities toggles */}
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-3">
                        {CAP_KEYS.map((key) => (
                          <label
                            key={key}
                            className="flex items-center gap-1.5 text-xs cursor-pointer"
                          >
                            <Switch
                              checked={!!(model.capabilities ?? {})[key]}
                              onCheckedChange={(v) => toggleCapability(model, key, v)}
                              className="scale-75"
                            />
                            <span className="text-slate-600 dark:text-slate-300">{t(key)}</span>
                          </label>
                        ))}
                      </div>
                    </td>

                    {/* Supported sizes (image only) */}
                    {(!modalityFilter || modalityFilter === "IMAGE") && (
                      <td className="px-4 py-3">
                        {model.modality === "IMAGE" ? (
                          <SizeEditor
                            sizes={model.supportedSizes ?? []}
                            onRemove={(idx) => removeSize(model, idx)}
                            onAdd={(size) => addSize(model, size)}
                            addLabel={t("addSize")}
                            placeholder={t("sizePlaceholder")}
                          />
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 text-sm text-slate-500">
              <span>
                {t("showing", {
                  from: (page - 1) * pageSize + 1,
                  to: Math.min(page * pageSize, models.length),
                  total: models.length,
                })}
              </span>
              <div className="flex gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                  className="px-3 py-1 rounded border disabled:opacity-30"
                >
                  {t("previous")}
                </button>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage(page + 1)}
                  className="px-3 py-1 rounded border disabled:opacity-30"
                >
                  {t("next")}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </main>
  );
}

/** Inline size editor for image models */
function SizeEditor({
  sizes,
  onRemove,
  onAdd,
  addLabel,
  placeholder,
}: {
  sizes: string[];
  onRemove: (idx: number) => void;
  onAdd: (size: string) => void;
  addLabel: string;
  placeholder: string;
}) {
  const [draft, setDraft] = useState("");

  return (
    <div className="flex flex-wrap gap-1.5 items-center">
      {sizes.map((s, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-xs font-mono"
        >
          {s}
          <button
            onClick={() => onRemove(i)}
            className="text-slate-400 hover:text-red-500 text-xs leading-none"
          >
            ×
          </button>
        </span>
      ))}
      <form
        className="inline-flex"
        onSubmit={(e) => {
          e.preventDefault();
          onAdd(draft);
          setDraft("");
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          className="w-24 px-1.5 py-0.5 text-xs border rounded bg-transparent"
        />
        <button type="submit" className="ml-1 text-xs text-ds-primary hover:underline">
          {addLabel}
        </button>
      </form>
    </div>
  );
}
