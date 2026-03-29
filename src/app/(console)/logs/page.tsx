"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { apiFetch } from "@/lib/api-client";
import { useProject } from "@/hooks/use-project";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency, timeAgo } from "@/lib/utils";
import { X } from "lucide-react";

interface LogEntry {
  traceId: string; modelName: string; status: string; finishReason: string | null;
  promptTokens: number | null; completionTokens: number | null; totalTokens: number | null;
  sellPrice: number | null; latencyMs: number | null; ttftMs: number | null;
  tokensPerSecond: number | null; createdAt: string; promptPreview?: string;
  promptSnapshot?: Array<{ role: string; content: string }>;
  requestParams?: Record<string, unknown>;
  responseContent?: string | null; errorMessage?: string | null;
}

export default function LogsPage() {
  const { current } = useProject();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [selectedTrace, setSelectedTrace] = useState<string | null>(null);
  const [detail, setDetail] = useState<LogEntry | null>(null);
  const [debouncedQ, setDebouncedQ] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // 300ms debounce for search
  useEffect(() => {
    debounceRef.current = setTimeout(() => setDebouncedQ(searchQ), 300);
    return () => clearTimeout(debounceRef.current);
  }, [searchQ]);

  const load = useCallback(async () => {
    if (!current) return;
    const params = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (statusFilter) params.set("status", statusFilter);
    if (startDate) params.set("startTime", new Date(startDate).toISOString());
    if (endDate) params.set("endTime", new Date(endDate + "T23:59:59").toISOString());
    const url = debouncedQ
      ? `/api/projects/${current.id}/logs/search?q=${encodeURIComponent(debouncedQ)}&page=${page}`
      : `/api/projects/${current.id}/logs?${params}`;
    const r = await apiFetch<{ data: LogEntry[]; pagination?: { total: number } }>(url);
    setLogs(r.data); setTotal(r.pagination?.total ?? r.data.length);
  }, [current, page, statusFilter, debouncedQ, startDate, endDate]);

  useEffect(() => { load(); }, [load]);

  const loadDetail = async (traceId: string) => {
    if (!current) return;
    if (selectedTrace === traceId) { setSelectedTrace(null); setDetail(null); return; }
    const r = await apiFetch<LogEntry>(`/api/projects/${current.id}/logs/${traceId}`);
    setDetail(r); setSelectedTrace(traceId);
  };

  if (!current) return null;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Audit Logs</h1>
      <div className="flex gap-2 mb-4 flex-wrap">
        <Input className="max-w-sm" placeholder="Search prompts, models, trace IDs..."
          value={searchQ} onChange={(e) => { setSearchQ(e.target.value); setPage(1); }} />
        <Input type="date" className="w-36" value={startDate} onChange={(e) => { setStartDate(e.target.value); setPage(1); }} />
        <Input type="date" className="w-36" value={endDate} onChange={(e) => { setEndDate(e.target.value); setPage(1); }} />
        <div className="flex gap-1 ml-auto">
          {["", "SUCCESS", "ERROR", "FILTERED"].map((s) => (
            <Button key={s} size="sm" variant={statusFilter === s ? "default" : "outline"}
              onClick={() => { setStatusFilter(s); setPage(1); }}>{s || "All"}</Button>
          ))}
        </div>
      </div>

      {/* Detail panel */}
      {detail && (
        <Card className="mb-4">
          <CardContent className="p-4">
            <div className="flex justify-between items-center mb-3">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm">{detail.traceId}</span>
                <Badge variant={detail.status === "SUCCESS" ? "default" : "destructive"}>{detail.status}</Badge>
                <span className="text-xs text-muted-foreground">{new Date(detail.createdAt).toLocaleString()}</span>
              </div>
              <Button variant="ghost" size="icon" onClick={() => { setSelectedTrace(null); setDetail(null); }}><X className="h-4 w-4" /></Button>
            </div>
            <div className="grid grid-cols-4 gap-3 mb-3 text-sm">
              <div><span className="text-muted-foreground">Model:</span> {detail.modelName}</div>
              <div><span className="text-muted-foreground">Tokens:</span> {detail.totalTokens ?? "—"}</div>
              <div><span className="text-muted-foreground">Cost:</span> {detail.sellPrice != null ? formatCurrency(detail.sellPrice) : "—"}</div>
              <div><span className="text-muted-foreground">Latency:</span> {detail.latencyMs}ms (TTFT: {detail.ttftMs ?? "—"}ms)</div>
            </div>
            {detail.requestParams && (
              <div className="mb-2">
                <p className="text-xs font-medium text-muted-foreground uppercase mb-1">Parameters</p>
                <pre className="bg-muted rounded-md p-3 text-xs font-mono whitespace-pre-wrap max-h-[120px] overflow-y-auto">{JSON.stringify(detail.requestParams, null, 2)}</pre>
              </div>
            )}
            {detail.promptSnapshot?.map((m, i) => (
              <div key={i} className="mb-2">
                <p className="text-xs font-medium text-muted-foreground uppercase mb-1">{m.role}</p>
                <pre className="bg-muted rounded-md p-3 text-xs font-mono whitespace-pre-wrap max-h-[120px] overflow-y-auto">{m.content}</pre>
              </div>
            ))}
            {detail.responseContent && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase mb-1">Response</p>
                <pre className={`rounded-md p-3 text-xs font-mono whitespace-pre-wrap max-h-[120px] overflow-y-auto ${detail.status === "ERROR" ? "bg-destructive/10" : "bg-muted"}`}>{detail.responseContent}</pre>
              </div>
            )}
            {detail.errorMessage && (
              <div className="mt-2">
                <p className="text-xs font-medium text-destructive uppercase mb-1">Error</p>
                <pre className="bg-destructive/10 rounded-md p-3 text-xs font-mono">{detail.errorMessage}</pre>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead className="w-[60px]">Time</TableHead><TableHead className="w-[100px]">Trace</TableHead>
            <TableHead className="w-[120px]">Model</TableHead><TableHead>Prompt</TableHead>
            <TableHead className="w-[70px]">Status</TableHead><TableHead className="w-[70px]">Tokens</TableHead>
            <TableHead className="w-[60px]">Cost</TableHead><TableHead className="w-[60px]">Latency</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {logs.map((l) => (
              <TableRow key={l.traceId} className="cursor-pointer" onClick={() => loadDetail(l.traceId)}>
                <TableCell className="text-xs text-muted-foreground" title={l.createdAt}>{timeAgo(l.createdAt)}</TableCell>
                <TableCell className="font-mono text-xs text-primary">{l.traceId.slice(0, 12)}</TableCell>
                <TableCell className="font-medium text-xs">{l.modelName}</TableCell>
                <TableCell className="text-xs text-muted-foreground truncate max-w-[200px]" title={l.promptPreview}>{l.promptPreview || "—"}</TableCell>
                <TableCell><Badge variant={l.status === "SUCCESS" ? "default" : "destructive"}>{l.status}</Badge></TableCell>
                <TableCell className="font-mono text-xs">{l.totalTokens ?? "--"}</TableCell>
                <TableCell className="font-mono text-xs">{l.sellPrice != null ? formatCurrency(l.sellPrice) : "—"}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{l.latencyMs ?? "—"}ms</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>

      <div className="flex justify-between items-center mt-4">
        <span className="text-sm text-muted-foreground">{total} records</span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</Button>
          <Button size="sm" variant="outline" onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      </div>
    </div>
  );
}
