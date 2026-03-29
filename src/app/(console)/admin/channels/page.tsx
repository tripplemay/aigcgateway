"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";

interface Channel {
  id: string; providerName: string; modelName: string; realModelId: string;
  priority: number; costPrice: Record<string, unknown>; sellPrice: Record<string, unknown>;
  status: string; lastHealthResult: string | null;
}

const statusColors = { ACTIVE: "success", DEGRADED: "warning", DISABLED: "danger" } as const;

export default function ChannelsPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPriority, setEditingPriority] = useState<string | null>(null);
  const [priorityValue, setPriorityValue] = useState("");
  const { toast } = useToast();

  const load = async () => { setLoading(true); const r = await apiFetch<{ data: Channel[] }>("/api/admin/channels"); setChannels(r.data); setLoading(false); };
  useEffect(() => { load(); }, []);

  const updatePriority = async (id: string) => {
    const p = Number(priorityValue);
    if (p > 0) {
      await apiFetch(`/api/admin/channels/${id}`, { method: "PATCH", body: JSON.stringify({ priority: p }) });
      toast("Priority updated");
      load();
    }
    setEditingPriority(null);
  };

  const toggleStatus = async (ch: Channel) => {
    const next = ch.status === "ACTIVE" ? "DISABLED" : "ACTIVE";
    await apiFetch(`/api/admin/channels/${ch.id}`, { method: "PATCH", body: JSON.stringify({ status: next }) });
    load();
  };

  const deleteChannel = async (id: string) => {
    if (!confirm("Delete this channel?")) return;
    await apiFetch(`/api/admin/channels/${id}`, { method: "DELETE" });
    toast("Deleted"); load();
  };

  const formatPrice = (p: Record<string, unknown>) => {
    if (p.unit === "call") return `$${p.perCall}/call`;
    return `$${p.inputPer1M}/$${p.outputPer1M} /M`;
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Channels</h1>
      </div>
      <Card><CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Model</th>
              <th className="px-4 py-3 text-left font-medium">Provider</th>
              <th className="px-4 py-3 text-left font-medium">Real ID</th>
              <th className="px-4 py-3 text-left font-medium">Priority</th>
              <th className="px-4 py-3 text-left font-medium">Cost</th>
              <th className="px-4 py-3 text-left font-medium">Sell</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-left font-medium">Health</th>
              <th className="px-4 py-3 text-left font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">Loading...</td></tr> :
            channels.map((ch) => (
              <tr key={ch.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-xs">{ch.modelName}</td>
                <td className="px-4 py-3">{ch.providerName}</td>
                <td className="px-4 py-3 text-xs text-gray-500">{ch.realModelId}</td>
                <td className="px-4 py-3">
                  {editingPriority === ch.id ? (
                    <input className="w-12 border rounded px-1 text-center" autoFocus value={priorityValue}
                      onChange={(e) => setPriorityValue(e.target.value)}
                      onBlur={() => updatePriority(ch.id)}
                      onKeyDown={(e) => e.key === "Enter" && updatePriority(ch.id)} />
                  ) : (
                    <button className="text-blue-600 hover:underline" onClick={() => { setEditingPriority(ch.id); setPriorityValue(String(ch.priority)); }}>
                      {ch.priority}
                    </button>
                  )}
                </td>
                <td className="px-4 py-3 text-xs font-mono">{formatPrice(ch.costPrice)}</td>
                <td className="px-4 py-3 text-xs font-mono">{formatPrice(ch.sellPrice)}</td>
                <td className="px-4 py-3">
                  <button onClick={() => toggleStatus(ch)}>
                    <Badge variant={statusColors[ch.status as keyof typeof statusColors] ?? "default"}>{ch.status}</Badge>
                  </button>
                </td>
                <td className="px-4 py-3">
                  {ch.lastHealthResult === "PASS" ? <span className="text-green-600">&#10003;</span>
                   : ch.lastHealthResult === "FAIL" ? <span className="text-red-600">&#10007;</span>
                   : <span className="text-gray-400">?</span>}
                </td>
                <td className="px-4 py-3">
                  <Button variant="ghost" size="sm" className="text-red-600" onClick={() => deleteChannel(ch.id)}>Delete</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent></Card>
    </div>
  );
}
