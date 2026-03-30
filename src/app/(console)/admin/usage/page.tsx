"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";
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
  Legend,
} from "recharts";

interface UsageSummary {
  totalCalls: number;
  totalRevenue: number;
  totalCost: number;
  margin: number;
  avgLatencyMs: number;
  successRate: number;
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

const COLORS = ["#2563eb", "#16a34a", "#d97706", "#dc2626", "#7c3aed", "#0891b2", "#be185d"];

export default function AdminUsagePage() {
  const t = useTranslations("adminUsage");
  const [period, setPeriod] = useState("7d");
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [byProvider, setByProvider] = useState<ProviderData[]>([]);
  const [byModel, setByModel] = useState<ModelData[]>([]);

  const load = async () => {
    const [s, p, m] = await Promise.all([
      apiFetch<UsageSummary>(`/api/admin/usage?period=${period}`),
      apiFetch<{ data: ProviderData[] }>("/api/admin/usage/by-provider"),
      apiFetch<{ data: ModelData[] }>("/api/admin/usage/by-model"),
    ]);
    setSummary(s);
    setByProvider(p.data);
    setByModel(m.data);
  };
  useEffect(() => {
    load();
  }, [period]);

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <div className="flex gap-1">
          {["today", "7d", "30d"].map((p) => (
            <Button
              key={p}
              size="sm"
              variant={period === p ? "default" : "outline"}
              onClick={() => setPeriod(p)}
            >
              {p}
            </Button>
          ))}
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { label: t("totalCalls"), value: summary.totalCalls.toLocaleString() },
            { label: t("revenue"), value: formatCurrency(summary.totalRevenue, 2) },
            { label: t("cost"), value: formatCurrency(summary.totalCost, 2) },
            {
              label: t("margin"),
              value: `${formatCurrency(summary.margin, 2)} (${summary.totalRevenue > 0 ? ((summary.margin / summary.totalRevenue) * 100).toFixed(1) : 0}%)`,
            },
          ].map((c) => (
            <Card key={c.label}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">{c.label}</CardTitle>
              </CardHeader>
              <CardContent>
                <span className="text-2xl font-bold">{c.value}</span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 mb-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t("revenueByProvider")}</CardTitle>
          </CardHeader>
          <CardContent className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={byProvider}
                  dataKey="revenue"
                  nameKey="provider"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label
                >
                  {byProvider.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => formatCurrency(Number(v), 2)} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t("callsByModel")}</CardTitle>
          </CardHeader>
          <CardContent className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byModel.slice(0, 8)} layout="vertical">
                <XAxis type="number" />
                <YAxis type="category" dataKey="model" width={140} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="calls" fill="#2563eb" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t("providerCost")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Provider</TableHead>
                <TableHead>Calls</TableHead>
                <TableHead>Cost</TableHead>
                <TableHead>Revenue</TableHead>
                <TableHead>Margin</TableHead>
                <TableHead>Margin %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byProvider.map((p) => (
                <TableRow key={p.provider}>
                  <TableCell className="font-medium">{p.provider}</TableCell>
                  <TableCell>{p.calls.toLocaleString()}</TableCell>
                  <TableCell className="font-mono">{formatCurrency(p.cost, 4)}</TableCell>
                  <TableCell className="font-mono">{formatCurrency(p.revenue, 4)}</TableCell>
                  <TableCell className="font-mono">{formatCurrency(p.margin, 4)}</TableCell>
                  <TableCell>{p.marginPercent.toFixed(1)}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
