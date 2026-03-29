"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { timeAgo } from "@/lib/utils";

interface HealthChannel {
  channelId: string; provider: string; model: string; status: string;
  priority: number; modality: string;
  lastChecks: Array<{ level: string; result: string; latencyMs: number | null; createdAt: string }>;
}
interface Summary { active: number; degraded: number; disabled: number; total: number }

const statusLamp = { ACTIVE: "bg-green-500", DEGRADED: "bg-yellow-500", DISABLED: "bg-red-500" };

export default function HealthPage() {
  const [channels, setChannels] = useState<HealthChannel[]>([]);
  const [summary, setSummary] = useState<Summary>({ active: 0, degraded: 0, disabled: 0, total: 0 });
  const [checking, setChecking] = useState<string | null>(null);
  const [checkResult, setCheckResult] = useState<Record<string, unknown> | null>(null);
  const { toast } = useToast();

  const load = async () => {
    const r = await apiFetch<{ summary: Summary; data: HealthChannel[] }>("/api/admin/health");
    setSummary(r.summary); setChannels(r.data);
  };
  useEffect(() => { load(); }, []);

  const runCheck = async (channelId: string) => {
    setChecking(channelId);
    try {
      const r = await apiFetch<Record<string, unknown>>(`/api/admin/health/${channelId}/check`, { method: "POST" });
      setCheckResult(r); toast("Check completed"); load();
    } catch (e) { toast((e as Error).message, "error"); }
    setChecking(null);
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Health Monitor</h1>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-gray-500">Active</CardTitle></CardHeader>
          <CardContent><span className="text-3xl font-bold text-green-600">{summary.active}</span></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-gray-500">Degraded</CardTitle></CardHeader>
          <CardContent><span className="text-3xl font-bold text-yellow-600">{summary.degraded}</span></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-gray-500">Disabled</CardTitle></CardHeader>
          <CardContent><span className="text-3xl font-bold text-red-600">{summary.disabled}</span></CardContent></Card>
      </div>

      <div className="grid gap-3">
        {channels.map((ch) => (
          <Card key={ch.channelId}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${statusLamp[ch.status as keyof typeof statusLamp] ?? "bg-gray-400"}`} />
                  <div>
                    <div className="font-medium">{ch.model} <span className="text-gray-400">via</span> {ch.provider}</div>
                    <div className="text-xs text-gray-500">Priority: {ch.priority} | {ch.modality}</div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-xs text-gray-500">
                    {ch.lastChecks.length > 0 && (
                      <>
                        {timeAgo(ch.lastChecks[0].createdAt)} | {ch.lastChecks[0].latencyMs}ms
                      </>
                    )}
                  </div>
                  <div className="flex gap-1">
                    {["CONNECTIVITY", "FORMAT", "QUALITY"].map((level, i) => {
                      const check = ch.lastChecks.find((c) => c.level === level);
                      return (
                        <span key={level} className="text-xs" title={level}>
                          L{i + 1}:{check?.result === "PASS" ? <span className="text-green-600">&#10003;</span> : check?.result === "FAIL" ? <span className="text-red-600">&#10007;</span> : <span className="text-gray-400">?</span>}
                        </span>
                      );
                    })}
                  </div>
                  <Button size="sm" variant="outline" disabled={checking === ch.channelId} onClick={() => runCheck(ch.channelId)}>
                    {checking === ch.channelId ? "Checking..." : "Check"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
