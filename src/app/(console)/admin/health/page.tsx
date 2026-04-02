"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { toast } from "sonner";
import { timeAgo } from "@/lib/utils";
import "material-symbols/outlined.css";

interface HealthChannel {
  channelId: string;
  provider: string;
  model: string;
  status: string;
  priority: number;
  modality: string;
  lastChecks: Array<{ level: string; result: string; latencyMs: number | null; createdAt: string }>;
}
interface Summary { active: number; degraded: number; disabled: number; total: number; }

const STATUS_DOT: Record<string, string> = { ACTIVE: "bg-green-500", DEGRADED: "bg-yellow-500", DISABLED: "bg-red-500" };
const STATUS_TEXT: Record<string, string> = { ACTIVE: "text-green-600", DEGRADED: "text-yellow-600", DISABLED: "text-red-600" };

export default function HealthPage() {
  const t = useTranslations("adminHealth");
  const [channels, setChannels] = useState<HealthChannel[]>([]);
  const [summary, setSummary] = useState<Summary>({ active: 0, degraded: 0, disabled: 0, total: 0 });
  const [checking, setChecking] = useState<string | null>(null);

  const load = async () => {
    const r = await apiFetch<{ summary: Summary; data: HealthChannel[] }>("/api/admin/health");
    setSummary(r.summary);
    setChannels(r.data);
  };
  useEffect(() => { load(); }, []);

  const runCheck = async (channelId: string) => {
    setChecking(channelId);
    try {
      await apiFetch(`/api/admin/health/${channelId}/check`, { method: "POST" });
      toast.success(t("check"));
      load();
    } catch (e) { toast.error((e as Error).message); }
    setChecking(null);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <h2 className="text-3xl font-extrabold tracking-tight font-[var(--font-heading)] text-ds-on-surface">{t("title")}</h2>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-6">
        {[
          { label: t("active"), value: summary.active, color: "text-green-600", icon: "check_circle" },
          { label: t("degraded"), value: summary.degraded, color: "text-yellow-600", icon: "warning" },
          { label: t("disabled"), value: summary.disabled, color: "text-red-600", icon: "cancel" },
        ].map((c) => (
          <div key={c.label} className="bg-ds-surface-container-lowest p-6 rounded-xl shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold text-ds-outline uppercase tracking-widest">{c.label}</span>
              <span className={`material-symbols-outlined ${c.color}`}>{c.icon}</span>
            </div>
            <div className={`text-3xl font-black font-[var(--font-heading)] ${c.color}`}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Channel Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {channels.map((ch) => (
          <div key={ch.channelId} className="bg-ds-surface-container-lowest p-5 rounded-xl shadow-sm flex items-center justify-between group hover:shadow-md transition-all">
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${STATUS_DOT[ch.status] ?? "bg-gray-400"}`} />
              <div>
                <div className="font-bold text-sm text-ds-on-surface">{ch.model}</div>
                <div className="text-[10px] text-ds-on-surface-variant">
                  {ch.provider} · {t("priority")} {ch.priority} · {ch.modality}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                {ch.lastChecks[0] && (
                  <div className="text-[10px] text-slate-500">
                    {timeAgo(ch.lastChecks[0].createdAt)} · {ch.lastChecks[0].latencyMs}ms
                  </div>
                )}
                <div className="flex gap-2 mt-1 text-xs justify-end">
                  {["CONNECTIVITY", "FORMAT", "QUALITY"].map((level, i) => {
                    const c = ch.lastChecks.find((x) => x.level === level);
                    return (
                      <span key={level} className="font-bold">
                        L{i + 1}:{c?.result === "PASS" ? <span className="text-green-600">✓</span> : c?.result === "FAIL" ? <span className="text-red-600">✗</span> : <span className="text-slate-400">?</span>}
                      </span>
                    );
                  })}
                </div>
              </div>
              <button
                disabled={checking === ch.channelId}
                onClick={() => runCheck(ch.channelId)}
                className="px-3 py-1.5 text-xs font-bold text-ds-primary bg-ds-primary/5 hover:bg-ds-primary/10 rounded-lg transition-colors disabled:opacity-50"
              >
                {checking === ch.channelId ? "..." : t("check")}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
