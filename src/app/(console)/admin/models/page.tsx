"use client";
import { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { formatContext } from "@/lib/utils";

// ============================================================
// Types
// ============================================================

interface ChannelEntry {
  id: string;
  realModelId: string;
  priority: number;
  costPrice: Record<string, unknown>;
  sellPrice: Record<string, unknown>;
  sellPriceLocked: boolean;
  status: "ACTIVE" | "DEGRADED" | "DISABLED";
  latencyMs: number | null;
  successRate: number | null;
  totalCalls: number;
}

interface ModelEntry {
  id: string;
  name: string;
  displayName: string;
  modality: string;
  contextWindow: number | null;
  healthStatus: "healthy" | "degraded" | "unhealthy" | "unknown";
  sellPrice: Record<string, unknown> | null;
  channels: ChannelEntry[];
}

interface ProviderGroup {
  id: string;
  name: string;
  displayName: string;
  summary: {
    modelCount: number;
    activeChannels: number;
    degradedChannels: number;
    disabledChannels: number;
  };
  models: ModelEntry[];
}

// ============================================================
// Helpers
// ============================================================

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "bg-emerald-500",
  DEGRADED: "bg-amber-500",
  DISABLED: "bg-red-500",
};

const HEALTH_COLORS: Record<string, string> = {
  healthy: "bg-emerald-500",
  degraded: "bg-amber-500",
  unhealthy: "bg-red-500",
  unknown: "bg-gray-300",
};

const STATUS_BORDER: Record<string, string> = {
  ACTIVE: "border-l-emerald-500",
  DEGRADED: "border-l-amber-500",
  DISABLED: "border-l-red-500",
};

function fmtPrice(p: Record<string, unknown> | null) {
  if (!p) return "—";
  if (p.unit === "call") {
    const v = Number(p.perCall ?? 0);
    return v === 0 ? "Free" : `$${v}/call`;
  }
  const inp = Number(p.inputPer1M ?? 0);
  const out = Number(p.outputPer1M ?? 0);
  return inp === 0 && out === 0 ? "Free" : `$${inp}/$${out} /M`;
}

// ============================================================
// Component
// ============================================================

export default function ModelsChannelsPage() {
  const t = useTranslations("adminModels");
  const tc = useTranslations("common");

  const [data, setData] = useState<ProviderGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modality, setModality] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);

  // Expand state
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(new Set());
  const [expandedModels, setExpandedModels] = useState<Set<string>>(new Set());

  // Inline edit state
  const [editingPriority, setEditingPriority] = useState<string | null>(null);
  const [priorityValue, setPriorityValue] = useState("");
  const [editingSellPrice, setEditingSellPrice] = useState<string | null>(null);
  const [sellPriceValue, setSellPriceValue] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (modality) params.set("modality", modality);
    if (search) params.set("search", search);
    const q = params.toString() ? `?${params}` : "";
    const r = await apiFetch<{ data: ProviderGroup[] }>(`/api/admin/models-channels${q}`);
    setData(r.data);
    setLoading(false);
  }, [modality, search]);

  const loadSyncStatus = async () => {
    try {
      const r = await apiFetch<{
        data: { lastSyncTime: string | null };
      }>("/api/admin/sync-status");
      setLastSyncTime(r.data.lastSyncTime);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    load();
    loadSyncStatus();
  }, [load]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await apiFetch("/api/admin/sync-models", { method: "POST" });
      toast.success(t("syncSuccess"));
      await load();
      await loadSyncStatus();
    } catch (e) {
      toast.error(`${t("syncFailed")}: ${(e as Error).message}`);
    } finally {
      setSyncing(false);
    }
  };

  const toggleProvider = (id: string) => {
    setExpandedProviders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleModel = (id: string) => {
    setExpandedModels((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const savePriority = async (channelId: string) => {
    const p = Number(priorityValue);
    if (p > 0) {
      await apiFetch(`/api/admin/channels/${channelId}`, {
        method: "PATCH",
        body: JSON.stringify({ priority: p }),
      });
      toast.success(t("priorityUpdated"));
      load();
    }
    setEditingPriority(null);
  };

  const saveSellPrice = async (channel: ChannelEntry) => {
    const val = Number(sellPriceValue);
    if (isNaN(val) || val < 0) {
      setEditingSellPrice(null);
      return;
    }
    const sp = channel.sellPrice;
    const newSellPrice =
      sp.unit === "call"
        ? { perCall: val, unit: "call" }
        : { inputPer1M: val, outputPer1M: val, unit: "token" };

    await apiFetch(`/api/admin/channels/${channel.id}`, {
      method: "PATCH",
      body: JSON.stringify({ sellPrice: newSellPrice }),
    });
    toast.success(t("priceSaved"));
    setEditingSellPrice(null);
    load();
  };

  // ============================================================
  // Render
  // ============================================================

  return (
    <div>
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <div className="flex items-center gap-2">
          <Input
            className="w-56"
            placeholder={t("searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="flex gap-1">
            {[
              { val: "", label: t("all") },
              { val: "TEXT", label: t("text") },
              { val: "IMAGE", label: t("image") },
            ].map((m) => (
              <Button
                key={m.val}
                size="sm"
                variant={modality === m.val ? "default" : "outline"}
                onClick={() => setModality(m.val)}
              >
                {m.label}
              </Button>
            ))}
          </div>
          <Button variant="outline" onClick={handleSync} disabled={syncing}>
            {syncing ? t("syncing") : t("syncModels")}
          </Button>
        </div>
      </div>

      {/* Provider groups */}
      {loading ? (
        <p className="text-center py-12 text-muted-foreground">{tc("loading")}</p>
      ) : (
        <div className="space-y-3">
          {data.map((provider) => (
            <div key={provider.id} className="border rounded-lg bg-white overflow-hidden">
              {/* Layer 1: Provider header */}
              <button
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors"
                onClick={() => toggleProvider(provider.id)}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand/10 text-brand text-sm font-bold">
                    {provider.displayName.charAt(0)}
                  </div>
                  <span className="font-medium text-sm">{provider.displayName}</span>
                  <span className="text-xs text-muted-foreground">
                    {provider.summary.modelCount} {t("models")}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  {provider.summary.activeChannels > 0 && (
                    <span className="flex items-center gap-1 text-xs">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      {provider.summary.activeChannels}
                    </span>
                  )}
                  {provider.summary.degradedChannels > 0 && (
                    <span className="flex items-center gap-1 text-xs">
                      <span className="h-2 w-2 rounded-full bg-amber-500" />
                      {provider.summary.degradedChannels}
                    </span>
                  )}
                  {provider.summary.disabledChannels > 0 && (
                    <span className="flex items-center gap-1 text-xs">
                      <span className="h-2 w-2 rounded-full bg-red-500" />
                      {provider.summary.disabledChannels}
                    </span>
                  )}
                  <span className="text-muted-foreground text-xs">
                    {expandedProviders.has(provider.id) ? "▲" : "▼"}
                  </span>
                </div>
              </button>

              {/* Layer 2: Models */}
              {expandedProviders.has(provider.id) && (
                <div className="border-t">
                  {provider.models.map((model) => (
                    <div key={model.id}>
                      <button
                        className="w-full flex items-center gap-3 px-6 py-2.5 hover:bg-muted/30 transition-colors text-left"
                        onClick={() => toggleModel(model.id)}
                      >
                        <span
                          className={`h-2 w-2 rounded-full shrink-0 ${HEALTH_COLORS[model.healthStatus]}`}
                        />
                        <span className="font-mono text-xs flex-1">{model.name}</span>
                        <Badge
                          variant={model.modality === "TEXT" ? "info" : "image"}
                          className="text-[10px]"
                        >
                          {model.modality.toLowerCase()}
                        </Badge>
                        <span className="text-xs text-muted-foreground w-16 text-right">
                          {model.contextWindow ? formatContext(model.contextWindow) : "—"}
                        </span>
                        <span className="text-xs font-mono w-32 text-right">
                          {fmtPrice(model.sellPrice)}
                        </span>
                        <span className="text-muted-foreground text-[10px] w-4">
                          {expandedModels.has(model.id) ? "▲" : "▼"}
                        </span>
                      </button>

                      {/* Layer 3: Channels */}
                      {expandedModels.has(model.id) && (
                        <div className="px-6 pb-3 pt-1">
                          <div className="grid grid-cols-2 gap-3">
                            {model.channels.map((ch) => (
                              <div
                                key={ch.id}
                                className={`border-l-4 ${STATUS_BORDER[ch.status]} rounded-md border bg-muted/20 p-3`}
                              >
                                {/* Card header */}
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-xs font-mono text-muted-foreground">
                                    {ch.realModelId}
                                  </span>
                                  <div className="flex items-center gap-2">
                                    {/* Priority */}
                                    {editingPriority === ch.id ? (
                                      <Input
                                        className="w-12 h-6 text-center text-xs"
                                        autoFocus
                                        value={priorityValue}
                                        onChange={(e) => setPriorityValue(e.target.value)}
                                        onBlur={() => savePriority(ch.id)}
                                        onKeyDown={(e) =>
                                          e.key === "Enter" && savePriority(ch.id)
                                        }
                                      />
                                    ) : (
                                      <button
                                        className="text-xs bg-muted px-1.5 py-0.5 rounded hover:bg-muted-foreground/20"
                                        onClick={() => {
                                          setEditingPriority(ch.id);
                                          setPriorityValue(String(ch.priority));
                                        }}
                                      >
                                        P{ch.priority}
                                      </button>
                                    )}
                                    <span
                                      className={`h-2 w-2 rounded-full ${STATUS_COLORS[ch.status]}`}
                                    />
                                  </div>
                                </div>

                                {/* 4 metrics */}
                                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                                  <div>
                                    <span className="text-muted-foreground">{t("costPrice")}: </span>
                                    <span className="font-mono">{fmtPrice(ch.costPrice)}</span>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">{t("sellPrice")}: </span>
                                    {editingSellPrice === ch.id ? (
                                      <Input
                                        className="inline w-16 h-5 text-xs font-mono"
                                        autoFocus
                                        value={sellPriceValue}
                                        onChange={(e) => setSellPriceValue(e.target.value)}
                                        onBlur={() => saveSellPrice(ch)}
                                        onKeyDown={(e) =>
                                          e.key === "Enter" && saveSellPrice(ch)
                                        }
                                      />
                                    ) : (
                                      <button
                                        className="font-mono hover:underline"
                                        onClick={() => {
                                          setEditingSellPrice(ch.id);
                                          const sp = ch.sellPrice;
                                          setSellPriceValue(
                                            String(
                                              sp.unit === "call"
                                                ? sp.perCall
                                                : sp.inputPer1M,
                                            ),
                                          );
                                        }}
                                      >
                                        {fmtPrice(ch.sellPrice)}
                                      </button>
                                    )}
                                    {ch.sellPriceLocked && (
                                      <span className="ml-1" title={t("priceLocked")}>
                                        🔒
                                      </span>
                                    )}
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">{t("latency")}: </span>
                                    <span className="font-mono">
                                      {ch.latencyMs !== null ? `${ch.latencyMs}${t("ms")}` : t("noData")}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">{t("successRate")}: </span>
                                    <span className="font-mono">
                                      {ch.successRate !== null ? `${ch.successRate}%` : t("noData")}
                                    </span>
                                    {ch.totalCalls > 0 && (
                                      <span className="text-muted-foreground ml-1">
                                        ({ch.totalCalls} {t("calls")})
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Success rate progress bar */}
                                <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-emerald-500 rounded-full transition-all"
                                    style={{ width: `${ch.successRate ?? 0}%` }}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Bottom status bar */}
      <div className="flex items-center justify-between mt-6 text-xs text-muted-foreground">
        <div className="flex items-center gap-4">
          <span className="font-medium">{t("legend")}:</span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-emerald-500" /> {t("active")}
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-amber-500" /> {t("degraded")}
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-red-500" /> {t("disabled")}
          </span>
        </div>
        {lastSyncTime && (
          <span>
            {t("lastSync")}: {new Date(lastSyncTime).toLocaleString()}
          </span>
        )}
      </div>
    </div>
  );
}
