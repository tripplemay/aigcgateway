"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useProject } from "@/hooks/use-project";
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
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";

interface LogEntry {
  traceId: string;
  modelName: string;
  status: string;
  finishReason: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  sellPrice: number | null;
  latencyMs: number | null;
  ttftMs: number | null;
  tokensPerSecond: number | null;
  createdAt: string;
  promptPreview?: string;
  promptSnapshot?: Array<{ role: string; content: string }>;
  requestParams?: Record<string, unknown>;
  responseContent?: string | null;
  errorMessage?: string | null;
}

export default function LogsPage() {
  const t = useTranslations("logs");
  const tc = useTranslations("common");
  const { current, loading: projLoading } = useProject();
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
    setLogs(r.data);
    setTotal(r.pagination?.total ?? r.data.length);
  }, [current, page, statusFilter, debouncedQ, startDate, endDate]);

  useEffect(() => {
    load();
  }, [load]);

  const loadDetail = async (traceId: string) => {
    if (!current) return;
    if (selectedTrace === traceId) {
      setSelectedTrace(null);
      setDetail(null);
      return;
    }
    const r = await apiFetch<LogEntry>(`/api/projects/${current.id}/logs/${traceId}`);
    setDetail(r);
    setSelectedTrace(traceId);
  };

  if (projLoading)
    return (
      <div className="space-y-4 pt-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  if (!current) return <EmptyState onCreated={() => window.location.reload()} />;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">{t("title")}</h1>
      <div className="flex gap-2 mb-4 flex-wrap">
        <Input
          className="max-w-sm"
          placeholder={t("searchPlaceholder")}
          value={searchQ}
          onChange={(e) => {
            setSearchQ(e.target.value);
            setPage(1);
          }}
        />
        <Input
          type="date"
          className="w-36"
          value={startDate}
          onChange={(e) => {
            setStartDate(e.target.value);
            setPage(1);
          }}
        />
        <Input
          type="date"
          className="w-36"
          value={endDate}
          onChange={(e) => {
            setEndDate(e.target.value);
            setPage(1);
          }}
        />
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
              {s || tc("all")}
            </Button>
          ))}
        </div>
      </div>

      {/* Detail panel — 原型: .detail-panel */}
      {detail && (
        <div className="bg-white border border-border-custom rounded-xl p-5 mb-[14px]">
          {/* Head: trace + status + time + close */}
          <div className="flex justify-between items-center mb-[14px]">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[13px] text-chart-blue">{detail.traceId}</span>
              <Badge
                variant={
                  detail.status === "SUCCESS"
                    ? "success"
                    : detail.status === "FILTERED"
                      ? "warning"
                      : "error"
                }
              >
                {detail.status.toLowerCase()}
              </Badge>
              <span className="text-xs text-text-tertiary">
                {new Date(detail.createdAt).toLocaleString()}
              </span>
            </div>
            <button
              className="text-text-tertiary hover:text-text-primary text-lg px-1.5 py-0.5"
              onClick={() => {
                setSelectedTrace(null);
                setDetail(null);
              }}
            >
              &times;
            </button>
          </div>

          {/* Metrics: 4-col grid */}
          <div className="grid grid-cols-4 gap-2 mb-[14px]">
            <div className="bg-surface rounded-[6px] px-3 py-2">
              <div className="text-[11px] text-text-tertiary">{t("model")}</div>
              <div className="text-[13px] font-medium text-text-primary mt-0.5">
                {detail.modelName}
              </div>
            </div>
            <div className="bg-surface rounded-[6px] px-3 py-2">
              <div className="text-[11px] text-text-tertiary">{t("tokens")}</div>
              <div className="text-[13px] font-medium text-text-primary mt-0.5">
                {detail.totalTokens ? detail.totalTokens.toLocaleString() : "—"}
              </div>
            </div>
            <div className="bg-surface rounded-[6px] px-3 py-2">
              <div className="text-[11px] text-text-tertiary">{t("cost")}</div>
              <div className="text-[13px] font-medium text-text-primary mt-0.5">
                {detail.sellPrice != null ? `$${detail.sellPrice.toFixed(4)}` : "—"}
              </div>
            </div>
            <div className="bg-surface rounded-[6px] px-3 py-2">
              <div className="text-[11px] text-text-tertiary">{t("latency")}</div>
              <div className="text-[13px] font-medium text-text-primary mt-0.5">
                {detail.latencyMs != null ? `${(detail.latencyMs / 1000).toFixed(1)}s` : "—"}
                {detail.ttftMs != null ? ` (TTFT ${(detail.ttftMs / 1000).toFixed(2)}s)` : ""}
              </div>
            </div>
          </div>

          {/* Params + Throughput: 2-col grid */}
          <div className="grid grid-cols-2 gap-2 mb-[14px]">
            {detail.requestParams && (
              <div className="bg-surface rounded-[6px] px-3 py-2">
                <div className="text-[11px] text-text-tertiary">{t("parameters")}</div>
                <div className="text-[13px] font-medium font-mono text-text-primary mt-0.5">
                  {JSON.stringify(detail.requestParams)}
                </div>
              </div>
            )}
            <div className="bg-surface rounded-[6px] px-3 py-2">
              <div className="text-[11px] text-text-tertiary">{t("throughput")}</div>
              <div className="text-[13px] font-medium font-mono text-text-primary mt-0.5">
                {detail.tokensPerSecond ? `${detail.tokensPerSecond} tok/s` : "—"}
              </div>
            </div>
          </div>

          {/* Prompt sections */}
          {detail.promptSnapshot?.map((m, i) => (
            <div key={i}>
              <div className="text-xs font-medium text-text-tertiary mb-1 mt-[14px]">
                {m.role === "system"
                  ? t("systemPrompt")
                  : m.role === "user"
                    ? t("userMessage")
                    : m.role}
              </div>
              <pre className="bg-surface rounded-[6px] px-[14px] py-[10px] font-mono text-xs leading-relaxed text-text-primary whitespace-pre-wrap max-h-[120px] overflow-y-auto">
                {m.content}
              </pre>
            </div>
          ))}

          {/* Response */}
          {detail.responseContent && (
            <div>
              <div className="text-xs font-medium text-text-tertiary mb-1 mt-[14px]">
                {t("response")}
              </div>
              <pre
                className={`rounded-[6px] px-[14px] py-[10px] font-mono text-xs leading-relaxed whitespace-pre-wrap max-h-[120px] overflow-y-auto ${detail.status === "ERROR" ? "bg-error-bg-light text-error-text" : "bg-surface text-text-primary"}`}
              >
                {detail.responseContent}
              </pre>
            </div>
          )}

          {/* Error message */}
          {detail.errorMessage && (
            <div>
              <div className="text-xs font-medium text-error-text mb-1 mt-[14px]">{t("error")}</div>
              <pre className="bg-error-bg-light text-error-text rounded-[6px] px-[14px] py-[10px] font-mono text-xs leading-relaxed whitespace-pre-wrap">
                {detail.errorMessage}
              </pre>
            </div>
          )}
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[60px]">{t("time")}</TableHead>
                <TableHead className="w-[100px]">{t("trace")}</TableHead>
                <TableHead className="w-[120px]">{t("model")}</TableHead>
                <TableHead>{t("prompt")}</TableHead>
                <TableHead className="w-[70px]">{tc("status")}</TableHead>
                <TableHead className="w-[70px]">{t("tokens")}</TableHead>
                <TableHead className="w-[60px]">{t("cost")}</TableHead>
                <TableHead className="w-[60px]">{t("latency")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((l) => (
                <TableRow
                  key={l.traceId}
                  className="cursor-pointer"
                  onClick={() => loadDetail(l.traceId)}
                >
                  <TableCell
                    className="font-mono text-[11px] text-text-tertiary whitespace-nowrap"
                    title={l.createdAt}
                  >
                    {timeAgo(l.createdAt)}
                  </TableCell>
                  <TableCell className="font-mono text-[11px] text-chart-blue">
                    {l.traceId.slice(0, 12)}
                  </TableCell>
                  <TableCell className="font-medium text-xs text-text-primary">
                    {l.modelName}
                  </TableCell>
                  <TableCell
                    className="text-xs text-text-secondary truncate max-w-[180px]"
                    title={l.promptPreview}
                  >
                    {l.promptPreview || "—"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        l.status === "SUCCESS"
                          ? "success"
                          : l.status === "FILTERED"
                            ? "warning"
                            : "error"
                      }
                    >
                      {l.status.toLowerCase()}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-[11px]">
                    {l.totalTokens ? l.totalTokens.toLocaleString() : "--"}
                  </TableCell>
                  <TableCell className="font-mono text-[11px]">
                    {l.sellPrice != null ? `$${l.sellPrice.toFixed(3)}` : "—"}
                  </TableCell>
                  <TableCell className="font-mono text-[11px] text-text-tertiary">
                    {l.latencyMs != null ? `${(l.latencyMs / 1000).toFixed(1)}s` : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex justify-between items-center mt-4">
        <span className="text-sm text-muted-foreground">
          {total} {tc("records")}
        </span>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            {tc("prev")}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setPage(page + 1)}>
            {tc("next")}
          </Button>
        </div>
      </div>
    </div>
  );
}
