"use client";
import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useAsyncData } from "@/hooks/use-async-data";
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

const CAP_LABELS: Record<string, string> = {
  streaming: "streaming",
  json_mode: "json_mode",
  function_calling: "fn_calling",
  vision: "vision",
  reasoning: "reasoning",
  search: "search",
};

export default function ModelCapabilitiesPage() {
  const t = useTranslations("modelCapabilities");
  const [search, setSearch] = useState("");
  const [modalityFilter, setModalityFilter] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const { data: modelsResult, refetch: fetchModels } = useAsyncData<{
    data: ModelItem[];
  }>(async () => {
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

  // Insight stats
  const insights = useMemo(() => {
    let totalCaps = 0;
    for (const m of models) {
      if (m.capabilities) {
        totalCaps += Object.values(m.capabilities).filter(Boolean).length;
      }
    }
    const utilPct = models.length > 0 ? Math.round((totalCaps / (models.length * CAP_KEYS.length)) * 100) : 0;
    return { totalCaps, utilPct, modelCount: models.length };
  }, [models]);

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
    <div className="space-y-10">
      {/* Header */}
      <section>
        <h1 className="text-4xl font-extrabold tracking-tight">{t("title")}</h1>
        <p className="mt-2 text-ds-on-surface-variant text-lg">{t("subtitle")}</p>
      </section>

      {/* Filter & Action Bar */}
      <section className="flex items-center justify-between bg-ds-surface-container-lowest p-4 rounded-xl shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-ds-surface-container-low px-3 py-2 rounded-lg border-b-2 border-ds-primary">
            <span className="material-symbols-outlined text-ds-primary text-sm">filter_list</span>
            <select
              value={modalityFilter}
              onChange={(e) => {
                setModalityFilter(e.target.value);
                setPage(1);
              }}
              className="bg-transparent border-none text-sm font-medium focus:ring-0"
            >
              <option value="">{t("allModalities")}</option>
              <option value="TEXT">{t("text")}</option>
              <option value="IMAGE">{t("image")}</option>
            </select>
          </div>
          <div className="h-6 w-px bg-ds-outline-variant/30" />
          <button className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-ds-primary hover:bg-ds-primary/10 transition-colors rounded-lg">
            <span className="material-symbols-outlined text-lg">add</span>
            {t("bulkUpdate")}
          </button>
        </div>
        <div className="text-xs text-ds-outline font-medium uppercase tracking-widest">
          {t("lastSync", { time: "2 mins ago" })}
        </div>
      </section>

      {loading ? (
        <p className="text-ds-outline text-sm">{t("loading")}</p>
      ) : models.length === 0 ? (
        <p className="text-ds-outline text-sm">{t("noModels")}</p>
      ) : (
        <>
          {/* Grid Table */}
          <section className="bg-ds-surface-container-lowest rounded-xl overflow-hidden shadow-sm">
            {/* Header */}
            <div className="grid grid-cols-12 gap-0 bg-ds-surface-container-low/30 px-6 py-4">
              <div className="col-span-3 text-[10px] uppercase tracking-wider font-bold text-ds-on-surface-variant">
                {t("colModel")}
              </div>
              <div className="col-span-1 text-[10px] uppercase tracking-wider font-bold text-ds-on-surface-variant">
                {t("colModality")}
              </div>
              <div className="col-span-5 text-[10px] uppercase tracking-wider font-bold text-ds-on-surface-variant">
                {t("colCapabilities")}
              </div>
              <div className="col-span-3 text-[10px] uppercase tracking-wider font-bold text-ds-on-surface-variant">
                {t("colConfig")}
              </div>
            </div>

            {/* Rows */}
            <div className="divide-y divide-transparent">
              {paged.map((model) => {
                const isImage = model.modality === "IMAGE";
                return (
                  <div
                    key={model.id}
                    className="grid grid-cols-12 items-center px-6 py-5 hover:bg-ds-surface-container transition-colors duration-200"
                  >
                    {/* Model & ID */}
                    <div className="col-span-3">
                      <p className="font-bold">{model.displayName}</p>
                      <p className="font-mono text-[10px] text-ds-outline mt-0.5">{model.name}</p>
                    </div>

                    {/* Modality */}
                    <div className="col-span-1">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          isImage
                            ? "bg-ds-secondary-container text-ds-on-secondary-container"
                            : "bg-ds-secondary-container text-ds-on-secondary-container"
                        }`}
                      >
                        {isImage ? t("image") : t("text")}
                      </span>
                    </div>

                    {/* Capabilities */}
                    <div
                      className={`col-span-5 flex flex-wrap gap-x-6 gap-y-3 ${isImage ? "opacity-50 cursor-not-allowed" : ""}`}
                    >
                      {CAP_KEYS.map((key) => (
                        <label
                          key={key}
                          className={`flex items-center gap-2 ${isImage ? "cursor-not-allowed" : "cursor-pointer group"}`}
                        >
                          <Switch
                            checked={!!(model.capabilities ?? {})[key]}
                            onCheckedChange={(v) => toggleCapability(model, key, v)}
                            disabled={isImage}
                            className="scale-75"
                          />
                          <span className="text-[11px] font-medium text-ds-on-surface-variant group-hover:text-ds-primary transition-colors">
                            {t(CAP_LABELS[key])}
                          </span>
                        </label>
                      ))}
                    </div>

                    {/* Supported Sizes / Config */}
                    <div className="col-span-3">
                      {isImage ? (
                        <SizeEditor
                          sizes={model.supportedSizes ?? []}
                          onRemove={(idx) => removeSize(model, idx)}
                          onAdd={(size) => addSize(model, size)}
                          placeholder={t("sizePlaceholder")}
                        />
                      ) : (
                        <span className="text-[11px] text-ds-outline italic">
                          {model.capabilities?.vision
                            ? "Vision enabled"
                            : model.capabilities?.reasoning
                              ? "Reasoning enabled"
                              : "\u2014"}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination Footer */}
            <div className="flex items-center justify-between px-6 py-4 bg-ds-surface-container-low">
              <p className="text-xs text-ds-on-surface-variant font-medium">
                {t("showing", {
                  from: (page - 1) * pageSize + 1,
                  to: Math.min(page * pageSize, models.length),
                  total: models.length,
                })}
              </p>
              <div className="flex items-center gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                  className="flex items-center gap-1 px-4 py-2 text-xs font-bold text-ds-outline hover:bg-ds-surface rounded-lg transition-all disabled:opacity-30"
                >
                  <span className="material-symbols-outlined text-sm">chevron_left</span>
                  {t("previous")}
                </button>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage(page + 1)}
                  className="flex items-center gap-1 px-4 py-2 text-xs font-bold text-ds-primary hover:bg-ds-surface rounded-lg transition-all shadow-sm disabled:opacity-30"
                >
                  {t("next")}
                  <span className="material-symbols-outlined text-sm">chevron_right</span>
                </button>
              </div>
            </div>
          </section>

          {/* Insight Cards */}
          <section className="grid grid-cols-3 gap-6">
            <div className="bg-ds-primary p-6 rounded-xl text-ds-on-primary">
              <h3 className="text-sm font-bold opacity-80 uppercase tracking-widest">
                {t("capUtilization")}
              </h3>
              <div className="mt-4 flex items-end gap-2">
                <span className="text-4xl font-extrabold tracking-tighter">{insights.utilPct}%</span>
              </div>
              <div className="mt-4 w-full h-1.5 bg-white/20 rounded-full overflow-hidden">
                <div
                  className="h-full bg-white rounded-full transition-all"
                  style={{ width: `${insights.utilPct}%` }}
                />
              </div>
            </div>
            <div className="bg-ds-surface-container-low p-6 rounded-xl border-b-4 border-ds-secondary-container">
              <h3 className="text-sm font-bold text-ds-outline uppercase tracking-widest">
                {t("enabledFunctions")}
              </h3>
              <div className="mt-4 flex items-center justify-between">
                <div>
                  <p className="text-3xl font-extrabold">{insights.totalCaps}</p>
                  <p className="text-[10px] font-medium text-ds-outline mt-1">
                    {t("acrossModels", { count: insights.modelCount })}
                  </p>
                </div>
                <span className="material-symbols-outlined text-4xl text-ds-secondary-container">
                  data_exploration
                </span>
              </div>
            </div>
            <div className="bg-ds-surface-container-lowest p-6 rounded-xl border border-ds-outline-variant/10 shadow-sm relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-br from-transparent to-ds-surface-container-low opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative z-10">
                <h3 className="text-sm font-bold text-ds-outline uppercase tracking-widest">
                  {t("safetySync")}
                </h3>
                <p className="mt-2 text-xs text-ds-on-surface-variant leading-relaxed">
                  {t("safetySyncDesc")}
                </p>
                <button className="mt-4 text-xs font-bold text-ds-primary flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                  {t("viewSecurityLogs")}
                  <span className="material-symbols-outlined text-sm">arrow_forward</span>
                </button>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

/** Inline size editor for image models */
function SizeEditor({
  sizes,
  onRemove,
  onAdd,
  placeholder,
}: {
  sizes: string[];
  onRemove: (idx: number) => void;
  onAdd: (size: string) => void;
  placeholder: string;
}) {
  const [draft, setDraft] = useState("");

  return (
    <div className="flex flex-wrap gap-2 items-center">
      {sizes.map((s, i) => (
        <div
          key={i}
          className="flex items-center gap-1 px-2 py-1 bg-ds-surface-container-high rounded text-[10px] font-bold"
        >
          {s}
          <button
            onClick={() => onRemove(i)}
            className="material-symbols-outlined text-[12px] text-ds-outline hover:text-ds-error"
          >
            close
          </button>
        </div>
      ))}
      <div className="relative w-20">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onAdd(draft);
              setDraft("");
            }
          }}
          placeholder={placeholder}
          className="w-full bg-ds-surface-container-low border-b border-ds-outline-variant/30 text-[10px] py-1 px-1 focus:outline-none focus:border-ds-primary"
        />
        <button
          onClick={() => {
            onAdd(draft);
            setDraft("");
          }}
          className="absolute right-0 top-1/2 -translate-y-1/2 material-symbols-outlined text-[14px] text-ds-primary"
        >
          add
        </button>
      </div>
    </div>
  );
}
