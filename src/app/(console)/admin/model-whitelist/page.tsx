"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
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
  variants?: ModelItem[];
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

function fmtCostPrice(channels: ChannelInfo[]): string {
  const ch = channels.find((c) => c.status === "ACTIVE");
  if (!ch?.sellPrice) return "";
  const p = ch.sellPrice;
  if (p.unit === "call") {
    return `$${Number(p.perCall ?? 0)} /img Cost`;
  }
  const inp = Number(p.inputPer1M ?? 0);
  const out = Number(p.outputPer1M ?? 0);
  return `$${inp.toFixed(2)} / $${out.toFixed(2)} Cost`;
}

function fmtContext(n: number | null): string {
  if (!n) return "\u2014";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}K`;
  return String(n);
}

function isNewModel(createdAt: string): boolean {
  const diff = Date.now() - new Date(createdAt).getTime();
  return diff < 7 * 24 * 60 * 60 * 1000; // 7 days
}

// ============================================================
// Component
// ============================================================

export default function ModelWhitelistPage() {
  const t = useTranslations("modelWhitelist");

  const [data, setData] = useState<ModelItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [search, setSearch] = useState("");
  const [providerFilter, setProviderFilter] = useState("");
  const [modalityFilter, setModalityFilter] = useState("");
  const [page, setPage] = useState(0);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [editingPrice, setEditingPrice] = useState<string | null>(null);
  const [priceInput, setPriceInput] = useState("");
  const [priceOutputInput, setPriceOutputInput] = useState("");

  // ── Data loading ──
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (providerFilter) params.set("provider", providerFilter);
      if (modalityFilter) params.set("modality", modalityFilter);
      const q = params.toString() ? `?${params}` : "";
      const r = await apiFetch<{ data: ModelItem[]; total: number }>(`/api/admin/models${q}`);
      setData(r.data);
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [search, providerFilter, modalityFilter]);

  const loadProviders = useCallback(async () => {
    try {
      const r = await apiFetch<{ data: ProviderOption[] }>("/api/admin/providers");
      setProviders(r.data);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    load();
    loadProviders();
  }, [load, loadProviders]);

  // ── Stats ──
  const stats = useMemo(() => {
    let total = 0;
    let enabled = 0;
    const providerSet = new Set<string>();
    function count(items: ModelItem[]) {
      for (const item of items) {
        total++;
        if (item.enabled) enabled++;
        for (const ch of item.channels) providerSet.add(ch.providerName);
        if (item.variants) count(item.variants);
      }
    }
    count(data);
    return { total, enabled, providers: providerSet.size };
  }, [data]);

  // ── Flat list for pagination ──
  const flatItems = useMemo(() => {
    const result: ModelItem[] = [];
    for (const item of data) {
      result.push(item);
      if (item.variants && expandedGroups.has(item.name)) {
        result.push(...item.variants);
      }
    }
    return result;
  }, [data, expandedGroups]);

  const totalPages = Math.ceil(flatItems.length / PAGE_SIZE);
  const pageItems = flatItems.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

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

  // ── Edit sell price ──
  const startEditPrice = (model: ModelItem) => {
    setEditingPrice(model.id);
    const p = model.sellPrice;
    if (p?.unit === "call") {
      setPriceInput(String(p.perCall ?? ""));
      setPriceOutputInput("");
    } else if (p?.unit === "token") {
      setPriceInput(String(p.inputPer1M ?? ""));
      setPriceOutputInput(String(p.outputPer1M ?? ""));
    } else {
      setPriceInput("");
      setPriceOutputInput("");
    }
  };

  const savePrice = async (model: ModelItem) => {
    const isCall = model.modality === "IMAGE";
    const sellPrice = isCall
      ? { unit: "call", perCall: Number(priceInput) || 0, currency: "USD" }
      : {
          unit: "token",
          inputPer1M: Number(priceInput) || 0,
          outputPer1M: Number(priceOutputInput) || 0,
          currency: "USD",
        };
    try {
      await apiFetch(`/api/admin/models/${model.id}`, {
        method: "PATCH",
        body: JSON.stringify({ sellPrice }),
      });
      toast.success(t("priceSaved"));
      setEditingPrice(null);
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  // ── Toggle variant group ──
  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
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
    if (status === "DEGRADED")
      return (
        <span className="flex items-center gap-1 text-amber-500">
          <span className="material-symbols-outlined text-sm">warning</span>
          <span className="text-[10px] font-bold uppercase tracking-tight">{t("degraded")}</span>
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
                    {t("colProvider")}
                  </th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    {t("colModality")}
                  </th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground text-center">
                    {t("colContext")}
                  </th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    {t("colPrice")}
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
                  const groupKey = item.name;
                  const hasVariants = !!(item.variants && item.variants.length > 0);
                  const isExpanded = expandedGroups.has(groupKey);
                  const providerDisplay = item.channels[0]?.provider ?? "\u2014";

                  return (
                    <tr key={item.id} className="hover:bg-muted/10 transition-colors group">
                      {/* Enable toggle */}
                      <td className="px-6 py-5">
                        <Switch
                          checked={item.enabled}
                          onCheckedChange={() => toggleEnabled(item)}
                        />
                      </td>

                      {/* Model Name */}
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

                      {/* Provider */}
                      <td className="px-6 py-5">
                        <span className="text-xs font-semibold text-muted-foreground">
                          {providerDisplay}
                        </span>
                      </td>

                      {/* Modality */}
                      <td className="px-6 py-5">
                        <span
                          className={`text-[10px] font-bold px-2 py-1 rounded-md ${
                            item.modality === "IMAGE"
                              ? "bg-violet-100 text-violet-700"
                              : "bg-primary/10 text-primary"
                          }`}
                        >
                          {item.modality}
                        </span>
                      </td>

                      {/* Context */}
                      <td className="px-6 py-5 text-center">
                        <span className="text-xs font-mono text-muted-foreground">
                          {fmtContext(item.contextWindow)}
                        </span>
                      </td>

                      {/* Price */}
                      <td className="px-6 py-5">
                        {editingPrice === item.id ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              step="0.01"
                              className="w-20 border rounded px-1 py-0.5 text-xs"
                              value={priceInput}
                              onChange={(e) => setPriceInput(e.target.value)}
                              placeholder={item.modality === "IMAGE" ? "perCall" : "input"}
                            />
                            {item.modality !== "IMAGE" && (
                              <input
                                type="number"
                                step="0.01"
                                className="w-20 border rounded px-1 py-0.5 text-xs"
                                value={priceOutputInput}
                                onChange={(e) => setPriceOutputInput(e.target.value)}
                                placeholder="output"
                              />
                            )}
                            <button
                              className="text-primary text-xs font-bold"
                              onClick={() => savePrice(item)}
                            >
                              {t("save")}
                            </button>
                            <button
                              className="text-muted-foreground text-xs"
                              onClick={() => setEditingPrice(null)}
                            >
                              {t("cancel")}
                            </button>
                          </div>
                        ) : (
                          <div className="flex flex-col">
                            <div
                              className="flex items-center gap-1 cursor-pointer group/edit"
                              onClick={() => startEditPrice(item)}
                            >
                              <span className="text-xs font-bold">
                                {fmtSellPrice(item.sellPrice)}
                              </span>
                              <span className="material-symbols-outlined text-[14px] opacity-0 group-hover/edit:opacity-100 transition-opacity">
                                edit
                              </span>
                            </div>
                            <span className="text-[10px] text-muted-foreground font-medium">
                              {fmtCostPrice(item.channels)}
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Channels */}
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

                      {/* Health */}
                      <td className="px-6 py-5">{healthBadge(item.healthStatus)}</td>

                      {/* Actions */}
                      <td className="px-6 py-5 text-right">
                        {hasVariants && (
                          <button
                            className="p-1.5 hover:bg-muted rounded-lg transition-colors"
                            onClick={() => toggleGroup(groupKey)}
                            title={
                              isExpanded
                                ? t("hideVariants")
                                : t("showVariants", { count: item.variants!.length })
                            }
                          >
                            <span className="material-symbols-outlined text-muted-foreground">
                              {isExpanded ? "unfold_less" : "unfold_more"}
                            </span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Pagination Footer */}
            <footer className="px-6 py-4 flex items-center justify-between bg-muted/30">
              <p className="text-sm text-muted-foreground font-medium">
                {t("showing", {
                  from: flatItems.length === 0 ? 0 : page * PAGE_SIZE + 1,
                  to: Math.min((page + 1) * PAGE_SIZE, flatItems.length),
                  total: flatItems.length,
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
                        className={`w-8 h-8 rounded-lg text-xs font-bold transition-colors ${
                          pageNum === page
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "hover:bg-background text-muted-foreground"
                        }`}
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
