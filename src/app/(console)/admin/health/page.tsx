"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { toast } from "sonner";
import { timeAgo } from "@/lib/utils";

interface HealthChannel {
  channelId: string;
  provider: string;
  model: string;
  status: string;
  priority: number;
  modality: string;
  lastChecks: Array<{ level: string; result: string; latencyMs: number | null; createdAt: string }>;
}
interface Summary {
  active: number;
  degraded: number;
  disabled: number;
  total: number;
}

const STATUS_DOT: Record<string, string> = {
  ACTIVE: "bg-green-500",
  DEGRADED: "bg-yellow-500",
  DISABLED: "bg-red-500",
};
const STATUS_TEXT: Record<string, string> = {
  ACTIVE: "text-green-600",
  DEGRADED: "text-yellow-600",
  DISABLED: "text-red-600",
};

export default function HealthPage() {
  const t = useTranslations("adminHealth");
  const [channels, setChannels] = useState<HealthChannel[]>([]);
  const [summary, setSummary] = useState<Summary>({
    active: 0,
    degraded: 0,
    disabled: 0,
    total: 0,
  });
  const [checking, setChecking] = useState<string | null>(null);

  const load = async () => {
    try {
      const r = await apiFetch<{ summary: Summary; data: HealthChannel[] }>("/api/admin/health");
      setSummary(r.summary);
      setChannels(r.data);
    } catch {
      setSummary({ active: 0, degraded: 0, disabled: 0, total: 0 });
      setChannels([]);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const runCheck = async (channelId: string) => {
    setChecking(channelId);
    try {
      await apiFetch(`/api/admin/health/${channelId}/check`, { method: "POST" });
      toast.success(t("check"));
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
    setChecking(null);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <h2 className="text-3xl font-extrabold tracking-tight font-[var(--font-heading)] text-ds-on-surface">
        {t("title")}
      </h2>

      {/* ═══ Summary Dashboard (Bento) — code.html lines 161-218 ═══ */}
      <div className="grid grid-cols-12 gap-6 mb-8">
        {/* Main status card — lines 162-181 */}
        <div className="col-span-12 lg:col-span-8">
          <div className="bg-ds-surface-container-lowest rounded-xl p-8 flex flex-col justify-between min-h-[180px] shadow-sm relative overflow-hidden">
            <div className="absolute -right-12 -top-12 w-48 h-48 bg-ds-primary/5 rounded-full blur-3xl" />
            <div>
              <h2 className="font-[var(--font-heading)] text-3xl font-extrabold tracking-tight mb-2">
                {t("title")}
              </h2>
              <p className="text-ds-on-surface-variant max-w-md">
                Real-time infrastructure health monitoring with algorithmic check validation.
              </p>
            </div>
            <div className="flex items-center gap-8 mt-6">
              <div className="flex flex-col">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">
                  Total Channels
                </span>
                <span className="text-2xl font-[var(--font-heading)] font-bold">
                  {summary.total}
                </span>
              </div>
              <div className="w-px h-8 bg-slate-100" />
              <div className="flex flex-col">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">
                  Avg Latency
                </span>
                <span className="text-2xl font-[var(--font-heading)] font-bold text-ds-primary">
                  —
                </span>
              </div>
            </div>
          </div>
        </div>
        {/* Quick Stats Column — lines 183-218 */}
        <div className="col-span-12 lg:col-span-4 grid grid-cols-1 gap-4">
          {[
            {
              value: summary.active,
              label: "Active Models",
              dotColor: "bg-emerald-50",
              textColor: "text-emerald-600",
              icon: "check_circle",
              badge: "HEALTHY",
              badgeColor: "text-emerald-500 bg-emerald-50",
            },
            {
              value: summary.degraded,
              label: "Degraded State",
              dotColor: "bg-amber-50",
              textColor: "text-amber-600",
              icon: "warning",
              badge: "CHECKING",
              badgeColor: "text-amber-500 bg-amber-50",
            },
            {
              value: summary.disabled,
              label: "Disabled Nodes",
              dotColor: "bg-rose-50",
              textColor: "text-rose-600",
              icon: "cancel",
              badge: "ALERT",
              badgeColor: "text-rose-500 bg-rose-50",
            },
          ].map((c) => (
            <div
              key={c.label}
              className="bg-ds-surface-container-lowest rounded-xl p-5 flex items-center gap-4 shadow-sm"
            >
              <div
                className={`w-12 h-12 rounded-full ${c.dotColor} ${c.textColor} flex items-center justify-center`}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  {c.icon}
                </span>
              </div>
              <div>
                <div className="text-2xl font-[var(--font-heading)] font-bold">{c.value}</div>
                <div className="text-xs font-bold text-slate-400 uppercase">{c.label}</div>
              </div>
              <div className="ml-auto">
                <span className={`text-xs font-bold px-2 py-1 rounded ${c.badgeColor}`}>
                  {c.badge}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Channel Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {channels.map((ch) => (
          <div
            key={ch.channelId}
            className="bg-ds-surface-container-lowest p-5 rounded-xl shadow-sm flex items-center justify-between group hover:shadow-md transition-all"
          >
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
                        L{i + 1}:
                        {c?.result === "PASS" ? (
                          <span className="text-green-600">✓</span>
                        ) : c?.result === "FAIL" ? (
                          <span className="text-red-600">✗</span>
                        ) : (
                          <span className="text-slate-400">?</span>
                        )}
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
