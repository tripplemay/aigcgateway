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
import { formatContext } from "@/lib/utils";

interface Model { id: string; name: string; displayName: string; modality: string; contextWindow: number | null; channelCount: number }

export default function ModelsPage() {
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [editId, setEditId] = useState<string | null>(null);

  const load = async () => { setLoading(true); const r = await apiFetch<{ data: Model[] }>("/api/admin/models"); setModels(r.data); setLoading(false); };
  useEffect(() => { load(); }, []);

  const save = async () => {
    try {
      if (editId) { await apiFetch(`/api/admin/models/${editId}`, { method: "PATCH", body: JSON.stringify(form) }); }
      else { await apiFetch("/api/admin/models", { method: "POST", body: JSON.stringify(form) }); }
      toast.success("Saved"); setDialogOpen(false); load();
    } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Models</h1>
        <Button onClick={() => { setForm({}); setEditId(null); setDialogOpen(true); }}>+ Add Model</Button>
      </div>
      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Name</TableHead><TableHead>Display Name</TableHead><TableHead>Modality</TableHead>
            <TableHead>Context</TableHead><TableHead>Channels</TableHead><TableHead>Actions</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {loading ? <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow> :
            models.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="font-mono text-sm">{m.name}</TableCell>
                <TableCell>{m.displayName}</TableCell>
                <TableCell><Badge variant={m.modality === "TEXT" ? "secondary" : "outline"}>{m.modality}</Badge></TableCell>
                <TableCell>{m.contextWindow ? formatContext(m.contextWindow) : "—"}</TableCell>
                <TableCell>{m.channelCount}</TableCell>
                <TableCell><Button variant="ghost" size="sm" onClick={() => { setForm({ ...m } as Record<string, unknown>); setEditId(m.id); setDialogOpen(true); }}>Edit</Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editId ? "Edit Model" : "Add Model"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Name</Label><Input placeholder="openai/gpt-4o" value={(form.name as string) ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>Display Name</Label><Input value={(form.displayName as string) ?? ""} onChange={(e) => setForm({ ...form, displayName: e.target.value })} /></div>
            <div><Label>Modality</Label>
              <Select value={(form.modality as string) ?? "TEXT"} onValueChange={(v) => setForm({ ...form, modality: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="TEXT">Text</SelectItem><SelectItem value="IMAGE">Image</SelectItem></SelectContent>
              </Select>
            </div>
            <div><Label>Context Window</Label><Input type="number" value={(form.contextWindow as number) ?? ""} onChange={(e) => setForm({ ...form, contextWindow: Number(e.target.value) || null })} /></div>
            <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button><Button onClick={save}>Save</Button></div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
