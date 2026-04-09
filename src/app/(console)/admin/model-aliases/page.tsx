"use client";
import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useAsyncData } from "@/hooks/use-async-data";
import { toast } from "sonner";

// ── Types ──

interface LinkedModel {
  modelId: string;
  modelName: string;
  channels: {
    id: string;
    priority: number;
    status: string;
    providerName: string;
  }[];
}

interface AliasItem {
  id: string;
  alias: string;
  brand: string | null;
  modality: string;
  enabled: boolean;
  contextWindow: number | null;
  maxTokens: number | null;
  capabilities: Record<string, boolean> | null;
  description: string | null;
  linkedModels: LinkedModel[];
  linkedModelCount: number;
  activeChannelCount: number;
}

interface UnlinkedModel {
  id: string;
  name: string;
  displayName: string;
  modality: string;
  channelCount: number;
  providers: string[];
}

interface ApiResponse {
  data: AliasItem[];
  total: number;
  unlinkedModels: UnlinkedModel[];
  unlinkedCount: number;
}

const CAPABILITY_KEYS = [
  "function_calling",
  "streaming",
  "vision",
  "system_prompt",
  "json_mode",
  "image_input",
] as const;

// Capability label keys mapped to i18n — see modelAliases.cap_*

export default function ModelAliasesPage() {
  const t = useTranslations("modelAliases");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editState, setEditState] = useState<Record<string, Partial<AliasItem>>>({});
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createForm, setCreateForm] = useState({ alias: "", brand: "", description: "" });
  const [addModelAliasId, setAddModelAliasId] = useState<string | null>(null);
  const [modelSearch, setModelSearch] = useState("");
  const [newSizeInput, setNewSizeInput] = useState<Record<string, string>>({});

  const {
    data: apiData,
    loading,
    refetch: load,
  } = useAsyncData<ApiResponse>(() => apiFetch<ApiResponse>("/api/admin/model-aliases"), []);

  const aliases = apiData?.data ?? [];
  const unlinkedModels = apiData?.unlinkedModels ?? [];
  const totalAliases = apiData?.total ?? 0;
  const activeAliases = aliases.filter((a) => a.enabled).length;

  // ── Edit helpers ──

  const getEditValue = useCallback(
    <K extends keyof AliasItem>(id: string, key: K): AliasItem[K] => {
      return (editState[id]?.[key] ?? aliases.find((a) => a.id === id)?.[key]) as AliasItem[K];
    },
    [editState, aliases],
  );

  const setEditField = useCallback((id: string, key: string, value: unknown) => {
    setEditState((prev) => ({
      ...prev,
      [id]: { ...prev[id], [key]: value },
    }));
  }, []);

  // ── API actions ──

  const toggleEnabled = async (id: string, enabled: boolean) => {
    try {
      await apiFetch(`/api/admin/model-aliases/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled }),
      });
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const saveChanges = async (id: string) => {
    const changes = editState[id];
    if (!changes || Object.keys(changes).length === 0) return;
    try {
      await apiFetch(`/api/admin/model-aliases/${id}`, {
        method: "PATCH",
        body: JSON.stringify(changes),
      });
      toast.success(t("saved"));
      setEditState((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const discardChanges = (id: string) => {
    setEditState((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const deleteAlias = async (id: string) => {
    try {
      await apiFetch(`/api/admin/model-aliases/${id}`, { method: "DELETE" });
      toast.success(t("aliasDeleted"));
      if (expandedId === id) setExpandedId(null);
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const createAlias = async () => {
    const alias = createForm.alias.trim();
    if (!alias) return;
    try {
      await apiFetch("/api/admin/model-aliases", {
        method: "POST",
        body: JSON.stringify({
          alias,
          ...(createForm.brand ? { brand: createForm.brand } : {}),
          ...(createForm.description ? { description: createForm.description } : {}),
        }),
      });
      toast.success(t("aliasCreated"));
      setCreateForm({ alias: "", brand: "", description: "" });
      setShowCreateDialog(false);
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const linkModel = async (aliasId: string, modelId: string) => {
    try {
      await apiFetch(`/api/admin/model-aliases/${aliasId}/link`, {
        method: "POST",
        body: JSON.stringify({ modelId }),
      });
      toast.success(t("modelLinked"));
      setAddModelAliasId(null);
      setModelSearch("");
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const unlinkModel = async (aliasId: string, modelId: string) => {
    try {
      await apiFetch(`/api/admin/model-aliases/${aliasId}/link/${modelId}`, {
        method: "DELETE",
      });
      toast.success(t("modelUnlinked"));
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const linkUnlinkedModel = async (modelId: string, aliasId: string) => {
    await linkModel(aliasId, modelId);
  };

  const createAliasForModel = async (modelName: string, modelId: string) => {
    try {
      const res = await apiFetch<{ id: string }>("/api/admin/model-aliases", {
        method: "POST",
        body: JSON.stringify({ alias: modelName }),
      });
      await apiFetch(`/api/admin/model-aliases/${res.id}/link`, {
        method: "POST",
        body: JSON.stringify({ modelId }),
      });
      toast.success(t("aliasCreated"));
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const toggleCapability = (id: string, key: string) => {
    const current = (getEditValue(id, "capabilities") ?? {}) as Record<string, unknown>;
    const updated = { ...current, [key]: !current[key] };
    setEditField(id, "capabilities", updated);
  };

  const getSupportedSizes = (id: string): string[] => {
    const caps = (getEditValue(id, "capabilities") ?? {}) as Record<string, unknown>;
    const sizes = caps.supported_sizes;
    return Array.isArray(sizes) ? sizes : [];
  };

  const addSize = (id: string) => {
    const size = (newSizeInput[id] ?? "").trim();
    if (!size) return;
    const caps = (getEditValue(id, "capabilities") ?? {}) as Record<string, unknown>;
    const sizes = Array.isArray(caps.supported_sizes) ? [...caps.supported_sizes] : [];
    if (!sizes.includes(size)) sizes.push(size);
    setEditField(id, "capabilities", { ...caps, supported_sizes: sizes });
    setNewSizeInput((prev) => ({ ...prev, [id]: "" }));
  };

  const removeSize = (id: string, size: string) => {
    const caps = (getEditValue(id, "capabilities") ?? {}) as Record<string, unknown>;
    const sizes = Array.isArray(caps.supported_sizes)
      ? caps.supported_sizes.filter((s: string) => s !== size)
      : [];
    setEditField(id, "capabilities", { ...caps, supported_sizes: sizes });
  };

  if (loading) {
    return <div className="p-12 text-center text-ds-on-surface-variant">{t("loading")}</div>;
  }

  // ── All models for "Add Model" dialog ──
  const allLinkedModelIds = new Set(aliases.flatMap((a) => a.linkedModels.map((lm) => lm.modelId)));
  const availableModels = unlinkedModels.filter(
    (m) =>
      !allLinkedModelIds.has(m.id) &&
      (modelSearch === "" ||
        m.name.toLowerCase().includes(modelSearch.toLowerCase()) ||
        m.displayName.toLowerCase().includes(modelSearch.toLowerCase())),
  );

  return (
    <div className="space-y-10">
      {/* Page Header */}
      <section className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">{t("title")}</h1>
          <p className="text-ds-on-surface-variant mt-1 text-sm">{t("subtitle")}</p>
        </div>
        <button
          className="bg-gradient-to-r from-ds-primary to-ds-primary-container text-ds-on-primary px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-ds-primary/20 hover:opacity-90 active:scale-95 transition-all"
          onClick={() => setShowCreateDialog(true)}
        >
          <span className="material-symbols-outlined text-xl">add</span> {t("createAlias")}
        </button>
      </section>

      {/* Create Dialog */}
      {showCreateDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-ds-surface-container-lowest rounded-2xl p-8 w-full max-w-md shadow-2xl space-y-6">
            <h2 className="text-xl font-extrabold">{t("createAlias")}</h2>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-ds-on-surface-variant uppercase tracking-widest ml-1">
                  {t("aliasName")}
                </label>
                <input
                  className="w-full bg-ds-surface-container-low border-none rounded-lg text-sm px-4 py-2 font-semibold focus:ring-2 focus:ring-ds-primary/20"
                  value={createForm.alias}
                  onChange={(e) => setCreateForm({ ...createForm, alias: e.target.value })}
                  placeholder={t("aliasPlaceholder")}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-ds-on-surface-variant uppercase tracking-widest ml-1">
                  {t("brand")}
                </label>
                <input
                  className="w-full bg-ds-surface-container-low border-none rounded-lg text-sm px-4 py-2 font-semibold focus:ring-2 focus:ring-ds-primary/20"
                  value={createForm.brand}
                  onChange={(e) => setCreateForm({ ...createForm, brand: e.target.value })}
                  placeholder={t("brandPlaceholder")}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-ds-on-surface-variant uppercase tracking-widest ml-1">
                  {t("description")}
                </label>
                <input
                  className="w-full bg-ds-surface-container-low border-none rounded-lg text-sm px-4 py-2 font-semibold focus:ring-2 focus:ring-ds-primary/20"
                  value={createForm.description}
                  onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                />
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button
                className="px-4 py-2 text-xs font-bold text-ds-on-surface-variant hover:text-ds-on-surface"
                onClick={() => setShowCreateDialog(false)}
              >
                {t("cancel")}
              </button>
              <button
                className="bg-ds-primary text-ds-on-primary px-6 py-2 rounded-lg text-xs font-bold shadow-sm active:scale-95 transition-all"
                onClick={createAlias}
              >
                {t("create")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Model Dialog */}
      {addModelAliasId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-ds-surface-container-lowest rounded-2xl p-8 w-full max-w-lg shadow-2xl space-y-6 max-h-[80vh] flex flex-col">
            <h2 className="text-xl font-extrabold">{t("addModel")}</h2>
            <input
              className="w-full bg-ds-surface-container-low border-none rounded-lg text-sm px-4 py-2 font-semibold focus:ring-2 focus:ring-ds-primary/20"
              placeholder={t("searchModels")}
              value={modelSearch}
              onChange={(e) => setModelSearch(e.target.value)}
            />
            <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
              {availableModels.length === 0 ? (
                <p className="text-sm text-ds-on-surface-variant text-center py-8">
                  {t("noModelsAvailable")}
                </p>
              ) : (
                availableModels.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between p-3 bg-ds-surface-container-low rounded-lg hover:bg-ds-surface-container-high transition-colors"
                  >
                    <div>
                      <p className="text-xs font-mono font-medium">{m.name}</p>
                      <p className="text-[10px] text-ds-on-surface-variant">
                        {m.providers.join(", ")} · {m.channelCount} channels
                      </p>
                    </div>
                    <button
                      className="bg-ds-primary text-ds-on-primary px-4 py-1.5 rounded-lg text-[10px] font-bold active:scale-95 transition-all"
                      onClick={() => linkModel(addModelAliasId, m.id)}
                    >
                      {t("link")}
                    </button>
                  </div>
                ))
              )}
            </div>
            <div className="flex justify-end">
              <button
                className="px-4 py-2 text-xs font-bold text-ds-on-surface-variant hover:text-ds-on-surface"
                onClick={() => {
                  setAddModelAliasId(null);
                  setModelSearch("");
                }}
              >
                {t("close")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stats Row */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-ds-surface-container-lowest p-6 rounded-xl flex flex-col gap-1 shadow-sm">
          <span className="text-ds-on-surface-variant uppercase text-[10px] font-bold tracking-widest">
            {t("totalAliases")}
          </span>
          <div className="text-4xl font-extrabold">{totalAliases}</div>
        </div>
        <div className="bg-ds-surface-container-lowest p-6 rounded-xl flex flex-col gap-1 shadow-sm">
          <span className="text-ds-on-surface-variant uppercase text-[10px] font-bold tracking-widest">
            {t("activeAliases")}
          </span>
          <div className="text-4xl font-extrabold">{activeAliases}</div>
        </div>
        <div className="bg-ds-surface-container-lowest p-6 rounded-xl flex flex-col gap-1 shadow-sm">
          <span className="text-ds-on-surface-variant uppercase text-[10px] font-bold tracking-widest">
            {t("unlinkedModels")}
          </span>
          <div className="text-4xl font-extrabold text-ds-tertiary">
            {String(unlinkedModels.length).padStart(2, "0")}
          </div>
          {unlinkedModels.length > 0 && (
            <div className="text-xs text-ds-tertiary mt-1 font-semibold flex items-center gap-1">
              <span className="material-symbols-outlined text-sm">warning</span>{" "}
              {t("requiresMapping")}
            </div>
          )}
        </div>
      </section>

      {/* Alias Cards */}
      <section className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">{t("configuredMappings")}</h2>
        </div>

        {aliases.length === 0 ? (
          <p className="text-ds-on-surface-variant">{t("noAliases")}</p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {aliases.map((alias) => {
              const isExpanded = expandedId === alias.id;
              const caps = (getEditValue(alias.id, "capabilities") ?? {}) as Record<
                string,
                boolean
              >;

              return (
                <div key={alias.id} className={`${isExpanded ? "lg:col-span-3" : ""}`}>
                  <div
                    className={`bg-ds-surface-container-lowest rounded-xl shadow-sm transition-all ${isExpanded ? "p-6 border-l-4 border-ds-primary" : "p-5 hover:shadow-md"}`}
                  >
                    {/* Card Header */}
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-4">
                        <div
                          className={`${isExpanded ? "w-12 h-12" : "w-10 h-10"} bg-ds-surface-container-high rounded-xl flex items-center justify-center text-ds-secondary`}
                        >
                          <span className="material-symbols-outlined">auto_awesome</span>
                        </div>
                        <div>
                          <div className="flex items-center gap-3">
                            <h3
                              className={`${isExpanded ? "text-lg" : "text-base"} font-extrabold`}
                            >
                              {alias.alias}
                            </h3>
                            {alias.brand && (
                              <span className="px-2 py-0.5 bg-ds-secondary-container text-ds-on-secondary-container text-[10px] font-bold rounded uppercase tracking-tighter">
                                {alias.brand}
                              </span>
                            )}
                            <span className="px-2 py-0.5 bg-ds-surface-container-high text-ds-on-surface-variant text-[10px] font-bold rounded uppercase tracking-tighter">
                              {alias.modality}
                            </span>
                          </div>
                          {alias.description && (
                            <p className="text-[11px] text-ds-on-surface-variant mt-1 line-clamp-1">
                              {alias.description}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {isExpanded && (
                          <div className="text-right mr-2">
                            <div className="text-[10px] font-bold text-ds-on-surface-variant uppercase tracking-widest">
                              {t("metadata")}
                            </div>
                            <div className="text-xs font-semibold text-ds-primary">
                              {alias.linkedModelCount} {t("linked")} · {alias.activeChannelCount}{" "}
                              {t("activeChannels")}
                            </div>
                          </div>
                        )}
                        {/* Enabled toggle */}
                        <button
                          className={`relative inline-block ${isExpanded ? "w-10 h-5" : "w-8 h-4"}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleEnabled(alias.id, !alias.enabled);
                          }}
                        >
                          <div
                            className={`${isExpanded ? "w-10 h-5" : "w-8 h-4"} rounded-full transition-colors ${alias.enabled ? "bg-ds-primary" : "bg-ds-outline-variant/30"}`}
                          />
                          <div
                            className={`absolute top-0.5 ${isExpanded ? "w-4 h-4 left-0.5" : "w-3 h-3 left-0.5"} bg-ds-surface-container-lowest rounded-full transition-transform ${alias.enabled ? (isExpanded ? "translate-x-5" : "translate-x-4") : ""}`}
                          />
                        </button>
                        {/* Delete */}
                        <button
                          className="text-ds-on-surface-variant hover:text-ds-error transition-colors p-1"
                          title={t("deleteAlias")}
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteAlias(alias.id);
                          }}
                        >
                          <span className="material-symbols-outlined">delete</span>
                        </button>
                        {/* Expand/Collapse */}
                        <button
                          className="text-ds-on-surface-variant hover:text-ds-primary transition-colors"
                          onClick={() => setExpandedId(isExpanded ? null : alias.id)}
                        >
                          <span className="material-symbols-outlined">
                            {isExpanded ? "keyboard_arrow_up" : "keyboard_arrow_down"}
                          </span>
                        </button>
                      </div>
                    </div>

                    {/* Collapsed footer */}
                    {!isExpanded && (
                      <div className="pt-4 mt-4 border-t border-ds-surface-variant/30 flex justify-between items-center">
                        <span className="text-[10px] font-bold text-ds-primary uppercase">
                          {alias.linkedModelCount} {t("linkedModels")}
                        </span>
                      </div>
                    )}

                    {/* Expanded Detail */}
                    {isExpanded && (
                      <div className="mt-8 pt-8 border-t border-ds-surface-variant flex flex-col gap-8">
                        {/* Metadata Fields */}
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-ds-on-surface-variant uppercase tracking-widest ml-1">
                              {t("brand")}
                            </label>
                            <input
                              className="w-full bg-ds-surface-container-low border-none rounded-lg text-sm px-4 py-2 font-semibold focus:ring-2 focus:ring-ds-primary/20"
                              value={(getEditValue(alias.id, "brand") as string) ?? ""}
                              onChange={(e) =>
                                setEditField(alias.id, "brand", e.target.value || null)
                              }
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-ds-on-surface-variant uppercase tracking-widest ml-1">
                              {t("contextWindow")}
                            </label>
                            <input
                              className="w-full bg-ds-surface-container-low border-none rounded-lg text-sm px-4 py-2 font-semibold focus:ring-2 focus:ring-ds-primary/20"
                              type="number"
                              value={getEditValue(alias.id, "contextWindow") ?? ""}
                              onChange={(e) =>
                                setEditField(
                                  alias.id,
                                  "contextWindow",
                                  e.target.value ? parseInt(e.target.value) : null,
                                )
                              }
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-ds-on-surface-variant uppercase tracking-widest ml-1">
                              {t("maxTokens")}
                            </label>
                            <input
                              className="w-full bg-ds-surface-container-low border-none rounded-lg text-sm px-4 py-2 font-semibold focus:ring-2 focus:ring-ds-primary/20"
                              type="number"
                              value={getEditValue(alias.id, "maxTokens") ?? ""}
                              onChange={(e) =>
                                setEditField(
                                  alias.id,
                                  "maxTokens",
                                  e.target.value ? parseInt(e.target.value) : null,
                                )
                              }
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-ds-on-surface-variant uppercase tracking-widest ml-1">
                              {t("description")}
                            </label>
                            <input
                              className="w-full bg-ds-surface-container-low border-none rounded-lg text-sm px-4 py-2 font-semibold focus:ring-2 focus:ring-ds-primary/20"
                              value={(getEditValue(alias.id, "description") as string) ?? ""}
                              onChange={(e) =>
                                setEditField(alias.id, "description", e.target.value || null)
                              }
                            />
                          </div>
                        </div>

                        {/* Capabilities */}
                        <div className="flex flex-col gap-4">
                          <h4 className="text-sm font-bold flex items-center gap-2">
                            <span className="material-symbols-outlined text-base">settings</span>{" "}
                            {t("capabilities")}
                          </h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4 bg-ds-surface-container-low/30 p-4 rounded-xl">
                            {CAPABILITY_KEYS.map((key) => (
                              <div key={key} className="flex items-center justify-between">
                                <span className="text-sm font-semibold text-ds-on-surface-variant">
                                  {t(`cap_${key}`)}
                                </span>
                                <button
                                  className="relative inline-block w-10 h-5"
                                  onClick={() => toggleCapability(alias.id, key)}
                                >
                                  <div
                                    className={`w-10 h-5 rounded-full transition-colors ${caps[key] ? "bg-ds-primary" : "bg-ds-outline-variant/30"}`}
                                  />
                                  <div
                                    className={`absolute left-0.5 top-0.5 w-4 h-4 bg-ds-surface-container-lowest rounded-full transition-transform ${caps[key] ? "translate-x-5" : ""}`}
                                  />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Supported Sizes */}
                        <div className="flex flex-col gap-4">
                          <h4 className="text-sm font-bold flex items-center gap-2">
                            <span className="material-symbols-outlined text-base">
                              aspect_ratio
                            </span>{" "}
                            {t("supportedSizes")}
                          </h4>
                          <div className="bg-ds-surface-container-low/30 p-4 rounded-xl flex flex-wrap gap-2 items-center">
                            {getSupportedSizes(alias.id).map((size) => (
                              <div
                                key={size}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-ds-surface-container-lowest rounded-lg border border-ds-outline-variant shadow-sm transition-all hover:border-ds-primary group"
                              >
                                <span className="text-xs font-bold">{size}</span>
                                <button
                                  className="text-ds-on-surface-variant hover:text-ds-error flex items-center"
                                  onClick={() => removeSize(alias.id, size)}
                                >
                                  <span className="material-symbols-outlined text-sm">close</span>
                                </button>
                              </div>
                            ))}
                            <div className="relative flex-1 min-w-[200px]">
                              <input
                                className="w-full bg-ds-surface-container-lowest border-2 border-dashed border-ds-outline-variant rounded-lg text-xs px-3 py-1.5 font-bold focus:border-ds-primary focus:ring-0 placeholder:text-ds-on-surface-variant/50 transition-all"
                                placeholder={t("sizePlaceholder")}
                                value={newSizeInput[alias.id] ?? ""}
                                onChange={(e) =>
                                  setNewSizeInput((prev) => ({
                                    ...prev,
                                    [alias.id]: e.target.value,
                                  }))
                                }
                                onKeyDown={(e) => e.key === "Enter" && addSize(alias.id)}
                              />
                              <button
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-ds-primary hover:scale-110 transition-transform flex items-center"
                                onClick={() => addSize(alias.id)}
                              >
                                <span className="material-symbols-outlined text-xl">
                                  add_circle
                                </span>
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Linked Infrastructure */}
                        <div className="flex flex-col gap-4">
                          <h4 className="text-sm font-bold flex items-center gap-2">
                            <span className="material-symbols-outlined text-base">link</span>{" "}
                            {t("linkedInfrastructure")}
                          </h4>
                          <div className="overflow-x-auto">
                            <table className="w-full text-left border-separate border-spacing-y-2">
                              <thead>
                                <tr className="text-[10px] font-bold text-ds-on-surface-variant uppercase tracking-widest">
                                  <th className="pb-2 pl-4">{t("colModelId")}</th>
                                  <th className="pb-2">{t("colProvider")}</th>
                                  <th className="pb-2">{t("colStatus")}</th>
                                  <th className="pb-2 text-center">{t("colPriority")}</th>
                                  <th className="pb-2 pr-4 text-right">{t("colActions")}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {alias.linkedModels.flatMap((lm) =>
                                  lm.channels.map((ch) => (
                                    <tr
                                      key={ch.id}
                                      className="bg-ds-surface-container-low group hover:bg-ds-surface-container-high transition-colors"
                                    >
                                      <td className="py-3 px-4 rounded-l-xl font-mono text-xs font-medium">
                                        {lm.modelName}
                                      </td>
                                      <td className="py-3 text-xs font-semibold">
                                        {ch.providerName}
                                      </td>
                                      <td className="py-3">
                                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-ds-secondary-container text-ds-on-secondary-container text-[10px] font-bold rounded uppercase tracking-tighter">
                                          {ch.status}
                                        </span>
                                      </td>
                                      <td className="py-3 text-center text-xs font-bold text-ds-primary">
                                        P{ch.priority}
                                      </td>
                                      <td className="py-3 px-4 rounded-r-xl text-right">
                                        <button
                                          className="text-ds-on-surface-variant hover:text-ds-error transition-colors p-1"
                                          onClick={() => unlinkModel(alias.id, lm.modelId)}
                                        >
                                          <span className="material-symbols-outlined text-sm">
                                            close
                                          </span>
                                        </button>
                                      </td>
                                    </tr>
                                  )),
                                )}
                              </tbody>
                            </table>
                          </div>
                          <div className="flex justify-between items-center mt-2">
                            <button
                              className="text-ds-primary text-xs font-bold flex items-center gap-1.5 hover:underline"
                              onClick={() => setAddModelAliasId(alias.id)}
                            >
                              <span className="material-symbols-outlined text-sm">add_circle</span>{" "}
                              {t("addModelMapping")}
                            </button>
                            {editState[alias.id] && Object.keys(editState[alias.id]).length > 0 && (
                              <div className="flex gap-3">
                                <button
                                  className="px-4 py-2 text-xs font-bold text-ds-on-surface-variant hover:text-ds-on-surface"
                                  onClick={() => discardChanges(alias.id)}
                                >
                                  {t("discard")}
                                </button>
                                <button
                                  className="bg-ds-primary text-ds-on-primary px-6 py-2 rounded-lg text-xs font-bold shadow-sm active:scale-95 transition-all"
                                  onClick={() => saveChanges(alias.id)}
                                >
                                  {t("saveChanges")}
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Unlinked Models */}
      {unlinkedModels.length > 0 && (
        <section className="bg-ds-surface-container-low/50 p-8 rounded-2xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-ds-tertiary-fixed rounded-full flex items-center justify-center text-ds-tertiary">
              <span className="material-symbols-outlined">warning</span>
            </div>
            <div>
              <h2 className="text-xl font-bold">{t("unlinkedModelsTitle")}</h2>
              <p className="text-xs text-ds-on-surface-variant">{t("unlinkedModelsDesc")}</p>
            </div>
          </div>
          <div className="bg-ds-surface-container-lowest rounded-xl overflow-hidden shadow-sm">
            <table className="w-full text-left">
              <thead className="bg-ds-surface-container-high/30">
                <tr className="text-[10px] font-bold text-ds-on-surface-variant uppercase tracking-widest">
                  <th className="py-4 px-6">{t("colModel")}</th>
                  <th className="py-4">{t("colProvider")}</th>
                  <th className="py-4">{t("colModality")}</th>
                  <th className="py-4">{t("colChannels")}</th>
                  <th className="py-4 px-6 text-right">{t("colActions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ds-surface-variant/20">
                {unlinkedModels.map((m) => (
                  <tr key={m.id} className="hover:bg-ds-surface-container-low transition-colors">
                    <td className="py-4 px-6 text-xs font-mono font-medium">{m.name}</td>
                    <td className="py-4 text-xs font-semibold">{m.providers.join(", ")}</td>
                    <td className="py-4">
                      <span className="text-[10px] font-bold text-ds-on-surface-variant bg-ds-surface-container px-2 py-0.5 rounded uppercase">
                        {m.modality}
                      </span>
                    </td>
                    <td className="py-4 text-xs font-bold text-ds-on-surface-variant">
                      {m.channelCount}
                    </td>
                    <td className="py-4 px-6 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          className="text-ds-primary text-[10px] font-bold hover:underline px-3 py-1"
                          onClick={() => createAliasForModel(m.name, m.id)}
                        >
                          {t("createAliasAction")}
                        </button>
                        <select
                          className="bg-ds-surface-container-low border-none rounded-md text-[10px] font-bold px-2 py-1 focus:ring-1 focus:ring-ds-primary/30"
                          value=""
                          onChange={(e) => {
                            if (e.target.value) linkUnlinkedModel(m.id, e.target.value);
                          }}
                        >
                          <option value="">{t("linkTo")}</option>
                          {aliases.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.alias}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
