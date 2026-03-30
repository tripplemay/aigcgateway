"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { formatContext } from "@/lib/utils";

interface Model {
  id: string;
  name: string;
  displayName: string;
  modality: string;
  contextWindow: number | null;
  channelCount: number;
}

export default function ModelsPage() {
  const t = useTranslations("adminModels");
  const tc = useTranslations("common");
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [editId, setEditId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const r = await apiFetch<{ data: Model[] }>("/api/admin/models");
    setModels(r.data);
    setLoading(false);
  };
  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    try {
      if (editId) {
        await apiFetch(`/api/admin/models/${editId}`, {
          method: "PATCH",
          body: JSON.stringify(form),
        });
      } else {
        await apiFetch("/api/admin/models", { method: "POST", body: JSON.stringify(form) });
      }
      toast.success(tc("saved"));
      setDialogOpen(false);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <Button
          onClick={() => {
            setForm({});
            setEditId(null);
            setDialogOpen(true);
          }}
        >
          {t("addModel")}
        </Button>
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{tc("name")}</TableHead>
                <TableHead>{t("displayName")}</TableHead>
                <TableHead>{t("modality")}</TableHead>
                <TableHead>Context</TableHead>
                <TableHead>Channels</TableHead>
                <TableHead>{tc("actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    {tc("loading")}
                  </TableCell>
                </TableRow>
              ) : (
                models.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-mono text-sm">{m.name}</TableCell>
                    <TableCell>{m.displayName}</TableCell>
                    <TableCell>
                      <Badge variant={m.modality === "TEXT" ? "info" : "image"}>
                        {m.modality.toLowerCase()}
                      </Badge>
                    </TableCell>
                    <TableCell>{m.contextWindow ? formatContext(m.contextWindow) : "—"}</TableCell>
                    <TableCell>{m.channelCount}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setForm({ ...m } as Record<string, unknown>);
                          setEditId(m.id);
                          setDialogOpen(true);
                        }}
                      >
                        {tc("edit")}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editId ? t("editModel") : t("addModelTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{tc("name")}</Label>
              <Input
                placeholder="openai/gpt-4o"
                value={(form.name as string) ?? ""}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <Label>{t("displayName")}</Label>
              <Input
                value={(form.displayName as string) ?? ""}
                onChange={(e) => setForm({ ...form, displayName: e.target.value })}
              />
            </div>
            <div>
              <Label>{t("modality")}</Label>
              <Select
                value={(form.modality as string) ?? "TEXT"}
                onValueChange={(v) => setForm({ ...form, modality: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TEXT">{t("text")}</SelectItem>
                  <SelectItem value="IMAGE">{t("image")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("contextWindow")}</Label>
              <Input
                type="number"
                value={(form.contextWindow as number) ?? ""}
                onChange={(e) =>
                  setForm({ ...form, contextWindow: Number(e.target.value) || null })
                }
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                {tc("cancel")}
              </Button>
              <Button onClick={save}>{tc("save")}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
