"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { useProject } from "@/hooks/use-project";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency, timeAgo } from "@/lib/utils";
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import Link from "next/link";

interface UsageSummary { totalCalls: number; totalCost: number; avgLatencyMs: number; avgTtftMs: number; successRate: number; errorCount: number }
interface DailyData { date: string; calls: number; cost: number }
interface LogEntry { traceId: string; modelName: string; status: string; sellPrice: number | null; latencyMs: number | null; createdAt: string; promptPreview: string }
interface ModelData { model: string; calls: number; cost: number }

const COLORS = ["#2563eb", "#16a34a", "#d97706", "#dc2626", "#7c3aed", "#0891b2"];

export default function DashboardPage() {
  const { current, loading: projLoading } = useProject();
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [daily, setDaily] = useState<DailyData[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [models, setModels] = useState<ModelData[]>([]);
  const [hourly, setHourly] = useState<Array<{ hour: number; calls: number }>>([]);

  useEffect(() => {
    if (!current) return;
    const pid = current.id;
    Promise.all([
      apiFetch<UsageSummary>(`/api/projects/${pid}/usage?period=today`),
      apiFetch<{ data: DailyData[] }>(`/api/projects/${pid}/usage/daily?days=14`),
      apiFetch<{ data: LogEntry[] }>(`/api/projects/${pid}/logs?pageSize=5`),
      apiFetch<{ data: ModelData[] }>(`/api/projects/${pid}/usage/by-model`),
    ]).then(([u, d, l, m]) => {
      setUsage(u); setDaily(d.data); setLogs(l.data); setModels(m.data);
      // Compute hourly distribution from recent logs (fetch more for this)
      apiFetch<{ data: Array<{ createdAt: string }> }>(`/api/projects/${pid}/logs?pageSize=100`)
        .then((r) => {
          const counts = Array.from({ length: 24 }, (_, i) => ({ hour: i, calls: 0 }));
          for (const log of r.data) { counts[new Date(log.createdAt).getHours()].calls++; }
          setHourly(counts);
        });
    });
  }, [current]);

  if (projLoading) return <div className="text-muted-foreground">Loading...</div>;
  if (!current) return <div className="text-center py-20"><h2 className="text-xl font-semibold mb-2">No project yet</h2><p className="text-muted-foreground">Create your first project to get started.</p></div>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>

      {usage && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { label: "Today's Calls", value: usage.totalCalls.toLocaleString() },
            { label: "Today's Cost", value: formatCurrency(usage.totalCost, 2) },
            { label: "Avg Latency", value: `${usage.avgLatencyMs}ms` },
            { label: "Success Rate", value: `${(usage.successRate * 100).toFixed(1)}%` },
          ].map((c) => (
            <Card key={c.label}><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{c.label}</CardTitle></CardHeader>
              <CardContent><span className="text-2xl font-bold">{c.value}</span></CardContent></Card>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 mb-6">
        <Card><CardHeader><CardTitle className="text-sm">Call Trend (14d)</CardTitle></CardHeader>
          <CardContent className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={daily}><XAxis dataKey="date" tick={{ fontSize: 10 }} /><YAxis /><Tooltip />
                <Area type="monotone" dataKey="calls" stroke="#2563eb" fill="#2563eb" fillOpacity={0.1} /></AreaChart>
            </ResponsiveContainer>
          </CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Cost Trend (14d)</CardTitle></CardHeader>
          <CardContent className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={daily}><XAxis dataKey="date" tick={{ fontSize: 10 }} /><YAxis /><Tooltip />
                <Bar dataKey="cost" fill="#16a34a" /></BarChart>
            </ResponsiveContainer>
          </CardContent></Card>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <Card><CardHeader><CardTitle className="text-sm">Model Distribution</CardTitle></CardHeader>
          <CardContent className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart><Pie data={models} dataKey="calls" nameKey="model" cx="50%" cy="50%" innerRadius={40} outerRadius={70} label>
                {models.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie>
                <Tooltip /><Legend /></PieChart>
            </ResponsiveContainer>
          </CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Hourly Distribution</CardTitle></CardHeader>
          <CardContent className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourly}><XAxis dataKey="hour" tick={{ fontSize: 10 }} /><YAxis /><Tooltip />
                <Bar dataKey="calls" fill="#7c3aed" /></BarChart>
            </ResponsiveContainer>
          </CardContent></Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row justify-between items-center">
          <CardTitle className="text-sm">Recent Calls</CardTitle>
          <Link href="/logs" className="text-sm text-primary hover:underline">View all</Link>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead className="w-[110px]">Trace</TableHead><TableHead className="w-[120px]">Model</TableHead>
              <TableHead>Prompt</TableHead><TableHead className="w-[80px]">Status</TableHead>
              <TableHead className="w-[70px]">Cost</TableHead><TableHead className="w-[70px]">Latency</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {logs.map((l) => (
                <TableRow key={l.traceId}>
                  <TableCell className="font-mono text-xs text-primary">{l.traceId.slice(0, 12)}</TableCell>
                  <TableCell className="font-medium text-xs">{l.modelName}</TableCell>
                  <TableCell className="text-xs text-muted-foreground truncate max-w-[200px]" title={l.promptPreview}>{l.promptPreview || "—"}</TableCell>
                  <TableCell><Badge variant={l.status === "SUCCESS" ? "default" : "destructive"}>{l.status}</Badge></TableCell>
                  <TableCell className="font-mono text-xs">{l.sellPrice != null ? formatCurrency(l.sellPrice) : "—"}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{l.latencyMs ?? "—"}ms</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
