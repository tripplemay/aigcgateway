"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useProject } from "@/hooks/use-project";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import Link from "next/link";

// ============================================================
// Types & config
// ============================================================

interface ApiKeyRow { id: string; keyPrefix: string; name: string | null; status: string; }

const TOOLS = [
  { name: "list_models", descKey: "toolListModels", icon: "list_alt" },
  { name: "chat", descKey: "toolChat", icon: "forum" },
  { name: "generate_image", descKey: "toolGenerateImage", icon: "image" },
  { name: "list_logs", descKey: "toolListLogs", icon: "data_object" },
  { name: "get_log_detail", descKey: "toolGetLogDetail", icon: "analytics" },
  { name: "get_balance", descKey: "toolGetBalance", icon: "memory" },
  { name: "get_usage_summary", descKey: "toolGetUsageSummary", icon: "shield" },
] as const;

function generateConfig(type: "claude" | "cursor" | "generic", keyPrefix: string): string {
  const url = "https://aigc.guangai.ai/mcp";
  const keyPlaceholder = `${keyPrefix}••••••••`;
  if (type === "claude") return JSON.stringify({ mcpServers: { "aigc-gateway": { type: "streamable-http", url, headers: { Authorization: `Bearer ${keyPlaceholder}` } } } }, null, 2);
  if (type === "cursor") return JSON.stringify({ mcpServers: { "aigc-gateway": { url, headers: { Authorization: `Bearer ${keyPlaceholder}` } } } }, null, 2);
  return `URL: ${url}\nAuthorization: Bearer ${keyPlaceholder}`;
}

// ============================================================
// Page — code.html lines 162-379
// ============================================================

export default function McpSetupPage() {
  const t = useTranslations("mcpSetup");
  const { current, loading: projLoading } = useProject();
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [selectedKey, setSelectedKey] = useState<string>("");
  const [tab, setTab] = useState<"claude" | "cursor" | "generic">("claude");

  useEffect(() => {
    if (!current) return;
    apiFetch<{ data: ApiKeyRow[] }>(`/api/projects/${current.id}/keys`).then((r) => {
      const active = r.data.filter((k) => k.status === "ACTIVE");
      setKeys(active);
      if (active.length > 0) setSelectedKey(active[0].keyPrefix);
    });
  }, [current]);

  if (projLoading) return (<div className="space-y-4 pt-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-64 w-full" /></div>);

  const copyConfig = () => {
    navigator.clipboard.writeText(generateConfig(tab, selectedKey || "pk_your_"));
    toast.success(t("copied"));
  };

  return (
    /* code.html line 162 */
    <div className="max-w-7xl mx-auto">
      {/* Page Header — code.html lines 164-171 */}
      <header className="mb-12">
        <div className="flex items-center gap-3 mb-2">
          <span className="bg-indigo-100 text-indigo-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest">Setup Guide</span>
          <div className="h-px flex-1 bg-ds-surface-container-high" />
        </div>
        <h2 className="text-4xl font-extrabold tracking-tight text-ds-on-surface mb-2 font-[var(--font-heading)]">{t("title")}</h2>
        <p className="text-slate-500 max-w-2xl">{t("subtitle")}</p>
      </header>

      {/* Bento Grid — code.html line 173: grid-cols-12 */}
      <div className="grid grid-cols-12 gap-8">

        {/* ═══ Left Column (col-span-5) — lines 175-291 ═══ */}
        <section className="col-span-12 lg:col-span-5 flex flex-col gap-6">

          {/* Step 1: API Key Selection — lines 176-218 */}
          <div className="bg-ds-surface-container-lowest p-8 rounded-xl shadow-[0px_20px_40px_rgba(19,27,46,0.04)] relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
              <span className="material-symbols-outlined text-8xl">key</span>
            </div>
            <div className="flex items-center gap-4 mb-6">
              <div className="w-10 h-10 rounded-full bg-ds-primary flex items-center justify-center text-white font-bold">1</div>
              <h3 className="text-xl font-bold font-[var(--font-heading)]">{t("step1")}</h3>
            </div>
            {/* Radio key cards — lines 184-214 */}
            <div className="space-y-3">
              {keys.length === 0 ? (
                <div className="p-4 rounded-xl bg-ds-surface-container-low text-center">
                  <p className="text-sm text-slate-500 mb-2">{t("noKey")}</p>
                  <Link href="/keys" className="text-sm font-bold text-indigo-600 hover:underline">{t("goToKeys")}</Link>
                </div>
              ) : keys.map((k) => (
                <label key={k.id} className="block">
                  <div className="relative cursor-pointer">
                    <input
                      type="radio"
                      name="api_key"
                      className="peer absolute opacity-0"
                      checked={selectedKey === k.keyPrefix}
                      onChange={() => setSelectedKey(k.keyPrefix)}
                    />
                    <div className="p-4 rounded-xl border-2 border-transparent bg-ds-surface-container-low peer-checked:border-ds-primary peer-checked:bg-white transition-all flex items-center justify-between">
                      <div>
                        <p className="text-xs font-bold text-slate-400 mb-1 uppercase tracking-tighter">{k.name ?? "Unnamed Key"}</p>
                        <p className="font-mono text-sm">{k.keyPrefix}••••••••</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-[10px] font-bold text-emerald-600 uppercase">Active</span>
                      </div>
                    </div>
                  </div>
                </label>
              ))}
            </div>
            {/* Create New Key — line 216-218 */}
            <Link href="/keys" className="mt-6 w-full py-3 text-sm font-bold text-indigo-600 border border-indigo-100 rounded-xl hover:bg-indigo-50 transition-colors block text-center">
              Create New Key
            </Link>
          </div>

          {/* Step 3: Protocol Tools — lines 220-291 */}
          <div className="bg-ds-surface-container-low p-8 rounded-xl">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-10 h-10 rounded-full bg-ds-primary-container flex items-center justify-center text-white font-bold">3</div>
              <h3 className="text-xl font-bold font-[var(--font-heading)]">{t("step3")}</h3>
            </div>
            <div className="grid grid-cols-1 gap-4">
              {TOOLS.map((tool) => (
                <div key={tool.name} className="flex items-start gap-4 p-3 bg-white rounded-lg shadow-sm border border-slate-100/50">
                  <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                    <span className="material-symbols-outlined">{tool.icon}</span>
                  </div>
                  <div>
                    <p className="text-sm font-bold">{tool.name}</p>
                    <p className="text-xs text-slate-500">{t(tool.descKey)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══ Right Column (col-span-7) — lines 293-352 ═══ */}
        <section className="col-span-12 lg:col-span-7">
          <div className="bg-ds-surface-container-lowest p-8 rounded-xl shadow-[0px_20px_40px_rgba(19,27,46,0.04)] h-full border border-white/50">
            {/* Header + Tabs — lines 296-305 */}
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-ds-primary-container/20 text-ds-primary flex items-center justify-center font-bold">2</div>
                <h3 className="text-xl font-bold font-[var(--font-heading)]">{t("step2")}</h3>
              </div>
              <div className="flex p-1 bg-ds-surface-container rounded-lg">
                {(["claude", "cursor", "generic"] as const).map((type) => (
                  <button key={type} onClick={() => setTab(type)}
                    className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${tab === type ? "bg-white shadow-sm text-indigo-600" : "text-slate-500 hover:text-slate-800"}`}>
                    {type === "claude" ? "Claude" : type === "cursor" ? "Cursor" : "Generic"}
                  </button>
                ))}
              </div>
            </div>

            {/* Config code block — lines 307-334 */}
            <div className="relative group">
              <div className="absolute top-4 right-4 z-10 flex gap-2">
                <button onClick={copyConfig} className="bg-slate-800 text-slate-400 p-2 rounded-lg hover:text-white transition-colors flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm">content_copy</span>
                  <span className="text-[10px] font-bold uppercase tracking-widest">Copy Config</span>
                </button>
              </div>
              <div className="bg-slate-950 rounded-2xl p-6 pt-12 overflow-x-auto border border-slate-800 shadow-2xl">
                <pre className="text-sm font-mono leading-relaxed text-indigo-100">
                  {generateConfig(tab, selectedKey || "pk_your_")}
                </pre>
              </div>
            </div>

            {/* Dynamic Tool Injection — lines 337-345 */}
            <div className="mt-12 p-8 rounded-2xl bg-indigo-50/50 border border-indigo-100 flex items-center gap-8">
              <div className="w-24 h-24 shrink-0 bg-white rounded-xl shadow-lg shadow-indigo-100/50 flex items-center justify-center">
                <span className="material-symbols-outlined text-4xl text-indigo-600">dynamic_form</span>
              </div>
              <div>
                <h4 className="font-bold text-indigo-900 mb-1">Dynamic Tool Injection</h4>
                <p className="text-sm text-indigo-700/70">By including this config, your IDE will automatically recognize and contextually suggest AIGC Gateway capabilities as first-class tools.</p>
              </div>
            </div>

            {/* Finalize button — lines 346-351 */}
            <div className="mt-8 flex justify-end">
              <button className="group flex items-center gap-2 bg-slate-900 text-white px-8 py-3 rounded-full font-bold hover:bg-black transition-all">
                <span>Finalize Installation</span>
                <span className="material-symbols-outlined group-hover:translate-x-1 transition-transform">arrow_forward</span>
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
