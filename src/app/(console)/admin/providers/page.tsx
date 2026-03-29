"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

interface Provider {
  id: string;
  name: string;
  displayName: string;
  baseUrl: string;
  adapterType: string;
  status: string;
  channelCount: number;
}

export default function ProvidersPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [editProvider, setEditProvider] = useState<Partial<Provider> & { apiKey?: string }>({});
  const { toast } = useToast();

  const load = async () => {
    setLoading(true);
    const res = await apiFetch<{ data: Provider[] }>("/api/admin/providers");
    setProviders(res.data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    try {
      if (editProvider.id) {
        await apiFetch(`/api/admin/providers/${editProvider.id}`, {
          method: "PATCH",
          body: JSON.stringify(editProvider),
        });
      } else {
        await apiFetch("/api/admin/providers", {
          method: "POST",
          body: JSON.stringify(editProvider),
        });
      }
      toast("Saved");
      setEditOpen(false);
      load();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  const toggleStatus = async (p: Provider) => {
    const newStatus = p.status === "ACTIVE" ? "DISABLED" : "ACTIVE";
    await apiFetch(`/api/admin/providers/${p.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: newStatus }),
    });
    load();
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Providers</h1>
        <Button onClick={() => { setEditProvider({}); setEditOpen(true); }}>+ Add Provider</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Name</th>
                <th className="px-4 py-3 text-left font-medium">Base URL</th>
                <th className="px-4 py-3 text-left font-medium">Adapter</th>
                <th className="px-4 py-3 text-left font-medium">Channels</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Loading...</td></tr>
              ) : providers.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{p.displayName}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs font-mono">{p.baseUrl}</td>
                  <td className="px-4 py-3"><Badge>{p.adapterType}</Badge></td>
                  <td className="px-4 py-3">{p.channelCount}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => toggleStatus(p)} className="cursor-pointer">
                      <Badge variant={p.status === "ACTIVE" ? "success" : "danger"}>{p.status}</Badge>
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <Button variant="ghost" size="sm" onClick={() => { setEditProvider(p); setEditOpen(true); }}>
                      Edit
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={editOpen} onClose={() => setEditOpen(false)}>
        <DialogTitle>{editProvider.id ? "Edit Provider" : "Add Provider"}</DialogTitle>
        <div className="space-y-3">
          <Input placeholder="Name (e.g. openai)" value={editProvider.name ?? ""} onChange={(e) => setEditProvider({ ...editProvider, name: e.target.value })} />
          <Input placeholder="Display Name" value={editProvider.displayName ?? ""} onChange={(e) => setEditProvider({ ...editProvider, displayName: e.target.value })} />
          <Input placeholder="Base URL" value={editProvider.baseUrl ?? ""} onChange={(e) => setEditProvider({ ...editProvider, baseUrl: e.target.value })} />
          <Input placeholder="API Key" type="password" value={editProvider.apiKey ?? ""} onChange={(e) => setEditProvider({ ...editProvider, apiKey: e.target.value })} />
          <select className="w-full h-9 rounded-md border px-3 text-sm" value={editProvider.adapterType ?? "openai-compat"} onChange={(e) => setEditProvider({ ...editProvider, adapterType: e.target.value })}>
            <option value="openai-compat">openai-compat</option>
            <option value="volcengine">volcengine</option>
            <option value="siliconflow">siliconflow</option>
          </select>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={save}>Save</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
