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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

interface Provider {
  id: string;
  name: string;
  displayName: string;
  baseUrl: string;
  adapterType: string;
  status: string;
  channelCount: number;
}

interface ProviderConfig {
  temperatureMin?: number;
  temperatureMax?: number;
  chatEndpoint?: string;
  imageEndpoint?: string | null;
  imageViaChat?: boolean;
  supportsModelsApi?: boolean;
  supportsSystemRole?: boolean;
  currency?: string;
  quirks?: string[];
}

export default function ProvidersPage() {
  const t = useTranslations("adminProviders");
  const tc = useTranslations("common");
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [editId, setEditId] = useState<string | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [configProviderId, setConfigProviderId] = useState<string | null>(null);
  const [config, setConfig] = useState<ProviderConfig>({});
  const [quirksText, setQuirksText] = useState("");

  const load = async () => {
    setLoading(true);
    const res = await apiFetch<{ data: Provider[] }>("/api/admin/providers");
    setProviders(res.data);
    setLoading(false);
  };
  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setForm({});
    setEditId(null);
    setDialogOpen(true);
  };
  const openEdit = (p: Provider) => {
    setForm({
      name: p.name,
      displayName: p.displayName,
      baseUrl: p.baseUrl,
      adapterType: p.adapterType,
    });
    setEditId(p.id);
    setDialogOpen(true);
  };

  const save = async () => {
    try {
      if (editId) {
        await apiFetch(`/api/admin/providers/${editId}`, {
          method: "PATCH",
          body: JSON.stringify(form),
        });
      } else {
        await apiFetch("/api/admin/providers", { method: "POST", body: JSON.stringify(form) });
      }
      toast.success(tc("saved"));
      setDialogOpen(false);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const toggleStatus = async (p: Provider) => {
    const s = p.status === "ACTIVE" ? "DISABLED" : "ACTIVE";
    await apiFetch(`/api/admin/providers/${p.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: s }),
    });
    toast.success(`${p.displayName} → ${s}`);
    load();
  };

  const set = (k: string, v: string) => setForm((prev) => ({ ...prev, [k]: v }));

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <Button onClick={openCreate}>{t("addProvider")}</Button>
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{tc("name")}</TableHead>
                <TableHead>{t("baseUrl")}</TableHead>
                <TableHead>{t("adapter")}</TableHead>
                <TableHead>Channels</TableHead>
                <TableHead>{tc("status")}</TableHead>
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
                providers.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.displayName}</TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">
                      {p.baseUrl}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{p.adapterType}</Badge>
                    </TableCell>
                    <TableCell>{p.channelCount}</TableCell>
                    <TableCell>
                      <button onClick={() => toggleStatus(p)}>
                        <Badge variant={p.status === "ACTIVE" ? "success" : "error"}>
                          {p.status.toLowerCase()}
                        </Badge>
                      </button>
                    </TableCell>
                    <TableCell className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(p)}>
                        {tc("edit")}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          const r = await apiFetch<{ data: ProviderConfig | null }>(
                            `/api/admin/providers/${p.id}/config`,
                          );
                          setConfig(r.data ?? {});
                          setQuirksText((r.data?.quirks ?? []).join(", "));
                          setConfigProviderId(p.id);
                          setConfigOpen(true);
                        }}
                      >
                        {t("config")}
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
            <DialogTitle>{editId ? t("editProvider") : t("addProviderTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{tc("name")}</Label>
              <Input
                placeholder="e.g. openai"
                value={form.name ?? ""}
                onChange={(e) => set("name", e.target.value)}
              />
            </div>
            <div>
              <Label>{t("displayName")}</Label>
              <Input
                value={form.displayName ?? ""}
                onChange={(e) => set("displayName", e.target.value)}
              />
            </div>
            <div>
              <Label>{t("baseUrl")}</Label>
              <Input value={form.baseUrl ?? ""} onChange={(e) => set("baseUrl", e.target.value)} />
            </div>
            <div>
              <Label>{t("apiKey")}</Label>
              <Input
                type="password"
                value={form.apiKey ?? ""}
                onChange={(e) => set("apiKey", e.target.value)}
              />
            </div>
            <div>
              <Label>{t("adapter")}</Label>
              <Select
                value={form.adapterType ?? "openai-compat"}
                onValueChange={(v) => {
                  if (v) set("adapterType", v);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai-compat">openai-compat</SelectItem>
                  <SelectItem value="volcengine">volcengine</SelectItem>
                  <SelectItem value="siliconflow">siliconflow</SelectItem>
                </SelectContent>
              </Select>
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
      {/* Config Override Dialog */}
      <Dialog open={configOpen} onOpenChange={setConfigOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("configOverride")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t("tempMin")}</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={config.temperatureMin ?? 0}
                  onChange={(e) => setConfig({ ...config, temperatureMin: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>{t("tempMax")}</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={config.temperatureMax ?? 2}
                  onChange={(e) => setConfig({ ...config, temperatureMax: Number(e.target.value) })}
                />
              </div>
            </div>
            <div>
              <Label>{t("chatEndpoint")}</Label>
              <Input
                value={config.chatEndpoint ?? "/chat/completions"}
                onChange={(e) => setConfig({ ...config, chatEndpoint: e.target.value })}
              />
            </div>
            <div>
              <Label>{t("imageEndpoint")}</Label>
              <Input
                value={config.imageEndpoint ?? ""}
                onChange={(e) => setConfig({ ...config, imageEndpoint: e.target.value || null })}
                placeholder="null = not supported"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-2">
                <Switch
                  checked={config.imageViaChat ?? false}
                  onCheckedChange={(v) => setConfig({ ...config, imageViaChat: v })}
                />
                <Label>{t("imageViaChat")}</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={config.supportsModelsApi ?? false}
                  onCheckedChange={(v) => setConfig({ ...config, supportsModelsApi: v })}
                />
                <Label>{t("supportsModels")}</Label>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-2">
                <Switch
                  checked={config.supportsSystemRole ?? true}
                  onCheckedChange={(v) => setConfig({ ...config, supportsSystemRole: v })}
                />
                <Label>{t("supportsSystem")}</Label>
              </div>
              <div>
                <Label>{t("currency")}</Label>
                <Select
                  value={config.currency ?? "USD"}
                  onValueChange={(v) => {
                    if (v) setConfig({ ...config, currency: v });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="CNY">CNY</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>{t("quirks")}</Label>
              <Textarea
                value={quirksText}
                onChange={(e) => setQuirksText(e.target.value)}
                placeholder={t("quirksPlaceholder")}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfigOpen(false)}>
                {tc("cancel")}
              </Button>
              <Button
                onClick={async () => {
                  try {
                    const quirks = quirksText
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean);
                    await apiFetch(`/api/admin/providers/${configProviderId}/config`, {
                      method: "PATCH",
                      body: JSON.stringify({ ...config, quirks }),
                    });
                    toast.success(t("configSaved"));
                    setConfigOpen(false);
                  } catch (e) {
                    toast.error((e as Error).message);
                  }
                }}
              >
                {t("saveConfig")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
