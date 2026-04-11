"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useAsyncData } from "@/hooks/use-async-data";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

// ============================================================
// Types (unchanged)
// ============================================================

interface Provider {
  id: string;
  name: string;
  displayName: string;
  baseUrl: string;
  adapterType: string;
  status: string;
  channelCount: number;
}

interface ProviderConfig {
  temperatureMin?: number;
  temperatureMax?: number;
  chatEndpoint?: string;
  imageEndpoint?: string | null;
  imageViaChat?: boolean;
  supportsModelsApi?: boolean;
  supportsSystemRole?: boolean;
  currency?: string;
  quirks?: string[];
}

// ============================================================
// Adapter presets for auto-fill
// ============================================================

const ADAPTER_PRESETS: Record<
  string,
  { displayName: string; baseUrl: string; adapterType: string; supportsModelsApi: boolean }
> = {
  openai: {
    displayName: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    adapterType: "openai-compat",
    supportsModelsApi: true,
  },
  anthropic: {
    displayName: "Anthropic Claude",
    baseUrl: "https://api.anthropic.com/v1/",
    adapterType: "openai-compat",
    supportsModelsApi: true,
  },
  deepseek: {
    displayName: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    adapterType: "openai-compat",
    supportsModelsApi: true,
  },
  zhipu: {
    displayName: "智谱 GLM",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    adapterType: "openai-compat",
    supportsModelsApi: true,
  },
  volcengine: {
    displayName: "火山引擎",
    baseUrl: "",
    adapterType: "volcengine",
    supportsModelsApi: false,
  },
  siliconflow: {
    displayName: "硅基流动",
    baseUrl: "https://api.siliconflow.cn/v1",
    adapterType: "siliconflow",
    supportsModelsApi: true,
  },
  openrouter: {
    displayName: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    adapterType: "openai-compat",
    supportsModelsApi: true,
  },
  minimax: {
    displayName: "MiniMax",
    baseUrl: "https://api.minimax.io/v1",
    adapterType: "openai-compat",
    supportsModelsApi: true,
  },
  moonshot: {
    displayName: "Moonshot/Kimi",
    baseUrl: "https://api.moonshot.cn/v1",
    adapterType: "openai-compat",
    supportsModelsApi: true,
  },
  qwen: {
    displayName: "阿里云百炼/Qwen",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    adapterType: "openai-compat",
    supportsModelsApi: true,
  },
  stepfun: {
    displayName: "阶跃星辰/StepFun",
    baseUrl: "https://api.stepfun.com/v1",
    adapterType: "openai-compat",
    supportsModelsApi: true,
  },
};

// ============================================================
// Component
// ============================================================

export default function ProvidersPage() {
  const t = useTranslations("adminProviders");
  const tc = useTranslations("common");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [editId, setEditId] = useState<string | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [configProviderId, setConfigProviderId] = useState<string | null>(null);
  const [config, setConfig] = useState<ProviderConfig>({});
  const [quirksText, setQuirksText] = useState("");

  const {
    data: providersResult,
    loading,
    refetch: load,
  } = useAsyncData<{ data: Provider[] }>(async () => {
    return apiFetch<{ data: Provider[] }>("/api/admin/providers");
  }, []);

  const providers = providersResult?.data ?? [];

  const openCreate = () => {
    setForm({});
    setEditId(null);
    setDialogOpen(true);
  };
  const openEdit = (p: Provider) => {
    setForm({
      name: p.name,
      displayName: p.displayName,
      baseUrl: p.baseUrl,
      adapterType: p.adapterType,
    });
    setEditId(p.id);
    setDialogOpen(true);
  };

  const save = async () => {
    try {
      if (editId) {
        await apiFetch(`/api/admin/providers/${editId}`, {
          method: "PATCH",
          body: JSON.stringify(form),
        });
      } else {
        await apiFetch("/api/admin/providers", { method: "POST", body: JSON.stringify(form) });
      }
      toast.success(tc("saved"));
      setDialogOpen(false);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const toggleStatus = async (p: Provider) => {
    const s = p.status === "ACTIVE" ? "DISABLED" : "ACTIVE";
    await apiFetch(`/api/admin/providers/${p.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: s }),
    });
    toast.success(`${p.displayName} → ${s}`);
    load();
  };

  const set = (k: string, v: string) => setForm((prev) => ({ ...prev, [k]: v }));

  // ── Render — 1:1 replica of Admin Providers code.html ──
  return (
    <>
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex justify-between items-end">
          <div>
            <h2 className="text-3xl font-extrabold tracking-tight font-[var(--font-heading)] text-ds-on-surface">
              {t("title")}
            </h2>
            <p className="text-ds-on-surface-variant font-medium mt-1">{t("subtitle")}</p>
          </div>
          <button
            onClick={openCreate}
            className="bg-gradient-to-r from-ds-primary to-ds-primary-container text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-ds-primary/20 hover:scale-[1.02] transition-transform"
          >
            <span className="material-symbols-outlined">add</span>
            {t("addProvider")}
          </button>
        </div>

        {/* Table */}
        <div className="bg-ds-surface-container-lowest rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-ds-surface-container-low/50">
              <tr>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                  {tc("name")}
                </th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                  {t("baseUrl")}
                </th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                  {t("adapter")}
                </th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                  {t("channels")}
                </th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                  {tc("status")}
                </th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">
                  {tc("actions")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-ds-outline">
                    {tc("loading")}
                  </td>
                </tr>
              ) : (
                providers.map((p) => (
                  <tr key={p.id} className="hover:bg-ds-surface-container-low transition-colors">
                    <td className="px-6 py-4">
                      <span className="text-sm font-bold text-ds-on-surface">{p.displayName}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-xs font-mono text-slate-500">{p.baseUrl}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-tight bg-ds-surface-container text-ds-on-surface-variant">
                        {p.adapterType}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-slate-600">
                      {p.channelCount}
                    </td>
                    <td className="px-6 py-4">
                      <button onClick={() => toggleStatus(p)}>
                        {p.status === "ACTIVE" ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-700 border border-green-200">
                            {t("statusActive")}
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200">
                            {t("statusDisabled")}
                          </span>
                        )}
                      </button>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => openEdit(p)}
                          className="p-2 text-slate-400 hover:text-ds-primary hover:bg-ds-primary/5 rounded-lg transition-all"
                        >
                          <span className="material-symbols-outlined text-lg">edit</span>
                        </button>
                        <button
                          onClick={async () => {
                            const r = await apiFetch<{ data: ProviderConfig | null }>(
                              `/api/admin/providers/${p.id}/config`,
                            );
                            setConfig(r.data ?? {});
                            setQuirksText((r.data?.quirks ?? []).join(", "));
                            setConfigProviderId(p.id);
                            setConfigOpen(true);
                          }}
                          className="p-2 text-slate-400 hover:text-ds-primary hover:bg-ds-primary/5 rounded-lg transition-all"
                        >
                          <span className="material-symbols-outlined text-lg">settings</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ═══ Create/Edit Modal ═══ */}
      {dialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ds-on-background/40 backdrop-blur-sm">
          <div className="bg-ds-surface-container-lowest w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-8 py-6 bg-ds-surface-container-low flex justify-between items-center">
              <h2 className="text-xl font-extrabold tracking-tight font-[var(--font-heading)]">
                {editId ? t("editProvider") : t("addProviderTitle")}
              </h2>
              <button
                onClick={() => setDialogOpen(false)}
                className="text-ds-on-surface-variant hover:text-ds-on-surface"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="p-8 space-y-5">
              {/* Adapter preset selector (create mode only) */}
              {!editId && (
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold uppercase tracking-widest text-ds-primary block">
                    {t("selectAdapter")}
                  </label>
                  <select
                    className="w-full bg-ds-primary/5 border-2 border-ds-primary/20 rounded-lg px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-ds-primary/20 outline-none"
                    value={form.name ?? ""}
                    onChange={(e) => {
                      const preset = ADAPTER_PRESETS[e.target.value];
                      if (preset) {
                        setForm({
                          name: e.target.value,
                          displayName: preset.displayName,
                          baseUrl: preset.baseUrl,
                          adapterType: preset.adapterType,
                        });
                      }
                    }}
                  >
                    <option value="">{t("chooseAdapter")}</option>
                    {Object.entries(ADAPTER_PRESETS).map(([key, p]) => (
                      <option key={key} value={key}>
                        {p.displayName} ({key})
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {[
                { key: "name", label: tc("name"), placeholder: t("namePlaceholder") },
                {
                  key: "displayName",
                  label: t("displayName"),
                  placeholder: t("displayNamePlaceholder"),
                },
                { key: "baseUrl", label: t("baseUrl"), placeholder: "https://api.openai.com/v1" },
                { key: "apiKey", label: t("apiKey"), placeholder: "sk-...", type: "password" },
              ].map((f) => (
                <div key={f.key} className="space-y-1.5">
                  <label className="text-[11px] font-bold uppercase tracking-widest text-ds-on-surface-variant block">
                    {f.label}
                  </label>
                  <input
                    type={f.type ?? "text"}
                    className="w-full bg-ds-surface-container-low border-none rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-ds-primary/20 outline-none"
                    placeholder={f.placeholder}
                    value={form[f.key] ?? ""}
                    onChange={(e) => set(f.key, e.target.value)}
                  />
                </div>
              ))}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold uppercase tracking-widest text-ds-on-surface-variant block">
                  {t("adapter")}
                </label>
                <select
                  className="w-full bg-ds-surface-container-low border-none rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-ds-primary/20 outline-none"
                  value={form.adapterType ?? "openai-compat"}
                  onChange={(e) => set("adapterType", e.target.value)}
                >
                  <option value="openai-compat">openai-compat</option>
                  <option value="volcengine">volcengine</option>
                  <option value="siliconflow">siliconflow</option>
                </select>
              </div>
            </div>
            <div className="px-8 py-6 bg-ds-surface-container-low/50 flex justify-end gap-4">
              <button
                onClick={() => setDialogOpen(false)}
                className="px-6 py-2.5 font-bold text-sm text-ds-on-surface-variant hover:text-ds-on-surface"
              >
                {tc("cancel")}
              </button>
              <button
                onClick={save}
                className="bg-ds-primary-container text-ds-on-primary-container px-8 py-3 rounded-xl font-bold text-sm shadow-lg shadow-ds-primary/20 hover:scale-[1.02] transition-transform"
              >
                {tc("save")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Config Override Modal ═══ */}
      {configOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ds-on-background/40 backdrop-blur-sm">
          <div className="bg-ds-surface-container-lowest w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-8 py-6 bg-ds-surface-container-low flex justify-between items-center">
              <h2 className="text-xl font-extrabold tracking-tight font-[var(--font-heading)]">
                {t("configOverride")}
              </h2>
              <button
                onClick={() => setConfigOpen(false)}
                className="text-ds-on-surface-variant hover:text-ds-on-surface"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="p-8 space-y-5 max-h-[60vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold uppercase tracking-widest text-ds-on-surface-variant block">
                    {t("tempMin")}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    className="w-full bg-ds-surface-container-low border-none rounded-lg px-4 py-3 text-sm outline-none"
                    value={config.temperatureMin ?? 0}
                    onChange={(e) =>
                      setConfig({ ...config, temperatureMin: Number(e.target.value) })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold uppercase tracking-widest text-ds-on-surface-variant block">
                    {t("tempMax")}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    className="w-full bg-ds-surface-container-low border-none rounded-lg px-4 py-3 text-sm outline-none"
                    value={config.temperatureMax ?? 2}
                    onChange={(e) =>
                      setConfig({ ...config, temperatureMax: Number(e.target.value) })
                    }
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold uppercase tracking-widest text-ds-on-surface-variant block">
                  {t("chatEndpoint")}
                </label>
                <input
                  className="w-full bg-ds-surface-container-low border-none rounded-lg px-4 py-3 text-sm outline-none"
                  value={config.chatEndpoint ?? "/chat/completions"}
                  onChange={(e) => setConfig({ ...config, chatEndpoint: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold uppercase tracking-widest text-ds-on-surface-variant block">
                  {t("imageEndpoint")}
                </label>
                <input
                  className="w-full bg-ds-surface-container-low border-none rounded-lg px-4 py-3 text-sm outline-none"
                  placeholder={t("imageEndpointPlaceholder")}
                  value={config.imageEndpoint ?? ""}
                  onChange={(e) => setConfig({ ...config, imageEndpoint: e.target.value || null })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-3">
                  <Switch
                    checked={config.imageViaChat ?? false}
                    onCheckedChange={(v) => setConfig({ ...config, imageViaChat: v })}
                  />
                  <label className="text-xs font-bold text-ds-on-surface-variant">
                    {t("imageViaChat")}
                  </label>
                </div>
                <div className="flex items-center gap-3">
                  <Switch
                    checked={config.supportsModelsApi ?? false}
                    onCheckedChange={(v) => setConfig({ ...config, supportsModelsApi: v })}
                  />
                  <label className="text-xs font-bold text-ds-on-surface-variant">
                    {t("supportsModels")}
                  </label>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-3">
                  <Switch
                    checked={config.supportsSystemRole ?? true}
                    onCheckedChange={(v) => setConfig({ ...config, supportsSystemRole: v })}
                  />
                  <label className="text-xs font-bold text-ds-on-surface-variant">
                    {t("supportsSystem")}
                  </label>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold uppercase tracking-widest text-ds-on-surface-variant block">
                    {t("currency")}
                  </label>
                  <select
                    className="w-full bg-ds-surface-container-low border-none rounded-lg px-4 py-3 text-sm outline-none"
                    value={config.currency ?? "USD"}
                    onChange={(e) => setConfig({ ...config, currency: e.target.value })}
                  >
                    <option value="USD">USD</option>
                    <option value="CNY">CNY</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold uppercase tracking-widest text-ds-on-surface-variant block">
                  {t("quirks")}
                </label>
                <textarea
                  className="w-full bg-ds-surface-container-low border-none rounded-lg px-4 py-3 text-sm outline-none resize-none"
                  rows={3}
                  placeholder={t("quirksPlaceholder")}
                  value={quirksText}
                  onChange={(e) => setQuirksText(e.target.value)}
                />
              </div>
            </div>
            <div className="px-8 py-6 bg-ds-surface-container-low/50 flex justify-end gap-4">
              <button
                onClick={() => setConfigOpen(false)}
                className="px-6 py-2.5 font-bold text-sm text-ds-on-surface-variant"
              >
                {tc("cancel")}
              </button>
              <button
                onClick={async () => {
                  try {
                    const quirks = quirksText
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean);
                    await apiFetch(`/api/admin/providers/${configProviderId}/config`, {
                      method: "PATCH",
                      body: JSON.stringify({ ...config, quirks }),
                    });
                    toast.success(t("configSaved"));
                    setConfigOpen(false);
                  } catch (e) {
                    toast.error((e as Error).message);
                  }
                }}
                className="bg-ds-primary-container text-ds-on-primary-container px-8 py-3 rounded-xl font-bold text-sm shadow-lg shadow-ds-primary/20"
              >
                {t("saveConfig")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
