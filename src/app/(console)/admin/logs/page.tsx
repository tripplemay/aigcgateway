"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency, timeAgo } from "@/lib/utils";

interface LogEntry {
  traceId: string;
  projectName: string;
  modelName: string;
  channelId: string;
  channelProvider: string;
  channelRealModelId: string;
  status: string;
  promptTokens: number | null;
  completionTokens: number | null;
  costPrice: number | null;
  sellPrice: number | null;
  latencyMs: number | null;
  createdAt: string;
}

const statusVariant: Record<string, "default" | "destructive" | "secondary" | "outline"> = {
  SUCCESS: "default",
  ERROR: "destructive",
  TIMEOUT: "destructive",
  FILTERED: "outline",
};

export default function AdminLogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState("");
  const [searchQ, setSearchQ] = useState("");

  const load = async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (statusFilter) params.set("status", statusFilter);

    const url = searchQ
      ? `/api/admin/logs/search?q=${encodeURIComponent(searchQ)}&page=${page}`
      : `/api/admin/logs?${params}`;

    const r = await apiFetch<{ data: LogEntry[]; pagination?: { total: number } }>(url);
    setLogs(r.data);
    setTotal(r.pagination?.total ?? r.data.length);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [page, statusFilter]);

  const doSearch = () => {
    setPage(1);
    load();
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Global Audit Logs</h1>
      <div className="flex gap-2 mb-4">
        <Input
          className="max-w-sm"
          placeholder="Search prompts, models, trace IDs..."
          value={searchQ}
          onChange={(e) => setSearchQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && doSearch()}
        />
        <Button variant="outline" onClick={doSearch}>
          Search
        </Button>
        <div className="flex gap-1 ml-auto">
          {["", "SUCCESS", "ERROR", "FILTERED"].map((s) => (
            <Button
              key={s}
              size="sm"
              variant={statusFilter === s ? "default" : "outline"}
              onClick={() => {
                setStatusFilter(s);
                setPage(1);
              }}
            >
              {s || "All"}
            </Button>
          ))}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Trace</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Model</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Tokens</TableHead>
                <TableHead>Cost</TableHead>
                <TableHead>Sell</TableHead>
                <TableHead>Latency</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((l) => (
                  <TableRow key={l.traceId}>
                    <TableCell className="text-xs text-muted-foreground" title={l.createdAt}>
                      {timeAgo(l.createdAt)}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-primary">
                      {l.traceId.slice(0, 12)}
                    </TableCell>
                    <TableCell>{l.projectName}</TableCell>
                    <TableCell className="font-medium text-xs">{l.modelName}</TableCell>
                    <TableCell className="text-xs" title={l.channelId}>
                      {l.channelProvider}/{l.channelRealModelId}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant[l.status] ?? "secondary"}>{l.status}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {l.promptTokens ?? "—"}/{l.completionTokens ?? "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {l.costPrice != null ? formatCurrency(l.costPrice) : "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {l.sellPrice != null ? formatCurrency(l.sellPrice) : "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {l.latencyMs ?? "—"}ms
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex justify-between items-center mt-4">
        <span className="text-sm text-muted-foreground">{total} records</span>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            Prev
          </Button>
          <Button size="sm" variant="outline" onClick={() => setPage(page + 1)}>
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
