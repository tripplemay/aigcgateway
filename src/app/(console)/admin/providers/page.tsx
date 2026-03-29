"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

interface Provider {
  id: string; name: string; displayName: string; baseUrl: string;
  adapterType: string; status: string; channelCount: number;
}

export default function ProvidersPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [editId, setEditId] = useState<string | null>(null);

  const load = async () => { setLoading(true); const res = await apiFetch<{ data: Provider[] }>("/api/admin/providers"); setProviders(res.data); setLoading(false); };
  useEffect(() => { load(); }, []);

  const openCreate = () => { setForm({}); setEditId(null); setDialogOpen(true); };
  const openEdit = (p: Provider) => { setForm({ name: p.name, displayName: p.displayName, baseUrl: p.baseUrl, adapterType: p.adapterType }); setEditId(p.id); setDialogOpen(true); };

  const save = async () => {
    try {
      if (editId) { await apiFetch(`/api/admin/providers/${editId}`, { method: "PATCH", body: JSON.stringify(form) }); }
      else { await apiFetch("/api/admin/providers", { method: "POST", body: JSON.stringify(form) }); }
      toast.success("Saved"); setDialogOpen(false); load();
    } catch (e) { toast.error((e as Error).message); }
  };

  const toggleStatus = async (p: Provider) => {
    const s = p.status === "ACTIVE" ? "DISABLED" : "ACTIVE";
    await apiFetch(`/api/admin/providers/${p.id}`, { method: "PATCH", body: JSON.stringify({ status: s }) });
    toast.success(`${p.displayName} → ${s}`); load();
  };

  const set = (k: string, v: string) => setForm((prev) => ({ ...prev, [k]: v }));

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Providers</h1>
        <Button onClick={openCreate}>+ Add Provider</Button>
      </div>
      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Name</TableHead><TableHead>Base URL</TableHead><TableHead>Adapter</TableHead>
            <TableHead>Channels</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {loading ? <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow> :
            providers.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.displayName}</TableCell>
                <TableCell className="text-xs font-mono text-muted-foreground">{p.baseUrl}</TableCell>
                <TableCell><Badge variant="secondary">{p.adapterType}</Badge></TableCell>
                <TableCell>{p.channelCount}</TableCell>
                <TableCell><button onClick={() => toggleStatus(p)}><Badge variant={p.status === "ACTIVE" ? "default" : "destructive"}>{p.status}</Badge></button></TableCell>
                <TableCell><Button variant="ghost" size="sm" onClick={() => openEdit(p)}>Edit</Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editId ? "Edit Provider" : "Add Provider"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Name</Label><Input placeholder="e.g. openai" value={form.name ?? ""} onChange={(e) => set("name", e.target.value)} /></div>
            <div><Label>Display Name</Label><Input value={form.displayName ?? ""} onChange={(e) => set("displayName", e.target.value)} /></div>
            <div><Label>Base URL</Label><Input value={form.baseUrl ?? ""} onChange={(e) => set("baseUrl", e.target.value)} /></div>
            <div><Label>API Key</Label><Input type="password" value={form.apiKey ?? ""} onChange={(e) => set("apiKey", e.target.value)} /></div>
            <div><Label>Adapter</Label>
              <Select value={form.adapterType ?? "openai-compat"} onValueChange={(v) => { if (v) set("adapterType", v); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="openai-compat">openai-compat</SelectItem><SelectItem value="volcengine">volcengine</SelectItem><SelectItem value="siliconflow">siliconflow</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button><Button onClick={save}>Save</Button></div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
