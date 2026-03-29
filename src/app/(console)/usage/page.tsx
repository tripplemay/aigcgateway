"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { useProject } from "@/hooks/use-project";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";

const COLORS = ["#2563eb", "#16a34a", "#d97706", "#dc2626", "#7c3aed", "#0891b2"];

export default function UsagePage() {
  const { current } = useProject();
  const [period, setPeriod] = useState("7d");
  const [summary, setSummary] = useState<Record<string, number> | null>(null);
  const [daily, setDaily] = useState<Array<Record<string, unknown>>>([]);
  const [byModel, setByModel] = useState<Array<Record<string, unknown>>>([]);

  useEffect(() => {
    if (!current) return;
    const pid = current.id;
    const days = period === "today" ? 1 : period === "30d" ? 30 : 7;
    Promise.all([
      apiFetch<Record<string, number>>(`/api/projects/${pid}/usage?period=${period}`),
      apiFetch<{ data: Array<Record<string, unknown>> }>(`/api/projects/${pid}/usage/daily?days=${days}`),
      apiFetch<{ data: Array<Record<string, unknown>> }>(`/api/projects/${pid}/usage/by-model`),
    ]).then(([s, d, m]) => { setSummary(s); setDaily(d.data); setByModel(m.data); });
  }, [current, period]);

  if (!current) return null;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Usage</h1>
        <div className="flex gap-1">
          {["today", "7d", "30d"].map((p) => (
            <Button key={p} size="sm" variant={period === p ? "default" : "outline"} onClick={() => setPeriod(p)}>{p}</Button>
          ))}
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { label: "Total Calls", value: (summary.totalCalls ?? 0).toLocaleString() },
            { label: "Total Cost", value: formatCurrency(summary.totalCost ?? 0, 2) },
            { label: "Total Tokens", value: (summary.totalTokens ?? 0).toLocaleString() },
            { label: "Avg Latency", value: `${summary.avgLatencyMs ?? 0}ms` },
          ].map((c) => (
            <Card key={c.label}><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{c.label}</CardTitle></CardHeader>
              <CardContent><span className="text-2xl font-bold">{c.value}</span></CardContent></Card>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 mb-6">
        <Card><CardHeader><CardTitle className="text-sm">Daily Calls</CardTitle></CardHeader>
          <CardContent className="h-[200px]"><ResponsiveContainer width="100%" height="100%">
            <AreaChart data={daily}><XAxis dataKey="date" tick={{ fontSize: 10 }} /><YAxis /><Tooltip />
              <Area type="monotone" dataKey="calls" stroke="#2563eb" fill="#2563eb" fillOpacity={0.1} /></AreaChart>
          </ResponsiveContainer></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Daily Cost</CardTitle></CardHeader>
          <CardContent className="h-[200px]"><ResponsiveContainer width="100%" height="100%">
            <BarChart data={daily}><XAxis dataKey="date" tick={{ fontSize: 10 }} /><YAxis /><Tooltip /><Bar dataKey="cost" fill="#16a34a" /></BarChart>
          </ResponsiveContainer></CardContent></Card>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card><CardHeader><CardTitle className="text-sm">By Model</CardTitle></CardHeader>
          <CardContent className="h-[200px]"><ResponsiveContainer width="100%" height="100%">
            <PieChart><Pie data={byModel} dataKey="calls" nameKey="model" cx="50%" cy="50%" outerRadius={70} label>
              {byModel.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip /><Legend /></PieChart>
          </ResponsiveContainer></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Model Ranking</CardTitle></CardHeader>
          <CardContent className="p-0"><Table>
            <TableHeader><TableRow><TableHead>Model</TableHead><TableHead>Calls</TableHead><TableHead>Tokens</TableHead><TableHead>Cost</TableHead><TableHead>Avg Latency</TableHead></TableRow></TableHeader>
            <TableBody>{byModel.map((m) => (
              <TableRow key={m.model as string}><TableCell className="text-xs font-mono">{m.model as string}</TableCell>
                <TableCell>{(m.calls as number).toLocaleString()}</TableCell>
                <TableCell>{(m.tokens as number).toLocaleString()}</TableCell>
                <TableCell className="font-mono">{formatCurrency(m.cost as number, 4)}</TableCell>
                <TableCell className="font-mono text-muted-foreground">{m.avgLatency as number}ms</TableCell></TableRow>
            ))}</TableBody>
          </Table></CardContent></Card>
      </div>
    </div>
  );
}
