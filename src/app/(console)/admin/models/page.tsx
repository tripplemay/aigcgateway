"use client";
import { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { formatContext } from "@/lib/utils";

// ============================================================
// Types — model-first structure (F401 API)
// ============================================================

interface ChannelEntry {
  id: string;
  realModelId: string;
  providerName: string;
  providerId: string;
  priority: number;
  costPrice: Record<string, unknown>;
  sellPrice: Record<string, unknown>;
  sellPriceLocked: boolean;
  status: "ACTIVE" | "DEGRADED" | "DISABLED";
  latencyMs: number | null;
  successRate: number | null;
  totalCalls: number;
}

interface ModelGroup {
  id: string;
  name: string;
  displayName: string;
  modality: string;
  contextWindow: number | null;
  healthStatus: "healthy" | "degraded" | "unhealthy" | "unknown";
  sellPrice: Record<string, unknown> | null;
  summary: {
    channelCount: number;
    activeChannels: number;
    degradedChannels: number;
    disabledChannels: number;
  };
  channels: ChannelEntry[];
}

// ============================================================
// Constants
// ============================================================

const STATUS_DOT = { ACTIVE: "#639922", DEGRADED: "#BA7517", DISABLED: "#E24B4A" };
const HEALTH_DOT: Record<string, string> = { healthy: "#639922", degraded: "#BA7517", unhealthy: "#E24B4A", unknown: "#B4B2A9" };

const MODELS_PER_PAGE = 20;

function fmtPrice(p: Record<string, unknown> | null) {
  if (!p) return "\u2014";
  if (p.unit === "call") {
    const v = Number(p.perCall ?? 0);
    return v === 0 ? "Free" : `$${v}/call`;
  }
  const inp = Number(p.inputPer1M ?? 0);
  const out = Number(p.outputPer1M ?? 0);
  return inp === 0 && out === 0 ? "Free" : `$${inp} / $${out} /M`;
}

// ============================================================
// Component
// ============================================================

export default function ModelsChannelsPage() {
  const t = useTranslations("adminModels");
  const tc = useTranslations("common");

  const [data, setData] = useState<ModelGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modality, setModality] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [lastSyncResult, setLastSyncResult] = useState<{
    summary: { totalNewChannels: number; totalDisabledChannels: number; totalFailedProviders: number };
    providers: Array<{ providerName: string; success: boolean; error?: string }>;
  } | null>(null);

  const [expandedModels, setExpandedModels] = useState<Set<string>>(new Set());
  const [visibleCount, setVisibleCount] = useState(MODELS_PER_PAGE);

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
    const r = await apiFetch<{ data: ModelGroup[] }>(`/api/admin/models-channels${q}`);
    setData(r.data);
    setLoading(false);
  }, [modality, search]);

  const loadSyncStatus = async () => {
    try {
      const r = await apiFetch<{ data: { lastSyncTime: string | null; lastSyncResult: typeof lastSyncResult } }>("/api/admin/sync-status");
      setLastSyncTime(r.data.lastSyncTime);
      setLastSyncResult(r.data.lastSyncResult);
    } catch { /* ignore */ }
  };

  useEffect(() => { load(); loadSyncStatus(); }, [load]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await apiFetch("/api/admin/sync-models", { method: "POST" });
      toast.success(t("syncSuccess"));
      await load();
      await loadSyncStatus();
    } catch (e) { toast.error(`${t("syncFailed")}: ${(e as Error).message}`); }
    finally { setSyncing(false); }
  };

  const toggle = (set: Set<string>, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  };

  const savePriority = async (channelId: string) => {
    const p = Number(priorityValue);
    if (p > 0) {
      await apiFetch(`/api/admin/channels/${channelId}`, { method: "PATCH", body: JSON.stringify({ priority: p }) });
      toast.success(t("priorityUpdated"));
      load();
    }
    setEditingPriority(null);
  };

  const saveSellPrice = async (ch: ChannelEntry) => {
    const val = Number(sellPriceValue);
    if (isNaN(val) || val < 0) { setEditingSellPrice(null); return; }
    const sp = ch.sellPrice;
    const newSP = sp.unit === "call" ? { perCall: val, unit: "call" } : { inputPer1M: val, outputPer1M: val, unit: "token" };
    await apiFetch(`/api/admin/channels/${ch.id}`, { method: "PATCH", body: JSON.stringify({ sellPrice: newSP }) });
    toast.success(t("priceSaved"));
    setEditingSellPrice(null);
    load();
  };

  const visibleModels = data.slice(0, visibleCount);
  const hasMore = data.length > visibleCount;

  return (
    <div>
      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 500 }}>{t("title")}</h1>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            className="focus:outline-none"
            style={{ fontSize: 13, padding: "7px 12px", border: "0.5px solid #e5e4e0", borderRadius: 8, width: 220, background: "#fff", fontFamily: "inherit" }}
            type="text"
            placeholder={t("searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div style={{ display: "flex", gap: 2, background: "#e5e4e0", borderRadius: 8, padding: 2 }}>
            {[{ val: "", label: t("all") }, { val: "TEXT", label: t("text") }, { val: "IMAGE", label: t("image") }].map((m) => (
              <button
                key={m.val}
                onClick={() => setModality(m.val)}
                style={{
                  fontSize: 13, padding: "6px 14px", borderRadius: 6, cursor: "pointer",
                  background: modality === m.val ? "#fff" : "transparent",
                  color: modality === m.val ? "#2C2C2A" : "#5F5E5A",
                  fontWeight: modality === m.val ? 500 : 400,
                  border: "none", fontFamily: "inherit",
                  boxShadow: modality === m.val ? "0 0 0 0.5px #e5e4e0" : "none",
                }}
              >
                {m.label}
              </button>
            ))}
          </div>
          <button
            onClick={handleSync}
            disabled={syncing}
            style={{ fontSize: 12, padding: "7px 14px", borderRadius: 8, border: "0.5px solid #e5e4e0", background: "#fff", color: "#2C2C2A", cursor: "pointer", fontFamily: "inherit" }}
          >
            {syncing ? t("syncing") : `\u21BB ${t("syncModels")}`}
          </button>
        </div>
      </div>

      {/* ── Model list ── */}
      {loading ? (
        <p style={{ textAlign: "center", padding: "48px 0", color: "#888780" }}>{tc("loading")}</p>
      ) : (
        <div style={{ border: "0.5px solid #e5e4e0", borderRadius: 12, overflow: "hidden", background: "#fff" }}>
          {visibleModels.map((model) => {
            const expanded = expandedModels.has(model.id);
            return (
              <div key={model.id}>
                {/* Model row */}
                <div
                  onClick={() => setExpandedModels((s) => toggle(s, model.id))}
                  style={{
                    display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", cursor: "pointer",
                    background: expanded ? "#f8f7f5" : "transparent",
                    borderBottom: "0.5px solid #f3f2ee",
                  }}
                  onMouseEnter={(e) => { if (!expanded) e.currentTarget.style.background = "#f8f7f5"; }}
                  onMouseLeave={(e) => { if (!expanded) e.currentTarget.style.background = "transparent"; }}
                >
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: HEALTH_DOT[model.healthStatus], flexShrink: 0, display: "inline-block" }} />
                  <span style={{ fontSize: 13, fontWeight: 500, flex: 1, fontFamily: "'SF Mono','Fira Code','Consolas',monospace" }}>{model.name}</span>
                  <span style={{
                    fontSize: 11, padding: "2px 8px", borderRadius: 4, fontWeight: 500,
                    background: model.modality === "TEXT" ? "#E6F1FB" : "#FBEAF0",
                    color: model.modality === "TEXT" ? "#0C447C" : "#72243E",
                  }}>
                    {model.modality.toLowerCase()}
                  </span>
                  <span style={{ fontSize: 12, color: "#888780" }}>{model.contextWindow ? formatContext(model.contextWindow) : "\u2014"}</span>
                  <span style={{ fontSize: 12, color: "#5F5E5A", fontFamily: "'SF Mono','Fira Code','Consolas',monospace" }}>{fmtPrice(model.sellPrice)}</span>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: "#888780" }}>
                    {model.summary.activeChannels > 0 && (
                      <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: STATUS_DOT.ACTIVE, display: "inline-block" }} />
                        {model.summary.activeChannels}
                      </span>
                    )}
                    {model.summary.degradedChannels > 0 && (
                      <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: STATUS_DOT.DEGRADED, display: "inline-block" }} />
                        {model.summary.degradedChannels}
                      </span>
                    )}
                    {model.summary.disabledChannels > 0 && (
                      <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: STATUS_DOT.DISABLED, display: "inline-block" }} />
                        {model.summary.disabledChannels}
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: 12, color: "#B4B2A9" }}>{expanded ? "\u25B2" : "\u25B6"}</span>
                </div>

                {/* Channel cards */}
                {expanded && (
                  <div style={{ background: "#f8f7f5", padding: 12, margin: "0 16px 8px", borderRadius: 8 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      {model.channels.map((ch) => {
                        const borderColor = STATUS_DOT[ch.status];
                        const barColor = (ch.successRate ?? 0) >= 90 ? "#639922" : (ch.successRate ?? 0) >= 50 ? "#BA7517" : "#E24B4A";
                        return (
                          <div
                            key={ch.id}
                            style={{
                              background: "#fff", borderRadius: "0 8px 8px 0", padding: "12px 14px",
                              border: "0.5px solid #e5e4e0", borderLeft: `3px solid ${borderColor}`,
                              opacity: ch.status === "DISABLED" ? 0.6 : 1, position: "relative",
                            }}
                          >
                            {/* Top: provider name + priority */}
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                              <span style={{ fontSize: 13, fontWeight: 500 }}>{ch.providerName}</span>
                              {editingPriority === ch.id ? (
                                <Input
                                  className="w-12 h-6 text-center text-xs"
                                  autoFocus
                                  value={priorityValue}
                                  onChange={(e) => setPriorityValue(e.target.value)}
                                  onBlur={() => savePriority(ch.id)}
                                  onKeyDown={(e) => e.key === "Enter" && savePriority(ch.id)}
                                />
                              ) : (
                                <span
                                  onClick={(e) => { e.stopPropagation(); setEditingPriority(ch.id); setPriorityValue(String(ch.priority)); }}
                                  style={{ fontSize: 11, color: "#888780", background: "#f3f2ee", padding: "2px 8px", borderRadius: 4, cursor: "pointer" }}
                                >
                                  P{ch.priority}
                                </span>
                              )}
                            </div>

                            {/* 4 stats */}
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 12px" }}>
                              <span style={{ fontSize: 11, color: "#888780" }}>Cost <b style={{ color: "#2C2C2A", fontWeight: 500 }}>{fmtPrice(ch.costPrice)}</b></span>
                              <span style={{ fontSize: 11, color: "#888780" }}>
                                Sell{" "}
                                {editingSellPrice === ch.id ? (
                                  <Input
                                    className="inline w-16 h-5 text-xs font-mono"
                                    autoFocus
                                    value={sellPriceValue}
                                    onChange={(e) => setSellPriceValue(e.target.value)}
                                    onBlur={() => saveSellPrice(ch)}
                                    onKeyDown={(e) => e.key === "Enter" && saveSellPrice(ch)}
                                  />
                                ) : (
                                  <b
                                    style={{ color: "#2C2C2A", fontWeight: 500, cursor: "pointer" }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingSellPrice(ch.id);
                                      setSellPriceValue(String(ch.sellPrice.unit === "call" ? ch.sellPrice.perCall : ch.sellPrice.inputPer1M));
                                    }}
                                  >
                                    {fmtPrice(ch.sellPrice)}
                                  </b>
                                )}
                                {ch.sellPriceLocked && <span title={t("priceLocked")}> 🔒</span>}
                              </span>
                              <span style={{ fontSize: 11, color: "#888780" }}>Latency <b style={{ color: "#2C2C2A", fontWeight: 500 }}>{ch.latencyMs !== null ? `${ch.latencyMs}ms` : "\u2014"}</b></span>
                              <span style={{ fontSize: 11, color: "#888780" }}>Success <b style={{ color: "#2C2C2A", fontWeight: 500 }}>{ch.successRate !== null ? `${ch.successRate}%` : "\u2014"}</b></span>
                            </div>

                            {/* Progress bar */}
                            <div style={{ height: 3, borderRadius: 2, marginTop: 8, background: "#e5e4e0" }}>
                              <div style={{ height: 3, borderRadius: 2, width: `${ch.successRate ?? 0}%`, background: barColor }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Show all button */}
          {hasMore && (
            <button
              onClick={() => setVisibleCount(data.length)}
              style={{ display: "block", width: "100%", padding: "10px 0", fontSize: 12, color: "#5F5E5A", background: "transparent", border: "none", borderTop: "0.5px solid #f3f2ee", cursor: "pointer", fontFamily: "inherit" }}
            >
              {t("showAll", { count: data.length })}
            </button>
          )}
        </div>
      )}

      {/* ── Footer ── */}
      <div style={{ fontSize: 11, color: "#B4B2A9", display: "flex", gap: 16, marginTop: 16, alignItems: "center" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#639922", display: "inline-block" }} /> {t("active")}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#BA7517", display: "inline-block" }} /> {t("degraded")}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#E24B4A", display: "inline-block" }} /> {t("disabled")}
        </span>
        {lastSyncTime && (
          <span style={{ marginLeft: "auto" }}>{t("lastSync")}: {new Date(lastSyncTime).toLocaleString()}</span>
        )}
      </div>

      {/* Sync result */}
      {lastSyncResult && (
        <div style={{ border: "0.5px solid #e5e4e0", borderRadius: 8, padding: 12, marginTop: 8, background: "#f8f7f5", fontSize: 11, color: "#888780" }}>
          <span>{t("syncResult")}: </span>
          <span style={{ color: "#639922" }}>+{lastSyncResult.summary.totalNewChannels} {t("newChannels")}</span>
          <span style={{ margin: "0 8px" }}>-{lastSyncResult.summary.totalDisabledChannels} {t("disabledLabel")}</span>
          {lastSyncResult.summary.totalFailedProviders > 0 && (
            <span style={{ color: "#E24B4A" }}>{lastSyncResult.summary.totalFailedProviders} {t("failedLabel")}</span>
          )}
          {lastSyncResult.providers.filter((p) => !p.success).map((p) => (
            <div key={p.providerName} style={{ color: "#E24B4A", marginTop: 4 }}>{"\u2717"} {p.providerName}: {p.error}</div>
          ))}
        </div>
      )}
    </div>
  );
}
