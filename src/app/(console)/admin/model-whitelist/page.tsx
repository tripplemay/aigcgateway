"use client";
import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useAsyncData } from "@/hooks/use-async-data";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

// ============================================================
// Types
// ============================================================

interface ChannelInfo {
  id: string;
  provider: string;
  providerName: string;
  status: string;
  priority: number;
  sellPrice: Record<string, unknown> | null;
  healthResult: string | null;
  healthLatencyMs: number | null;
}

interface ModelItem {
  id: string;
  name: string;
  displayName: string;
  modality: string;
  enabled: boolean;
  maxTokens: number | null;
  contextWindow: number | null;
  capabilities: Record<string, unknown> | null;
  createdAt: string;
  channelCount: number;
  activeChannelCount: number;
  sellPrice: Record<string, unknown> | null;
  healthStatus: string | null;
  healthLatencyMs: number | null;
  healthCheckedAt: string | null;
  channels: ChannelInfo[];
}

interface ProviderOption {
  name: string;
  displayName: string;
}

// ============================================================
// Helpers
// ============================================================

const PAGE_SIZE = 20;

function fmtSellPrice(p: Record<string, unknown> | null): string {
  if (!p) return "\u2014";
  if (p.unit === "call") {
    const v = Number(p.perCall ?? 0);
    return v === 0 ? "Free" : `$${v}/img`;
  }
  const inp = Number(p.inputPer1M ?? 0);
  const out = Number(p.outputPer1M ?? 0);
  return inp === 0 && out === 0 ? "Free" : `$${inp.toFixed(2)} / $${out.toFixed(2)}`;
}

function fmtContext(n: number | null): string {
  if (!n) return "\u2014";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}K`;
  return String(n);
}

function isNewModel(createdAt: string): boolean {
  const diff = Date.now() - new Date(createdAt).getTime();
  return diff < 7 * 24 * 60 * 60 * 1000;
}

// ============================================================
// Component
// ============================================================

export default function ModelWhitelistPage() {
  const t = useTranslations("modelWhitelist");

  const [search, setSearch] = useState("");
  const [providerFilter, setProviderFilter] = useState("");
  const [modalityFilter, setModalityFilter] = useState("");
  const [page, setPage] = useState(0);
  const [expandedModels, setExpandedModels] = useState<Set<string>>(new Set());
  const [editingChannel, setEditingChannel] = useState<string | null>(null);
  const [channelPriceInput, setChannelPriceInput] = useState("");
  const [channelPriceOutputInput, setChannelPriceOutputInput] = useState("");
  const [channelPriorityInput, setChannelPriorityInput] = useState("");

  // ── Data loading via useAsyncData ──
  const { data: modelsResult, refetch: load } = useAsyncData<{
    data: ModelItem[];
    total: number;
  }>(async () => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (providerFilter) params.set("provider", providerFilter);
    if (modalityFilter) params.set("modality", modalityFilter);
    const q = params.toString() ? `?${params}` : "";
    return apiFetch<{ data: ModelItem[]; total: number }>(`/api/admin/models${q}`);
  }, [search, providerFilter, modalityFilter]);

  const data = modelsResult?.data ?? [];
  const loading = !modelsResult;

  const { data: providersResult } = useAsyncData<{ data: ProviderOption[] }>(async () => {
    return apiFetch<{ data: ProviderOption[] }>("/api/admin/providers");
  }, []);

  const providers = providersResult?.data ?? [];

  // ── Stats ──
  const stats = useMemo(() => {
    let total = 0;
    let enabled = 0;
    const providerSet = new Set<string>();
    for (const item of data) {
      total++;
      if (item.enabled) enabled++;
      for (const ch of item.channels) providerSet.add(ch.providerName);
    }
    return { total, enabled, providers: providerSet.size };
  }, [data]);

  const totalPages = Math.ceil(data.length / PAGE_SIZE);
  const pageItems = data.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // ── Toggle enable ──
  const toggleEnabled = async (model: ModelItem) => {
    const newEnabled = !model.enabled;
    try {
      await apiFetch(`/api/admin/models/${model.id}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: newEnabled }),
      });
      toast.success(
        t("enableToggled", {
          name: model.name,
          status: newEnabled ? t("enabledStatus") : t("disabledStatus"),
        }),
      );
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  // ── Toggle channel expand ──
  const toggleExpand = (modelId: string) => {
    setExpandedModels((prev) => {
      const next = new Set(prev);
      if (next.has(modelId)) next.delete(modelId);
      else next.add(modelId);
      return next;
    });
  };

  // ── Edit channel ──
  const startEditChannel = (ch: ChannelInfo) => {
    setEditingChannel(ch.id);
    setChannelPriorityInput(String(ch.priority));
    const p = ch.sellPrice;
    if (p?.unit === "call") {
      setChannelPriceInput(String(p.perCall ?? ""));
      setChannelPriceOutputInput("");
    } else if (p?.unit === "token") {
      setChannelPriceInput(String(p.inputPer1M ?? ""));
      setChannelPriceOutputInput(String(p.outputPer1M ?? ""));
    } else {
      setChannelPriceInput("");
      setChannelPriceOutputInput("");
    }
  };

  const saveChannel = async (ch: ChannelInfo, modality: string) => {
    const isCall = modality === "IMAGE";
    const sellPrice = isCall
      ? { unit: "call", perCall: Number(channelPriceInput) || 0, currency: "USD" }
      : {
          unit: "token",
          inputPer1M: Number(channelPriceInput) || 0,
          outputPer1M: Number(channelPriceOutputInput) || 0,
          currency: "USD",
        };
    const priority = Number(channelPriorityInput) || ch.priority;
    try {
      await apiFetch(`/api/admin/channels/${ch.id}`, {
        method: "PATCH",
        body: JSON.stringify({ sellPrice, priority }),
      });
      toast.success(t("priceSaved"));
      setEditingChannel(null);
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  // ── Health display ──
  const healthBadge = (status: string | null) => {
    if (status === "PASS")
      return (
        <span className="flex items-center gap-1 text-emerald-600">
          <span
            className="material-symbols-outlined text-sm"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            check_circle
          </span>
          <span className="text-[10px] font-bold uppercase tracking-tight">{t("healthy")}</span>
        </span>
      );
    if (status === "FAIL")
      return (
        <span className="flex items-center gap-1 text-red-500">
          <span className="material-symbols-outlined text-sm">error</span>
          <span className="text-[10px] font-bold uppercase tracking-tight">{t("unhealthy")}</span>
        </span>
      );
    return (
      <span className="flex items-center gap-1 text-slate-400">
        <span className="material-symbols-outlined text-sm">help</span>
        <span className="text-[10px] font-bold uppercase tracking-tight">{t("unknown")}</span>
      </span>
    );
  };

  // ── Render ──
  return (
    <div className="space-y-10">
      {/* Page Header */}
      <section>
        <h1 className="text-4xl font-extrabold tracking-tight">{t("title")}</h1>
        <p className="mt-2 text-muted-foreground text-lg">{t("subtitle")}</p>
      </section>

      {/* Stats Row */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-card/60 backdrop-blur-lg rounded-xl p-6 shadow-sm border flex items-center gap-5">
          <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
            <span
              className="material-symbols-outlined text-3xl"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              database
            </span>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              {t("totalModels")}
            </p>
            <h3 className="text-3xl font-black">{stats.total}</h3>
            <p className="text-xs text-muted-foreground font-medium mt-0.5">
              {t("allProvidersSynced")}
            </p>
          </div>
        </div>
        <div className="bg-card/60 backdrop-blur-lg rounded-xl p-6 shadow-sm border flex items-center gap-5">
          <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
            <span
              className="material-symbols-outlined text-3xl"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              check_circle
            </span>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              {t("enabled")}
            </p>
            <h3 className="text-3xl font-black">{stats.enabled}</h3>
            <p className="text-xs text-muted-foreground font-medium mt-0.5">
              {t("whitelistedModels")}
            </p>
          </div>
        </div>
        <div className="bg-card/60 backdrop-blur-lg rounded-xl p-6 shadow-sm border flex items-center gap-5">
          <div className="w-14 h-14 rounded-xl bg-orange-100 flex items-center justify-center text-orange-600">
            <span
              className="material-symbols-outlined text-3xl"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              hub
            </span>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              {t("providers")}
            </p>
            <h3 className="text-3xl font-black">{stats.providers}</h3>
            <p className="text-xs text-muted-foreground font-medium mt-0.5">
              {t("activeUpstream")}
            </p>
          </div>
        </div>
      </section>

      {/* Filter Bar */}
      <section className="flex flex-wrap items-center gap-4 bg-muted/50 p-2 rounded-2xl">
        <div className="flex-1 min-w-[240px]">
          <Input
            placeholder={t("searchPlaceholder")}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            className="bg-background"
          />
        </div>
        <div className="flex items-center gap-3">
          <select
            className="bg-background border rounded-xl px-4 py-2.5 text-sm font-medium min-w-[140px]"
            value={providerFilter}
            onChange={(e) => {
              setProviderFilter(e.target.value);
              setPage(0);
            }}
          >
            <option value="">{t("allProviders")}</option>
            {providers.map((p) => (
              <option key={p.name} value={p.name}>
                {p.displayName}
              </option>
            ))}
          </select>
          <select
            className="bg-background border rounded-xl px-4 py-2.5 text-sm font-medium min-w-[140px]"
            value={modalityFilter}
            onChange={(e) => {
              setModalityFilter(e.target.value);
              setPage(0);
            }}
          >
            <option value="">{t("allModalities")}</option>
            <option value="text">{t("text")}</option>
            <option value="image">{t("image")}</option>
          </select>
        </div>
      </section>

      {/* Data Table */}
      <section className="bg-card rounded-2xl shadow-xl overflow-hidden border">
        {loading ? (
          <div className="p-12 text-center text-muted-foreground">{t("loading")}</div>
        ) : (
          <>
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-muted/30">
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    {t("colEnable")}
                  </th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    {t("colModelName")}
                  </th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    {t("colModality")}
                  </th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground text-center">
                    {t("colContext")}
                  </th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    {t("colChannels")}
                  </th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    {t("colHealth")}
                  </th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground text-right">
                    {t("colActions")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {pageItems.map((item) => {
                  const isExpanded = expandedModels.has(item.id);
                  const hasMultipleChannels = item.channels.length > 1;

                  return (
                    <>
                      {/* Model row */}
                      <tr key={item.id} className="hover:bg-muted/10 transition-colors group">
                        <td className="px-6 py-5">
                          <Switch
                            checked={item.enabled}
                            onCheckedChange={() => toggleEnabled(item)}
                          />
                        </td>
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm">{item.name}</span>
                            {isNewModel(item.createdAt) && (
                              <span className="bg-orange-100 text-orange-800 text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-tighter">
                                {t("newBadge")}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-5">
                          <span
                            className={`text-[10px] font-bold px-2 py-1 rounded-md ${item.modality === "IMAGE" ? "bg-violet-100 text-violet-700" : "bg-primary/10 text-primary"}`}
                          >
                            {item.modality === "IMAGE" ? t("image") : t("text")}
                          </span>
                        </td>
                        <td className="px-6 py-5 text-center">
                          <span className="text-xs font-mono text-muted-foreground">
                            {fmtContext(item.contextWindow)}
                          </span>
                        </td>
                        <td className="px-6 py-5">
                          {item.activeChannelCount > 0 ? (
                            <div className="flex items-center gap-1.5">
                              <div className="w-2 h-2 rounded-full bg-emerald-500" />
                              <span className="text-xs font-bold text-emerald-600">
                                {t("nActive", { count: item.activeChannelCount })}
                              </span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <div className="w-2 h-2 rounded-full bg-slate-300" />
                              <span className="text-xs font-bold text-muted-foreground">
                                {t("noChannels")}
                              </span>
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-5">{healthBadge(item.healthStatus)}</td>
                        <td className="px-6 py-5 text-right">
                          {item.channels.length > 0 && (
                            <button
                              className="p-1.5 hover:bg-muted rounded-lg transition-colors"
                              onClick={() => toggleExpand(item.id)}
                              title={
                                isExpanded ? t("hideVariants") : `${item.channels.length} channels`
                              }
                            >
                              <span className="material-symbols-outlined text-muted-foreground">
                                {isExpanded ? "unfold_less" : "unfold_more"}
                              </span>
                              {hasMultipleChannels && !isExpanded && (
                                <span className="text-[10px] text-muted-foreground ml-1">
                                  {item.channels.length}
                                </span>
                              )}
                            </button>
                          )}
                        </td>
                      </tr>

                      {/* Expanded channel rows */}
                      {isExpanded &&
                        item.channels.map((ch) => (
                          <tr key={ch.id} className="bg-muted/5 border-l-4 border-l-primary/20">
                            <td className="px-6 py-3" />
                            <td className="px-6 py-3" colSpan={2}>
                              <div className="flex items-center gap-2 ml-4">
                                <span className="material-symbols-outlined text-sm text-muted-foreground">
                                  subdirectory_arrow_right
                                </span>
                                <span className="text-xs font-semibold">{ch.provider}</span>
                                <span
                                  className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${ch.status === "ACTIVE" ? "bg-emerald-100 text-emerald-700" : ch.status === "DEGRADED" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}
                                >
                                  {ch.status}
                                </span>
                              </div>
                            </td>
                            <td className="px-6 py-3 text-center">
                              <span className="text-[10px] text-muted-foreground">
                                P{ch.priority}
                              </span>
                            </td>
                            <td className="px-6 py-3" colSpan={2}>
                              {editingChannel === ch.id ? (
                                <div className="flex items-center gap-1 flex-wrap">
                                  <label className="text-[10px] text-muted-foreground">Pri:</label>
                                  <input
                                    type="number"
                                    className="w-12 border rounded px-1 py-0.5 text-xs"
                                    value={channelPriorityInput}
                                    onChange={(e) => setChannelPriorityInput(e.target.value)}
                                  />
                                  <label className="text-[10px] text-muted-foreground ml-1">
                                    Price:
                                  </label>
                                  <input
                                    type="number"
                                    step="0.01"
                                    className="w-16 border rounded px-1 py-0.5 text-xs"
                                    value={channelPriceInput}
                                    onChange={(e) => setChannelPriceInput(e.target.value)}
                                    placeholder="in"
                                  />
                                  {item.modality !== "IMAGE" && (
                                    <input
                                      type="number"
                                      step="0.01"
                                      className="w-16 border rounded px-1 py-0.5 text-xs"
                                      value={channelPriceOutputInput}
                                      onChange={(e) => setChannelPriceOutputInput(e.target.value)}
                                      placeholder="out"
                                    />
                                  )}
                                  <button
                                    className="text-primary text-xs font-bold"
                                    onClick={() => saveChannel(ch, item.modality)}
                                  >
                                    {t("save")}
                                  </button>
                                  <button
                                    className="text-muted-foreground text-xs"
                                    onClick={() => setEditingChannel(null)}
                                  >
                                    {t("cancel")}
                                  </button>
                                </div>
                              ) : (
                                <div
                                  className="flex items-center gap-2 cursor-pointer group/edit"
                                  onClick={() => startEditChannel(ch)}
                                >
                                  <span className="text-xs font-bold">
                                    {fmtSellPrice(ch.sellPrice)}
                                  </span>
                                  <span className="material-symbols-outlined text-[14px] opacity-0 group-hover/edit:opacity-100 transition-opacity">
                                    edit
                                  </span>
                                </div>
                              )}
                            </td>
                            <td className="px-6 py-3 text-right">{healthBadge(ch.healthResult)}</td>
                          </tr>
                        ))}
                    </>
                  );
                })}
              </tbody>
            </table>

            {/* Pagination Footer */}
            <footer className="px-6 py-4 flex items-center justify-between bg-muted/30">
              <p className="text-sm text-muted-foreground font-medium">
                {t("showing", {
                  from: data.length === 0 ? 0 : page * PAGE_SIZE + 1,
                  to: Math.min((page + 1) * PAGE_SIZE, data.length),
                  total: data.length,
                })}
              </p>
              <div className="flex items-center gap-2">
                <button
                  className="p-2 border rounded-lg hover:bg-background transition-colors disabled:opacity-50"
                  disabled={page === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  <span className="material-symbols-outlined text-lg">chevron_left</span>
                </button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                    const pageNum =
                      totalPages <= 5 ? i : Math.max(0, Math.min(page - 2, totalPages - 5)) + i;
                    return (
                      <button
                        key={pageNum}
                        className={`w-8 h-8 rounded-lg text-xs font-bold transition-colors ${pageNum === page ? "bg-primary text-primary-foreground shadow-sm" : "hover:bg-background text-muted-foreground"}`}
                        onClick={() => setPage(pageNum)}
                      >
                        {pageNum + 1}
                      </button>
                    );
                  })}
                </div>
                <button
                  className="p-2 border rounded-lg hover:bg-background transition-colors disabled:opacity-50"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                >
                  <span className="material-symbols-outlined text-lg">chevron_right</span>
                </button>
              </div>
            </footer>
          </>
        )}
      </section>
    </div>
  );
}
