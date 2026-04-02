"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useProject } from "@/hooks/use-project";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import Link from "next/link";
import "material-symbols/outlined.css";

interface ApiKeyRow { id: string; keyPrefix: string; name: string | null; status: string; }

const TOOLS = [
  { name: "list_models", descKey: "toolListModels", icon: "smart_toy" },
  { name: "chat", descKey: "toolChat", icon: "chat" },
  { name: "generate_image", descKey: "toolGenerateImage", icon: "image" },
  { name: "list_logs", descKey: "toolListLogs", icon: "terminal" },
  { name: "get_log_detail", descKey: "toolGetLogDetail", icon: "description" },
  { name: "get_balance", descKey: "toolGetBalance", icon: "payments" },
  { name: "get_usage_summary", descKey: "toolGetUsageSummary", icon: "bar_chart" },
] as const;

function generateConfig(type: "claude" | "cursor" | "generic", keyPrefix: string): string {
  const url = "https://aigc.guangai.ai/mcp";
  const keyPlaceholder = `${keyPrefix}••••••••`;
  if (type === "claude") return JSON.stringify({ mcpServers: { "aigc-gateway": { type: "streamable-http", url, headers: { Authorization: `Bearer ${keyPlaceholder}` } } } }, null, 2);
  if (type === "cursor") return JSON.stringify({ mcpServers: { "aigc-gateway": { url, headers: { Authorization: `Bearer ${keyPlaceholder}` } } } }, null, 2);
  return `URL: ${url}\nAuthorization: Bearer ${keyPlaceholder}`;
}

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

  const TABS = [
    { key: "claude" as const, label: t("claudeCode"), path: t("claudePath") },
    { key: "cursor" as const, label: t("cursor"), path: t("cursorPath") },
    { key: "generic" as const, label: t("generic"), path: null },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h2 className="text-3xl font-extrabold tracking-tight font-[var(--font-heading)] text-ds-on-surface">{t("title")}</h2>
        <p className="text-ds-on-surface-variant font-medium mt-1">{t("subtitle")}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Step 1: API Key */}
        <div className="bg-ds-surface-container-lowest p-6 rounded-2xl shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-ds-primary/10 flex items-center justify-center text-ds-primary">
              <span className="material-symbols-outlined">key</span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-ds-primary uppercase tracking-widest">Step 1</span>
              <h3 className="font-[var(--font-heading)] font-bold">{t("step1")}</h3>
            </div>
          </div>
          {keys.length === 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-500">{t("noKey")}</p>
              <Link href="/keys" className="text-sm font-bold text-ds-primary hover:underline flex items-center gap-1">
                {t("goToKeys")} <span className="material-symbols-outlined text-sm">arrow_forward</span>
              </Link>
            </div>
          ) : (
            <select
              className="w-full bg-ds-surface-container-low border-none rounded-xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-ds-primary/20 outline-none"
              value={selectedKey}
              onChange={(e) => setSelectedKey(e.target.value)}
            >
              {keys.map((k) => (
                <option key={k.id} value={k.keyPrefix}>{k.keyPrefix}•••• {k.name ? `(${k.name})` : ""}</option>
              ))}
            </select>
          )}
        </div>

        {/* Step 2: Config */}
        <div className="md:col-span-2 bg-ds-surface-container-lowest p-6 rounded-2xl shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-ds-primary/10 flex items-center justify-center text-ds-primary">
              <span className="material-symbols-outlined">code</span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-ds-primary uppercase tracking-widest">Step 2</span>
              <h3 className="font-[var(--font-heading)] font-bold">{t("step2")}</h3>
            </div>
          </div>
          <div className="flex bg-ds-surface-container-low p-1 rounded-xl mb-4">
            {TABS.map((tb) => (
              <button key={tb.key} onClick={() => setTab(tb.key)}
                className={`flex-1 px-4 py-1.5 text-xs font-bold transition-all ${tab === tb.key ? "text-ds-primary bg-white rounded-lg shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                {tb.label}
              </button>
            ))}
          </div>
          {TABS.find((tb) => tb.key === tab)?.path && (
            <p className="text-[11px] text-slate-400 font-mono mb-2">{TABS.find((tb) => tb.key === tab)!.path}</p>
          )}
          <div className="relative">
            <pre className="bg-[#1e1e2e] text-indigo-200 rounded-xl p-5 text-xs font-mono leading-relaxed overflow-x-auto">
              {generateConfig(tab, selectedKey || "pk_your_")}
            </pre>
            <button onClick={copyConfig} className="absolute top-3 right-3 p-2 text-slate-500 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
              <span className="material-symbols-outlined text-sm">content_copy</span>
            </button>
          </div>
        </div>
      </div>

      {/* Step 3: Tools */}
      <div className="bg-ds-surface-container-lowest p-6 rounded-2xl shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-ds-primary/10 flex items-center justify-center text-ds-primary">
            <span className="material-symbols-outlined">build</span>
          </div>
          <div>
            <span className="text-[10px] font-bold text-ds-primary uppercase tracking-widest">Step 3</span>
            <h3 className="font-[var(--font-heading)] font-bold">{t("step3")}</h3>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {TOOLS.map((tool) => (
            <div key={tool.name} className="flex items-center gap-3 p-3 rounded-xl hover:bg-ds-surface-container-low transition-colors">
              <span className="material-symbols-outlined text-ds-primary-container">{tool.icon}</span>
              <div>
                <span className="text-xs font-mono font-bold text-ds-primary">{tool.name}</span>
                <p className="text-xs text-ds-on-surface-variant">{t(tool.descKey)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
