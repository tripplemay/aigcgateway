"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { formatCurrency } from "@/lib/utils";
import { toast } from "sonner";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

interface UsageSummary {
  totalCalls: number;
  totalRevenue: number;
  totalCost: number;
  margin: number;
}
interface ProviderData {
  provider: string;
  calls: number;
  cost: number;
  revenue: number;
  margin: number;
  marginPercent: number;
}
interface ModelData {
  model: string;
  calls: number;
  tokens: number;
  cost: number;
  revenue: number;
  avgLatency: number;
}

const PIE_COLORS = ["#5443b9", "#5f5987", "#7c4b00", "#c8bfff", "#ffb964", "#9d6100", "#ba1a1a"];
const tooltipStyle = {
  contentStyle: {
    background: "rgba(250,248,255,0.95)",
    backdropFilter: "blur(12px)",
    border: "none",
    borderRadius: 12,
    fontSize: 12,
  },
};

export default function AdminUsagePage() {
  const t = useTranslations("adminUsage");
  const [period, setPeriod] = useState("7d");
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [byProvider, setByProvider] = useState<ProviderData[]>([]);
  const [byModel, setByModel] = useState<ModelData[]>([]);

  useEffect(() => {
    Promise.all([
      apiFetch<UsageSummary>(`/api/admin/usage?period=${period}`),
      apiFetch<{ data: ProviderData[] }>("/api/admin/usage/by-provider"),
      apiFetch<{ data: ModelData[] }>("/api/admin/usage/by-model"),
    ])
      .then(([s, p, m]) => {
        setSummary(s);
        setByProvider(p.data);
        setByModel(m.data);
      })
      .catch((err) => toast.error((err as Error).message));
  }, [period]);

  const marginPct =
    summary && summary.totalRevenue > 0
      ? ((summary.margin / summary.totalRevenue) * 100).toFixed(1)
      : "0";

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-extrabold tracking-tight font-[var(--font-heading)] text-ds-on-surface">
          {t("title")}
        </h2>
        <div className="bg-ds-surface-container-low p-1 rounded-full flex gap-1">
          {["today", "7d", "30d"].map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-5 py-1.5 rounded-full text-xs font-bold transition-all ${period === p ? "bg-white text-ds-primary shadow-sm" : "text-ds-on-surface-variant hover:text-ds-primary"}`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { label: t("totalCalls"), value: summary.totalCalls.toLocaleString(), icon: "call" },
            {
              label: t("revenue"),
              value: formatCurrency(summary.totalRevenue, 2),
              icon: "trending_up",
            },
            { label: t("cost"), value: formatCurrency(summary.totalCost, 2), icon: "payments" },
            {
              label: t("margin"),
              value: `${formatCurrency(summary.margin, 2)} (${marginPct}%)`,
              icon: "savings",
            },
          ].map((c) => (
            <div key={c.label} className="bg-ds-surface-container-lowest p-6 rounded-xl shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-bold text-ds-outline uppercase tracking-widest">
                  {c.label}
                </span>
                <span className="material-symbols-outlined text-ds-primary-container text-lg">
                  {c.icon}
                </span>
              </div>
              <div className="text-2xl font-black font-[var(--font-heading)] text-ds-on-surface">
                {c.value}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue by Provider Pie */}
        <div className="bg-ds-surface-container-lowest p-8 rounded-xl shadow-sm">
          <h4 className="text-sm font-bold uppercase tracking-widest text-ds-outline mb-1">
            {t("revenueByProvider")}
          </h4>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={byProvider}
                  dataKey="revenue"
                  nameKey="provider"
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  strokeWidth={2}
                  stroke="#fff"
                >
                  {byProvider.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip {...tooltipStyle} formatter={(v) => formatCurrency(Number(v), 2)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 space-y-2">
            {byProvider.map((p, i) => (
              <div key={p.provider} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
                  />
                  <span className="font-medium">{p.provider}</span>
                </div>
                <span className="font-bold">{formatCurrency(p.revenue, 2)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Calls by Model Bar */}
        <div className="bg-ds-surface-container-lowest p-8 rounded-xl shadow-sm">
          <h4 className="text-sm font-bold uppercase tracking-widest text-ds-outline mb-1">
            {t("callsByModel")}
          </h4>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byModel.slice(0, 8)} layout="vertical">
                <XAxis
                  type="number"
                  tick={{ fontSize: 10, fill: "#787584" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="model"
                  width={140}
                  tick={{ fontSize: 10, fill: "#787584" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip {...tooltipStyle} />
                <Bar dataKey="calls" fill="#5443b9" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Provider Cost Table */}
      <div className="bg-ds-surface-container-lowest rounded-xl shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-50">
          <h3 className="font-[var(--font-heading)] font-bold text-lg">{t("providerCost")}</h3>
        </div>
        <table className="w-full text-left">
          <thead className="bg-ds-surface-container-low/50">
            <tr>
              {["Provider", "Calls", "Cost", "Revenue", "Margin", "Margin %"].map((h) => (
                <th
                  key={h}
                  className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {byProvider.map((p) => (
              <tr key={p.provider} className="hover:bg-ds-surface-container-low transition-colors">
                <td className="px-6 py-4 text-sm font-bold">{p.provider}</td>
                <td className="px-6 py-4 text-sm">{p.calls.toLocaleString()}</td>
                <td className="px-6 py-4 text-sm font-mono">{formatCurrency(p.cost, 4)}</td>
                <td className="px-6 py-4 text-sm font-mono">{formatCurrency(p.revenue, 4)}</td>
                <td className="px-6 py-4 text-sm font-mono font-bold text-ds-primary">
                  {formatCurrency(p.margin, 4)}
                </td>
                <td className="px-6 py-4 text-sm font-bold">{p.marginPercent.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
