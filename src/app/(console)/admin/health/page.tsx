"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { timeAgo } from "@/lib/utils";

interface HealthChannel {
  channelId: string; provider: string; model: string; status: string;
  priority: number; modality: string;
  lastChecks: Array<{ level: string; result: string; latencyMs: number | null; createdAt: string }>;
}
interface Summary { active: number; degraded: number; disabled: number; total: number }

const statusColor: Record<string, string> = { ACTIVE: "bg-green-500", DEGRADED: "bg-yellow-500", DISABLED: "bg-red-500" };

export default function HealthPage() {
  const [channels, setChannels] = useState<HealthChannel[]>([]);
  const [summary, setSummary] = useState<Summary>({ active: 0, degraded: 0, disabled: 0, total: 0 });
  const [checking, setChecking] = useState<string | null>(null);

  const load = async () => {
    const r = await apiFetch<{ summary: Summary; data: HealthChannel[] }>("/api/admin/health");
    setSummary(r.summary); setChannels(r.data);
  };
  useEffect(() => { load(); }, []);

  const runCheck = async (channelId: string) => {
    setChecking(channelId);
    try {
      await apiFetch(`/api/admin/health/${channelId}/check`, { method: "POST" });
      toast.success("Check completed"); load();
    } catch (e) { toast.error((e as Error).message); }
    setChecking(null);
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Health Monitor</h1>
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: "Active", value: summary.active, color: "text-green-600" },
          { label: "Degraded", value: summary.degraded, color: "text-yellow-600" },
          { label: "Disabled", value: summary.disabled, color: "text-red-600" },
        ].map((c) => (
          <Card key={c.label}><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{c.label}</CardTitle></CardHeader>
            <CardContent><span className={`text-3xl font-bold ${c.color}`}>{c.value}</span></CardContent></Card>
        ))}
      </div>

      <div className="grid gap-3">
        {channels.map((ch) => (
          <Card key={ch.channelId}>
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${statusColor[ch.status] ?? "bg-gray-400"}`} />
                <div>
                  <div className="font-medium">{ch.model} <span className="text-muted-foreground">via</span> {ch.provider}</div>
                  <div className="text-xs text-muted-foreground">Priority: {ch.priority} | {ch.modality}</div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-xs text-muted-foreground">
                  {ch.lastChecks[0] && <>{timeAgo(ch.lastChecks[0].createdAt)} | {ch.lastChecks[0].latencyMs}ms</>}
                </div>
                <div className="flex gap-1 text-xs">
                  {["CONNECTIVITY", "FORMAT", "QUALITY"].map((level, i) => {
                    const c = ch.lastChecks.find((x) => x.level === level);
                    return <span key={level}>L{i + 1}:{c?.result === "PASS" ? <span className="text-green-600">&#10003;</span> : c?.result === "FAIL" ? <span className="text-red-600">&#10007;</span> : "?"}</span>;
                  })}
                </div>
                <Button size="sm" variant="outline" disabled={checking === ch.channelId} onClick={() => runCheck(ch.channelId)}>
                  {checking === ch.channelId ? "..." : "Check"}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
