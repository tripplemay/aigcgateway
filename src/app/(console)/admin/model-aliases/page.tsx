"use client";
import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useAsyncData } from "@/hooks/use-async-data";
import { SearchBar } from "@/components/search-bar";
import { toast } from "sonner";
import { useExchangeRate } from "@/hooks/use-exchange-rate";
import { ChannelTable, type ChannelRowData } from "@/components/admin/channel-table";
import { PageContainer } from "@/components/page-container";
import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { TableCard } from "@/components/table-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Pagination } from "@/components/pagination";

const FILTER_BRAND_ALL = "__all__";
const FILTER_MODALITY_ALL = "__all__";
const LINK_TO_PLACEHOLDER = "__placeholder__";
import type { AliasItem, ApiResponse } from "./_types";
import {
  applyAliasPatch,
  applyChannelReorder,
  applyDeleteAlias,
  applyToggleEnabled,
  applyUnlinkModel,
  isAliasEnabledStillTarget,
} from "./_helpers";

interface OpenRouterPrices {
  prices: Record<string, { inputPer1M: number; outputPer1M: number }>;
  rate: number;
}

const CAPABILITY_KEYS = [
  "function_calling",
  "streaming",
  "vision",
  "system_prompt",
  "json_mode",
  "reasoning",
  "search",
] as const;

type SortKey = "alias" | "enabled" | "updatedAt";
type FilterEnabled = "all" | "enabled" | "disabled";

const PAGE_SIZE = 20;
const MODALITY_OPTIONS = ["TEXT", "IMAGE", "EMBEDDING", "AUDIO", "VIDEO"] as const;

export default function ModelAliasesPage() {
  const t = useTranslations("modelAliases");
  const exchangeRate = useExchangeRate();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editState, setEditState] = useState<Record<string, Partial<AliasItem>>>({});
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createForm, setCreateForm] = useState({ alias: "", brand: "", description: "" });
  const [addModelAliasId, setAddModelAliasId] = useState<string | null>(null);
  const [modelSearch, setModelSearch] = useState("");
  const [newSizeInput, setNewSizeInput] = useState<Record<string, string>>({});
  const [editingNumField, setEditingNumField] = useState<string | null>(null);

  // F-AAU-08: Search / Filter / Sort / Pagination state. All filter
  // changes reset page to 1 (via the `applyFilter` setters); manual page
  // navigation does not reset filters.
  const [search, setSearch] = useState("");
  const [filterBrand, setFilterBrand] = useState("");
  const [filterModality, setFilterModality] = useState("");
  const [filterEnabled, setFilterEnabled] = useState<FilterEnabled>("all");
  const [sortKey, setSortKey] = useState<SortKey>("enabled");
  const [page, setPage] = useState(1);

  const setSearchAndResetPage = useCallback((v: string) => {
    setSearch(v);
    setPage(1);
  }, []);
  const setFilterBrandAndResetPage = useCallback((v: string) => {
    setFilterBrand(v);
    setPage(1);
  }, []);
  const setFilterModalityAndResetPage = useCallback((v: string) => {
    setFilterModality(v);
    setPage(1);
  }, []);
  const setFilterEnabledAndResetPage = useCallback((v: FilterEnabled) => {
    setFilterEnabled(v);
    setPage(1);
  }, []);
  const setSortKeyAndResetPage = useCallback((v: SortKey) => {
    setSortKey(v);
    setPage(1);
  }, []);

  const {
    data: apiData,
    loading,
    refetch: load,
    mutate,
  } = useAsyncData<ApiResponse>(() => {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(PAGE_SIZE),
      sortKey,
    });
    if (search) params.set("search", search);
    if (filterBrand) params.set("brand", filterBrand);
    if (filterModality) params.set("modality", filterModality);
    if (filterEnabled === "enabled") params.set("enabled", "true");
    else if (filterEnabled === "disabled") params.set("enabled", "false");
    return apiFetch<ApiResponse>(`/api/admin/model-aliases?${params.toString()}`);
  }, [page, search, filterBrand, filterModality, filterEnabled, sortKey]);

  const { data: priceData } = useAsyncData<OpenRouterPrices>(
    () => apiFetch<OpenRouterPrices>("/api/admin/openrouter-prices"),
    [],
  );

  const aliases = apiData?.data ?? [];
  const orPrices = priceData?.prices ?? {};
  const unlinkedModels = apiData?.unlinkedModels ?? [];
  const totalAliases = apiData?.pagination.total ?? 0;
  const totalPages = apiData?.pagination.totalPages ?? 1;
  // activeAliases on the current page only — without an extra count query
  // we cannot show the table-wide enabled count under server pagination.
  // Stat-card label is generic ("active") so this is acceptable; switching
  // to a global count would need a new endpoint or a second query here.
  const activeAliases = aliases.filter((a) => a.enabled).length;

  // F-AAU-08: brand list comes from the server (distinct across all
  // aliases) so the dropdown stays complete after filtering. Modalities
  // are a fixed enum, hardcoded above (MODALITY_OPTIONS).
  const availableBrands = apiData?.availableBrands ?? [];

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

  const getAliasWarnings = (alias: AliasItem) => {
    const sp = alias.sellPrice as Record<string, unknown> | null;
    const hasSellPrice =
      sp != null &&
      Object.keys(sp).some((k) =>
        ["inputPer1M", "outputPer1M", "perCall"].includes(k) &&
        typeof (sp as Record<string, unknown>)[k] === "number",
      );
    const allChannels = alias.linkedModels.flatMap((lm) => lm.channels);
    const hasChannels = allChannels.length > 0;
    const allFail = hasChannels && allChannels.every((ch) => ch.lastHealthResult === "FAIL");
    return { hasSellPrice, hasChannels, allFail };
  };

  const toggleEnabled = async (id: string, enabled: boolean) => {
    // Pre-flight warnings — must fire before optimistic apply so the user
    // sees the warning toast even on the synchronous local update.
    if (enabled) {
      const alias = aliases.find((a) => a.id === id);
      if (alias) {
        const { hasSellPrice, allFail } = getAliasWarnings(alias);
        if (!hasSellPrice) toast.warning(t("toastEnabledNoSellPrice"));
        if (allFail) toast.warning(t("toastEnabledAllFail"));
      }
    }
    // F-AAU-03: optimistic toggle. Rollback is race-protected — if a
    // subsequent toggle has already flipped enabled to a different value
    // by the time this PATCH rejects, we leave that newer state alone.
    const prev = apiData;
    mutate((cur) => applyToggleEnabled(cur, id, enabled));
    try {
      await apiFetch(`/api/admin/model-aliases/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled }),
      });
    } catch (err) {
      mutate((cur) => (isAliasEnabledStillTarget(cur, id, enabled) ? prev : cur));
      toast.error((err as Error).message);
    }
  };

  const saveChanges = async (id: string) => {
    const rawChanges = { ...editState[id] };
    if (!rawChanges || Object.keys(rawChanges).length === 0) return;
    // CNY → USD conversion for sellPrice (request payload only — local
    // optimistic patch keeps the CNY-displayed editState; the next server
    // refetch will normalise back to USD shape).
    const requestChanges: Partial<AliasItem> = { ...rawChanges };
    if (requestChanges.sellPrice) {
      const sp = requestChanges.sellPrice as Record<string, unknown>;
      const converted: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(sp)) {
        if (
          (k === "inputPer1M" || k === "outputPer1M" || k === "perCall") &&
          typeof v === "number"
        ) {
          converted[k] = v / exchangeRate;
        } else {
          converted[k] = v;
        }
      }
      // Auto-fill unit if missing (Layer 2 — frontend guard)
      if (!converted.unit) {
        if (converted.inputPer1M !== undefined || converted.outputPer1M !== undefined) {
          converted.unit = "token";
        } else if (converted.perCall !== undefined) {
          converted.unit = "call";
        }
      }
      requestChanges.sellPrice = converted;
    }
    // F-AAU-05: optimistic spread-merge. On failure rollback prev state
    // but keep editState[id] so the user can correct + retry.
    const prev = apiData;
    mutate((cur) => applyAliasPatch(cur, id, requestChanges));
    try {
      await apiFetch(`/api/admin/model-aliases/${id}`, {
        method: "PATCH",
        body: JSON.stringify(requestChanges),
      });
      toast.success(t("saved"));
      setEditState((prevEdit) => {
        const next = { ...prevEdit };
        delete next[id];
        return next;
      });
    } catch (err) {
      mutate(prev);
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
    // F-AAU-07: optimistic remove + expandedId cleanup; rollback on failure.
    const prev = apiData;
    mutate((cur) => applyDeleteAlias(cur, id));
    if (expandedId === id) setExpandedId(null);
    try {
      await apiFetch(`/api/admin/model-aliases/${id}`, { method: "DELETE" });
      toast.success(t("aliasDeleted"));
    } catch (err) {
      mutate(prev);
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
    // F-AAU-06 (half optimistic): POST /link returns the linked entry but
    // not the channel set the new model brings — we'd have to fabricate
    // priority + provider data optimistically, so fall back to a scoped
    // refetch (mutate() with no arg) instead of integral page load.
    try {
      await apiFetch(`/api/admin/model-aliases/${aliasId}/link`, {
        method: "POST",
        body: JSON.stringify({ modelId }),
      });
      toast.success(t("modelLinked"));
      setAddModelAliasId(null);
      setModelSearch("");
      mutate();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const unlinkModel = async (aliasId: string, modelId: string) => {
    // F-AAU-06 (strict optimistic): filter the modelId out + recompute
    // counts immediately; rollback on failure.
    const prev = apiData;
    mutate((cur) => applyUnlinkModel(cur, aliasId, modelId));
    try {
      await apiFetch(`/api/admin/model-aliases/${aliasId}/link/${modelId}`, {
        method: "DELETE",
      });
      toast.success(t("modelUnlinked"));
    } catch (err) {
      mutate(prev);
      toast.error((err as Error).message);
    }
  };

  const reorderChannels = async (orderedIds: string[]) => {
    // F-AAU-04: optimistic priority rewrite. The drag source is bound to
    // a single alias's ChannelTable, so all `orderedIds` belong to that
    // alias — find it by matching the first id, then re-stamp priority
    // = i+1. Combined with F-AAU-01's flatMap+sort, the ChannelTable
    // re-renders in the new order without a refetch.
    if (orderedIds.length === 0) return;
    const aliasId = apiData?.data.find((a) =>
      a.linkedModels.some((lm) => lm.channels.some((ch) => ch.id === orderedIds[0])),
    )?.id;
    const prev = apiData;
    if (aliasId) {
      mutate((cur) => applyChannelReorder(cur, aliasId, orderedIds));
    }
    try {
      await Promise.all(
        orderedIds.map((id, i) =>
          apiFetch(`/api/admin/channels/${id}`, {
            method: "PATCH",
            body: JSON.stringify({ priority: i + 1 }),
          }),
        ),
      );
      // race-on-rollback: 失败概率低，simple rollback 接受可能覆盖后续操作的
      // 小概率风险（spec D2.3 妥协，仅 toggleEnabled 走严格 race protection）
    } catch (err) {
      mutate(prev);
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

  // ── Sell Price helpers ──

  const getSellPrice = (id: string) => {
    // If user has edited sellPrice, return as-is (already CNY)
    if (editState[id]?.sellPrice) {
      return editState[id].sellPrice as Record<string, unknown>;
    }
    // Otherwise convert from USD (DB) to CNY for display
    const raw = (aliases.find((a) => a.id === id)?.sellPrice ?? {}) as Record<string, unknown>;
    const converted: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(raw)) {
      if ((k === "inputPer1M" || k === "outputPer1M" || k === "perCall") && typeof v === "number") {
        converted[k] = Math.round(v * exchangeRate * 100) / 100;
      } else {
        converted[k] = v;
      }
    }
    return converted;
  };

  const setSellPriceField = (id: string, field: string, value: string) => {
    const current = getSellPrice(id);
    const num = value === "" ? undefined : parseFloat(value);
    // F-AO2-08: keep the unit discriminator in sync with the field being
    // edited so backend cost calculators pick the right branch.
    const unit = field === "perCall" ? "call" : "token";
    setEditField(id, "sellPrice", { ...current, [field]: num, unit });
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
    <PageContainer>
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          <Button variant="gradient-primary" size="lg" onClick={() => setShowCreateDialog(true)}>
            <span className="material-symbols-outlined text-xl">add</span> {t("createAlias")}
          </Button>
        }
      />

      {/* Create Dialog */}
      {showCreateDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-ds-surface rounded-2xl p-8 w-full max-w-md shadow-2xl space-y-6">
            <h2 className="text-xl font-extrabold">{t("createAlias")}</h2>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="label-caps ml-1">{t("aliasName")}</label>
                <Input
                  className="w-full bg-ds-surface-container-low border-none rounded-lg text-sm px-4 py-2 font-semibold focus:ring-2 focus:ring-ds-primary/20"
                  value={createForm.alias}
                  onChange={(e) => setCreateForm({ ...createForm, alias: e.target.value })}
                  placeholder={t("aliasPlaceholder")}
                />
              </div>
              <div className="space-y-1.5">
                <label className="label-caps ml-1">{t("brand")}</label>
                <Input
                  className="w-full bg-ds-surface-container-low border-none rounded-lg text-sm px-4 py-2 font-semibold focus:ring-2 focus:ring-ds-primary/20"
                  value={createForm.brand}
                  onChange={(e) => setCreateForm({ ...createForm, brand: e.target.value })}
                  placeholder={t("brandPlaceholder")}
                />
              </div>
              <div className="space-y-1.5">
                <label className="label-caps ml-1">{t("description")}</label>
                <Input
                  className="w-full bg-ds-surface-container-low border-none rounded-lg text-sm px-4 py-2 font-semibold focus:ring-2 focus:ring-ds-primary/20"
                  value={createForm.description}
                  onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                />
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <Button
                variant="ghost"
                className="px-4 py-2 text-xs font-bold text-ds-on-surface-variant hover:text-ds-on-surface"
                onClick={() => setShowCreateDialog(false)}
              >
                {t("cancel")}
              </Button>
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
          <div className="bg-ds-surface rounded-2xl p-8 w-full max-w-lg shadow-2xl space-y-6 max-h-[80vh] flex flex-col">
            <h2 className="text-xl font-extrabold">{t("addModel")}</h2>
            <Input
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
                        {m.providers.join(", ")} · {m.channelCount} {t("channels")}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="bg-ds-primary text-ds-on-primary px-4 py-1.5 rounded-lg text-[10px] font-bold active:scale-95 transition-all"
                      onClick={() => linkModel(addModelAliasId, m.id)}
                    >
                      {t("link")}
                    </Button>
                  </div>
                ))
              )}
            </div>
            <div className="flex justify-end">
              <Button
                variant="ghost"
                className="px-4 py-2 text-xs font-bold text-ds-on-surface-variant hover:text-ds-on-surface"
                onClick={() => {
                  setAddModelAliasId(null);
                  setModelSearch("");
                }}
              >
                {t("close")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Stats Row */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <SectionCard className="[&>div]:flex [&>div]:flex-col [&>div]:gap-1">
          <span className="text-ds-on-surface-variant uppercase text-[10px] font-bold tracking-widest">
            {t("totalAliases")}
          </span>
          <div className="text-4xl font-extrabold">{totalAliases}</div>
        </SectionCard>
        <SectionCard className="[&>div]:flex [&>div]:flex-col [&>div]:gap-1">
          <span className="text-ds-on-surface-variant uppercase text-[10px] font-bold tracking-widest">
            {t("activeAliases")}
          </span>
          <div className="text-4xl font-extrabold">{activeAliases}</div>
        </SectionCard>
        <SectionCard className="[&>div]:flex [&>div]:flex-col [&>div]:gap-1">
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
        </SectionCard>
      </section>

      {/* ═══ Alias List (single-column) ═══ */}
      <section className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">{t("configuredMappings")}</h2>
        </div>

        {/* Search + Filters + Sort */}
        <div className="flex flex-wrap items-center gap-3">
          <SearchBar
            placeholder={t("searchAliases")}
            value={search}
            onChange={setSearchAndResetPage}
            className="w-64"
          />
          {/* Brand filter */}
          <Select
            value={filterBrand === "" ? FILTER_BRAND_ALL : filterBrand}
            onValueChange={(v) =>
              setFilterBrandAndResetPage(!v || v === FILTER_BRAND_ALL ? "" : v)
            }
          >
            <SelectTrigger className="bg-ds-surface-container-low border-none rounded-full text-xs font-bold px-4 py-2 focus:ring-1 focus:ring-ds-primary/30">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={FILTER_BRAND_ALL}>{t("allBrands")}</SelectItem>
              {availableBrands.map((b) => (
                <SelectItem key={b} value={b}>
                  {b}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* Modality filter */}
          <Select
            value={filterModality === "" ? FILTER_MODALITY_ALL : filterModality}
            onValueChange={(v) =>
              setFilterModalityAndResetPage(!v || v === FILTER_MODALITY_ALL ? "" : v)
            }
          >
            <SelectTrigger className="bg-ds-surface-container-low border-none rounded-full text-xs font-bold px-4 py-2 focus:ring-1 focus:ring-ds-primary/30">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={FILTER_MODALITY_ALL}>{t("allModalities")}</SelectItem>
              {MODALITY_OPTIONS.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* Enabled filter */}
          <Select
            value={filterEnabled}
            onValueChange={(v) => v && setFilterEnabledAndResetPage(v as FilterEnabled)}
          >
            <SelectTrigger className="bg-ds-surface-container-low border-none rounded-full text-xs font-bold px-4 py-2 focus:ring-1 focus:ring-ds-primary/30">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("allStatus")}</SelectItem>
              <SelectItem value="enabled">{t("enabledOnly")}</SelectItem>
              <SelectItem value="disabled">{t("disabledOnly")}</SelectItem>
            </SelectContent>
          </Select>
          {/* Sort */}
          <Select
            value={sortKey}
            onValueChange={(v) => v && setSortKeyAndResetPage(v as SortKey)}
          >
            <SelectTrigger className="bg-ds-surface-container-low border-none rounded-full text-xs font-bold px-4 py-2 focus:ring-1 focus:ring-ds-primary/30">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="enabled">{t("sortEnabled")}</SelectItem>
              <SelectItem value="alias">{t("sortName")}</SelectItem>
              <SelectItem value="updatedAt">{t("sortUpdated")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {aliases.length === 0 ? (
          <p className="text-ds-on-surface-variant text-center py-8">{t("noAliases")}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {aliases.map((alias) => {
              const isExpanded = expandedId === alias.id;
              const caps = (getEditValue(alias.id, "capabilities") ?? {}) as Record<
                string,
                boolean
              >;
              const sp = getSellPrice(alias.id);
              const warnings = alias.enabled ? getAliasWarnings(alias) : null;

              return (
                <SectionCard
                  key={alias.id}
                  className={`transition-all ${isExpanded ? "border-l-4 border-ds-primary" : ""}`}
                >
                  {/* Row header */}
                  <div
                    className="flex items-center gap-4 px-6 py-4 cursor-pointer hover:bg-ds-surface-container-low/50 transition-colors"
                    onClick={() => setExpandedId(isExpanded ? null : alias.id)}
                  >
                    {/* Alias name */}
                    <h3 className="text-sm font-extrabold min-w-0 truncate flex-shrink-0 w-48">
                      {alias.alias}
                    </h3>
                    {/* Brand badge */}
                    {alias.brand && (
                      <span className="px-2 py-0.5 bg-ds-secondary-container text-ds-on-secondary-container text-[10px] font-bold rounded uppercase tracking-tighter flex-shrink-0">
                        {alias.brand}
                      </span>
                    )}
                    {/* Chain status warning badges (only for enabled aliases) */}
                    {warnings && !warnings.hasSellPrice && (
                      <span className="px-2 py-0.5 bg-ds-tertiary-container text-ds-on-tertiary-container text-[10px] font-bold rounded uppercase tracking-tighter flex-shrink-0 flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm">warning</span>
                        {t("chainStatusWarnNoSellPrice")}
                      </span>
                    )}
                    {warnings && warnings.allFail && (
                      <span className="px-2 py-0.5 bg-ds-error-container text-ds-on-error-container text-[10px] font-bold rounded uppercase tracking-tighter flex-shrink-0 flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm">error</span>
                        {t("chainStatusWarnAllFail")}
                      </span>
                    )}
                    {/* Modality badge */}
                    <span className="px-2 py-0.5 bg-ds-surface-container-high text-ds-on-surface-variant text-[10px] font-bold rounded uppercase tracking-tighter flex-shrink-0">
                      {alias.modality}
                    </span>
                    {/* Linked count */}
                    <span className="text-xs text-ds-on-surface-variant flex-shrink-0">
                      {alias.linkedModelCount} {t("linkedModels")}
                    </span>
                    {/* Market price (OpenRouter) */}
                    <span className="text-xs text-ds-on-surface-variant flex-shrink-0 font-mono">
                      {alias.openRouterModelId && orPrices[alias.openRouterModelId]
                        ? `¥${orPrices[alias.openRouterModelId].inputPer1M.toFixed(2)} / ¥${orPrices[alias.openRouterModelId].outputPer1M.toFixed(2)}`
                        : "—"}
                    </span>
                    {/* Spacer */}
                    <div className="flex-1" />
                    {/* Enabled toggle */}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="relative inline-block w-10 h-5 flex-shrink-0 p-0"
                      aria-pressed={alias.enabled}
                      aria-label={t("deleteAlias")}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleEnabled(alias.id, !alias.enabled);
                      }}
                    >
                      <div
                        className={`w-10 h-5 rounded-full transition-colors ${alias.enabled ? "bg-ds-primary" : "bg-ds-outline-variant/30"}`}
                      />
                      <div
                        className={`absolute left-0.5 top-0.5 w-4 h-4 bg-ds-surface-container-lowest rounded-full transition-transform ${alias.enabled ? "translate-x-5" : ""}`}
                      />
                    </Button>
                    {/* Delete */}
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-ds-on-surface-variant hover:text-ds-error transition-colors p-1 flex-shrink-0"
                      title={t("deleteAlias")}
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteAlias(alias.id);
                      }}
                    >
                      <span className="material-symbols-outlined text-xl">delete</span>
                    </Button>
                    {/* Expand arrow */}
                    <span className="material-symbols-outlined text-ds-on-surface-variant flex-shrink-0">
                      {isExpanded ? "keyboard_arrow_up" : "keyboard_arrow_down"}
                    </span>
                  </div>

                  {/* Expanded accordion detail */}
                  {isExpanded && (
                    <div className="px-6 pb-6 border-t border-ds-surface-variant flex flex-col gap-8">
                      {/* Metadata Fields */}
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 pt-6">
                        <div className="space-y-1.5">
                          <label className="label-caps ml-1">{t("brand")}</label>
                          <Input
                            className="w-full bg-ds-surface-container-low border-none rounded-lg text-sm px-4 py-2 font-semibold focus:ring-2 focus:ring-ds-primary/20"
                            value={(getEditValue(alias.id, "brand") as string) ?? ""}
                            onChange={(e) =>
                              setEditField(alias.id, "brand", e.target.value || null)
                            }
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="label-caps ml-1">{t("contextWindow")}</label>
                          {editingNumField === `${alias.id}_contextWindow` ? (
                            <Input
                              className="w-full bg-ds-surface-container-low border-none rounded-lg text-sm px-4 py-2 font-semibold focus:ring-2 focus:ring-ds-primary/20"
                              type="number"
                              autoFocus
                              value={getEditValue(alias.id, "contextWindow") ?? ""}
                              onChange={(e) =>
                                setEditField(
                                  alias.id,
                                  "contextWindow",
                                  e.target.value ? parseInt(e.target.value) : null,
                                )
                              }
                              onBlur={() => setEditingNumField(null)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") setEditingNumField(null);
                              }}
                            />
                          ) : (
                            <div
                              className="w-full bg-ds-surface-container-low rounded-lg text-sm px-4 py-2 font-semibold cursor-pointer hover:bg-ds-surface-container-low/60 transition-colors min-h-[36px] flex items-center"
                              onClick={() => setEditingNumField(`${alias.id}_contextWindow`)}
                            >
                              {getEditValue(alias.id, "contextWindow") ? (
                                Number(getEditValue(alias.id, "contextWindow")).toLocaleString()
                              ) : (
                                <span className="text-ds-on-surface-variant/40">—</span>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="space-y-1.5">
                          <label className="label-caps ml-1">{t("maxTokens")}</label>
                          {editingNumField === `${alias.id}_maxTokens` ? (
                            <Input
                              className="w-full bg-ds-surface-container-low border-none rounded-lg text-sm px-4 py-2 font-semibold focus:ring-2 focus:ring-ds-primary/20"
                              type="number"
                              autoFocus
                              value={getEditValue(alias.id, "maxTokens") ?? ""}
                              onChange={(e) =>
                                setEditField(
                                  alias.id,
                                  "maxTokens",
                                  e.target.value ? parseInt(e.target.value) : null,
                                )
                              }
                              onBlur={() => setEditingNumField(null)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") setEditingNumField(null);
                              }}
                            />
                          ) : (
                            <div
                              className="w-full bg-ds-surface-container-low rounded-lg text-sm px-4 py-2 font-semibold cursor-pointer hover:bg-ds-surface-container-low/60 transition-colors min-h-[36px] flex items-center"
                              onClick={() => setEditingNumField(`${alias.id}_maxTokens`)}
                            >
                              {getEditValue(alias.id, "maxTokens") ? (
                                Number(getEditValue(alias.id, "maxTokens")).toLocaleString()
                              ) : (
                                <span className="text-ds-on-surface-variant/40">—</span>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="space-y-1.5">
                          <label className="label-caps ml-1">{t("description")}</label>
                          <Input
                            className="w-full bg-ds-surface-container-low border-none rounded-lg text-sm px-4 py-2 font-semibold focus:ring-2 focus:ring-ds-primary/20"
                            value={(getEditValue(alias.id, "description") as string) ?? ""}
                            onChange={(e) =>
                              setEditField(alias.id, "description", e.target.value || null)
                            }
                          />
                        </div>
                      </div>

                      {/* Sell Price */}
                      <div className="flex flex-col gap-4">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-bold flex items-center gap-2">
                            <span className="material-symbols-outlined text-base">payments</span>{" "}
                            {t("sellPrice")} (¥ CNY)
                          </h4>
                          <SuggestPriceButton
                            aliasId={alias.id}
                            onApply={(pricing, orModelId) => {
                              const current = getSellPrice(alias.id);
                              if (pricing.unit === "call") {
                                setEditField(alias.id, "sellPrice", {
                                  ...current,
                                  perCall: pricing.perCallCNY,
                                  unit: "call",
                                });
                              } else {
                                setEditField(alias.id, "sellPrice", {
                                  ...current,
                                  inputPer1M: pricing.inputPriceCNYPerM,
                                  outputPer1M: pricing.outputPriceCNYPerM,
                                  unit: "token",
                                });
                              }
                              if (orModelId) {
                                setEditField(alias.id, "openRouterModelId", orModelId);
                              }
                            }}
                          />
                        </div>
                        {/* F-AO2-08: modality-aware pricing inputs.
                            IMAGE aliases are priced per-call; TEXT/AUDIO/VIDEO
                            use input/output tokens per 1M. Rendering only the
                            relevant row prevents admins from filling the wrong
                            unit and failing the alias.sellPrice shape. */}
                        {alias.modality === "IMAGE" ? (
                          <div className="bg-ds-surface-container-low/30 p-4 rounded-xl">
                            <div className="space-y-1.5 max-w-xs">
                              <label className="label-caps ml-1">{t("perCall")} (¥ / image)</label>
                              <Input
                                className="w-full bg-ds-surface-container-lowest border-none rounded-lg text-sm px-4 py-2 font-semibold focus:ring-2 focus:ring-ds-primary/20"
                                type="number"
                                step="0.001"
                                value={(sp.perCall as number) ?? ""}
                                onChange={(e) =>
                                  setSellPriceField(alias.id, "perCall", e.target.value)
                                }
                                placeholder="0.000"
                              />
                            </div>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-ds-surface-container-low/30 p-4 rounded-xl">
                            <div className="space-y-1.5">
                              <label className="label-caps ml-1">{t("inputPer1M")}</label>
                              <Input
                                className="w-full bg-ds-surface-container-lowest border-none rounded-lg text-sm px-4 py-2 font-semibold focus:ring-2 focus:ring-ds-primary/20"
                                type="number"
                                step="0.01"
                                value={(sp.inputPer1M as number) ?? ""}
                                onChange={(e) =>
                                  setSellPriceField(alias.id, "inputPer1M", e.target.value)
                                }
                                placeholder="0.00"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <label className="label-caps ml-1">{t("outputPer1M")}</label>
                              <Input
                                className="w-full bg-ds-surface-container-lowest border-none rounded-lg text-sm px-4 py-2 font-semibold focus:ring-2 focus:ring-ds-primary/20"
                                type="number"
                                step="0.01"
                                value={(sp.outputPer1M as number) ?? ""}
                                onChange={(e) =>
                                  setSellPriceField(alias.id, "outputPer1M", e.target.value)
                                }
                                placeholder="0.00"
                              />
                            </div>
                          </div>
                        )}
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
                              <Button
                                variant="ghost"
                                size="sm"
                                className="relative inline-block w-10 h-5 p-0"
                                aria-pressed={!!caps[key]}
                                onClick={() => toggleCapability(alias.id, key)}
                              >
                                <div
                                  className={`w-10 h-5 rounded-full transition-colors ${caps[key] ? "bg-ds-primary" : "bg-ds-outline-variant/30"}`}
                                />
                                <div
                                  className={`absolute left-0.5 top-0.5 w-4 h-4 bg-ds-surface-container-lowest rounded-full transition-transform ${caps[key] ? "translate-x-5" : ""}`}
                                />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Supported Sizes */}
                      <div className="flex flex-col gap-4">
                        <h4 className="text-sm font-bold flex items-center gap-2">
                          <span className="material-symbols-outlined text-base">aspect_ratio</span>{" "}
                          {t("supportedSizes")}
                        </h4>
                        <div className="bg-ds-surface-container-low/30 p-4 rounded-xl flex flex-wrap gap-2 items-center">
                          {getSupportedSizes(alias.id).map((size) => (
                            <div
                              key={size}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-ds-surface-container-lowest rounded-lg border border-ds-outline-variant shadow-sm transition-all hover:border-ds-primary group"
                            >
                              <span className="text-xs font-bold">{size}</span>
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                className="text-ds-on-surface-variant hover:text-ds-error flex items-center"
                                onClick={() => removeSize(alias.id, size)}
                              >
                                <span className="material-symbols-outlined text-sm">close</span>
                              </Button>
                            </div>
                          ))}
                          <div className="relative flex-1 min-w-[200px]">
                            <Input
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
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-ds-primary hover:scale-110 transition-transform flex items-center"
                              onClick={() => addSize(alias.id)}
                            >
                              <span className="material-symbols-outlined text-xl">add_circle</span>
                            </Button>
                          </div>
                        </div>
                      </div>

                      {/* Linked Infrastructure */}
                      <div className="flex flex-col gap-4">
                        <h4 className="text-sm font-bold flex items-center gap-2">
                          <span className="material-symbols-outlined text-base">link</span>{" "}
                          {t("linkedInfrastructure")}
                        </h4>
                        <ChannelTable
                          channels={alias.linkedModels
                            .flatMap((lm) =>
                              lm.channels.map(
                                (ch): ChannelRowData => ({
                                  id: ch.id,
                                  modelName: lm.modelName,
                                  providerName: ch.providerName,
                                  costPrice: ch.costPrice,
                                  status: ch.status,
                                  priority: ch.priority,
                                  latencyMs: ch.latencyMs,
                                }),
                              ),
                            )
                            // F-AAU-01: 跨 model 拖拽后视觉与路由层一致 —
                            // ChannelTable 渲染顺序 = 全局 priority asc。
                            // 不在 API 层做（API 返回 shape 保持稳定）。
                            .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))}
                          exchangeRate={exchangeRate}
                          mode="editable"
                          onUnlink={(_channelId, modelId) => unlinkModel(alias.id, modelId)}
                          onReorder={reorderChannels}
                          channelModelMap={Object.fromEntries(
                            alias.linkedModels.flatMap((lm) =>
                              lm.channels.map((ch) => [ch.id, lm.modelId]),
                            ),
                          )}
                        />
                        <div className="flex justify-between items-center mt-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-ds-primary text-xs font-bold flex items-center gap-1.5 hover:underline"
                            onClick={() => setAddModelAliasId(alias.id)}
                          >
                            <span className="material-symbols-outlined text-sm">add_circle</span>{" "}
                            {t("addModelMapping")}
                          </Button>
                          {editState[alias.id] && Object.keys(editState[alias.id]).length > 0 && (
                            <div className="flex gap-3">
                              <Button
                                variant="ghost"
                                className="px-4 py-2 text-xs font-bold text-ds-on-surface-variant hover:text-ds-on-surface"
                                onClick={() => discardChanges(alias.id)}
                              >
                                {t("discard")}
                              </Button>
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
                </SectionCard>
              );
            })}
          </div>
        )}

        {/* F-AAU-08: server-side pagination footer (only when ≥2 pages) */}
        {totalPages > 1 && (
          <Pagination
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
            total={totalAliases}
            pageSize={PAGE_SIZE}
            simple={totalPages > 10}
            className="sticky bottom-4 bg-ds-surface-container-lowest/80 backdrop-blur-sm rounded-xl px-4 py-2 mt-2 shadow-sm"
          />
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
          <TableCard>
            <Table className="w-full text-left">
              <TableHeader className="bg-ds-surface-container-high/30">
                <TableRow className="text-[10px] font-bold text-ds-on-surface-variant uppercase tracking-widest">
                  <TableHead className="py-4 px-6">{t("colModel")}</TableHead>
                  <TableHead className="py-4">{t("colProvider")}</TableHead>
                  <TableHead className="py-4">{t("colModality")}</TableHead>
                  <TableHead className="py-4">{t("colChannels")}</TableHead>
                  <TableHead className="py-4 px-6 text-right">{t("colActions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-ds-surface-variant/20">
                {unlinkedModels.map((m) => (
                  <TableRow key={m.id} className="hover:bg-ds-surface-container-low transition-colors">
                    <TableCell className="py-4 px-6 text-xs font-mono font-medium">{m.name}</TableCell>
                    <TableCell className="py-4 text-xs font-semibold">{m.providers.join(", ")}</TableCell>
                    <TableCell className="py-4">
                      <span className="text-[10px] font-bold text-ds-on-surface-variant bg-ds-surface-container px-2 py-0.5 rounded uppercase">
                        {m.modality}
                      </span>
                    </TableCell>
                    <TableCell className="py-4 text-xs font-bold text-ds-on-surface-variant">
                      {m.channelCount}
                    </TableCell>
                    <TableCell className="py-4 px-6 text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-ds-primary text-[10px] font-bold hover:underline px-3 py-1"
                          onClick={() => createAliasForModel(m.name, m.id)}
                        >
                          {t("createAliasAction")}
                        </Button>
                        <Select
                          value={LINK_TO_PLACEHOLDER}
                          onValueChange={(v) => {
                            if (v && v !== LINK_TO_PLACEHOLDER) linkUnlinkedModel(m.id, v);
                          }}
                        >
                          <SelectTrigger className="bg-ds-surface-container-low border-none rounded-md text-[10px] font-bold px-2 py-1 focus:ring-1 focus:ring-ds-primary/30">
                            <SelectValue placeholder={t("linkTo")} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={LINK_TO_PLACEHOLDER}>{t("linkTo")}</SelectItem>
                            {aliases.map((a) => (
                              <SelectItem key={a.id} value={a.id}>
                                {a.alias}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableCard>
        </section>
      )}
    </PageContainer>
  );
}

// ============================================================
// SuggestPriceButton — 参考定价按钮
// ============================================================

type SuggestPricing =
  | { unit: "token"; inputPriceCNYPerM: number; outputPriceCNYPerM: number }
  | { unit: "call"; perCallCNY: number };

type SuggestCandidate = { id: string; name: string } & SuggestPricing;

function SuggestPriceButton({
  aliasId,
  onApply,
}: {
  aliasId: string;
  onApply: (pricing: SuggestPricing, orModelId?: string) => void;
}) {
  const t = useTranslations("modelAliases");
  const [loading, setLoading] = useState(false);
  const [candidates, setCandidates] = useState<SuggestCandidate[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchQ, setSearchQ] = useState("");

  const fetchSuggestions = async (q?: string) => {
    setLoading(true);
    try {
      const params = q ? `?q=${encodeURIComponent(q)}` : "";
      const res = await apiFetch<{
        bound: boolean;
        noImagePricing?: boolean;
        model?: SuggestCandidate;
        candidates?: SuggestCandidate[];
        openRouterModelId?: string;
      }>(`/api/admin/model-aliases/${aliasId}/suggest-price${params}`);

      if (res.bound && res.noImagePricing) {
        toast.info(t("noImagePricing"));
        setShowDropdown(false);
      } else if (res.bound && res.model) {
        const { id: _id, name: _name, ...pricing } = res.model;
        onApply(pricing as SuggestPricing, res.openRouterModelId);
        toast.success(t("priceApplied"));
        setShowDropdown(false);
      } else if (res.candidates && res.candidates.length > 0) {
        setCandidates(res.candidates);
        setShowDropdown(true);
      } else {
        toast.info(t("noCandidates"));
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const selectCandidate = (c: SuggestCandidate) => {
    const { id, name: _name, ...pricing } = c;
    onApply(pricing as SuggestPricing, id);
    setShowDropdown(false);
    setCandidates([]);
    toast.success(t("priceApplied"));
  };

  const formatPrice = (c: SuggestCandidate) => {
    if (c.unit === "call") return `¥${c.perCallCNY.toFixed(4)} / call`;
    return `¥${c.inputPriceCNYPerM.toFixed(2)} / ¥${c.outputPriceCNYPerM.toFixed(2)} per 1M`;
  };

  return (
    <div className="relative">
      <button
        onClick={() => fetchSuggestions()}
        disabled={loading}
        className="text-xs font-bold text-ds-primary hover:text-ds-primary/80 transition-colors flex items-center gap-1 disabled:opacity-50"
      >
        <span className="material-symbols-outlined text-sm">auto_fix_high</span>
        {loading ? "..." : t("suggestPrice")}
      </button>

      {showDropdown && (
        <div className="absolute right-0 top-8 z-50 w-80 bg-ds-surface rounded-xl shadow-2xl border border-ds-outline-variant/20 p-3">
          <Input
            type="text"
            className="w-full bg-ds-surface-container-low border-none rounded-lg text-xs px-3 py-2 mb-2 focus:ring-1 focus:ring-ds-primary/30"
            placeholder={t("searchOpenRouter")}
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") fetchSuggestions(searchQ);
            }}
          />
          <div className="max-h-48 overflow-y-auto">
            {candidates.map((c) => (
              <Button
                key={c.id}
                variant="ghost"
                onClick={() => selectCandidate(c)}
                className="w-full h-auto text-left px-3 py-2 rounded-lg hover:bg-ds-surface-container-low transition-colors text-xs justify-start"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-bold truncate">{c.id}</div>
                  <div className="text-ds-on-surface-variant">{formatPrice(c)}</div>
                </div>
              </Button>
            ))}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setShowDropdown(false);
              setCandidates([]);
            }}
            className="mt-2 w-full text-center text-[10px] text-ds-on-surface-variant hover:text-ds-primary"
          >
            {t("close")}
          </Button>
        </div>
      )}
    </div>
  );
}
