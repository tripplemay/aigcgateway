"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { formatContext } from "@/lib/utils";

interface Model { id: string; name: string; displayName: string; modality: string; contextWindow: number | null; channelCount: number; }

export default function ModelsPage() {
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState<Record<string, unknown>>({});
  const { toast } = useToast();

  const load = async () => { setLoading(true); const r = await apiFetch<{ data: Model[] }>("/api/admin/models"); setModels(r.data); setLoading(false); };
  useEffect(() => { load(); }, []);

  const save = async () => {
    try {
      if (form.id) {
        await apiFetch(`/api/admin/models/${form.id}`, { method: "PATCH", body: JSON.stringify(form) });
      } else {
        await apiFetch("/api/admin/models", { method: "POST", body: JSON.stringify(form) });
      }
      toast("Saved"); setEditOpen(false); load();
    } catch (e) { toast((e as Error).message, "error"); }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Models</h1>
        <Button onClick={() => { setForm({}); setEditOpen(true); }}>+ Add Model</Button>
      </div>
      <Card><CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Name</th>
              <th className="px-4 py-3 text-left font-medium">Display Name</th>
              <th className="px-4 py-3 text-left font-medium">Modality</th>
              <th className="px-4 py-3 text-left font-medium">Context</th>
              <th className="px-4 py-3 text-left font-medium">Channels</th>
              <th className="px-4 py-3 text-left font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Loading...</td></tr> :
            models.map((m) => (
              <tr key={m.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-sm">{m.name}</td>
                <td className="px-4 py-3">{m.displayName}</td>
                <td className="px-4 py-3"><Badge variant={m.modality === "TEXT" ? "info" : "pink"}>{m.modality}</Badge></td>
                <td className="px-4 py-3">{m.contextWindow ? formatContext(m.contextWindow) : "—"}</td>
                <td className="px-4 py-3">{m.channelCount}</td>
                <td className="px-4 py-3"><Button variant="ghost" size="sm" onClick={() => { setForm(m); setEditOpen(true); }}>Edit</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent></Card>

      <Dialog open={editOpen} onClose={() => setEditOpen(false)}>
        <DialogTitle>{form.id ? "Edit Model" : "Add Model"}</DialogTitle>
        <div className="space-y-3">
          <Input placeholder="Name (e.g. openai/gpt-4o)" value={(form.name as string) ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input placeholder="Display Name" value={(form.displayName as string) ?? ""} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
          <select className="w-full h-9 rounded-md border px-3 text-sm" value={(form.modality as string) ?? "TEXT"} onChange={(e) => setForm({ ...form, modality: e.target.value })}>
            <option value="TEXT">Text</option><option value="IMAGE">Image</option>
          </select>
          <Input type="number" placeholder="Context Window" value={(form.contextWindow as number) ?? ""} onChange={(e) => setForm({ ...form, contextWindow: Number(e.target.value) || null })} />
          <Input type="number" placeholder="Max Tokens" value={(form.maxTokens as number) ?? ""} onChange={(e) => setForm({ ...form, maxTokens: Number(e.target.value) || null })} />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={save}>Save</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
