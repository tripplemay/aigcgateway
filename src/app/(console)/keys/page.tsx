"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useProject } from "@/hooks/use-project";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { timeAgo } from "@/lib/utils";
import { Copy } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";

interface ApiKeyRow {
  id: string;
  keyPrefix: string;
  maskedKey: string;
  name: string | null;
  status: string;
  lastUsedAt: string | null;
  createdAt: string;
}

export default function KeysPage() {
  const t = useTranslations("keys");
  const tc = useTranslations("common");
  const { current, loading: projLoading } = useProject();
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [revokeId, setRevokeId] = useState<string | null>(null);

  const load = async () => {
    if (!current) return;
    const r = await apiFetch<{ data: ApiKeyRow[] }>(`/api/projects/${current.id}/keys`);
    setKeys(r.data);
  };
  useEffect(() => {
    load();
  }, [current]);

  const create = async () => {
    if (!current) return;
    const r = await apiFetch<{ key: string }>(`/api/projects/${current.id}/keys`, {
      method: "POST",
      body: JSON.stringify({ name: keyName || undefined }),
    });
    setNewKey(r.key);
    toast.success(t("created_toast"));
    load();
  };

  const revoke = async () => {
    if (!current || !revokeId) return;
    await apiFetch(`/api/projects/${current.id}/keys/${revokeId}`, { method: "DELETE" });
    toast.success(t("revoked_toast"));
    setRevokeId(null);
    load();
  };

  const copyKey = () => {
    if (newKey) {
      navigator.clipboard.writeText(newKey);
      toast.success(tc("copied"));
    }
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
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <Button
          onClick={() => {
            setKeyName("");
            setNewKey(null);
            setCreateOpen(true);
          }}
        >
          {t("createKey")}
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("key")}</TableHead>
                <TableHead>{tc("name")}</TableHead>
                <TableHead>{tc("status")}</TableHead>
                <TableHead>{t("lastUsed")}</TableHead>
                <TableHead>{t("created")}</TableHead>
                <TableHead>{tc("actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.map((k) => (
                <TableRow key={k.id}>
                  <TableCell className="font-mono text-sm">{k.maskedKey}</TableCell>
                  <TableCell>{k.name ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={k.status === "ACTIVE" ? "success" : "error"}>
                      {k.status.toLowerCase()}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {k.lastUsedAt ? timeAgo(k.lastUsedAt) : tc("never")}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{timeAgo(k.createdAt)}</TableCell>
                  <TableCell>
                    {k.status === "ACTIVE" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        onClick={() => setRevokeId(k.id)}
                      >
                        {t("revoke")}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{newKey ? t("keyCreated") : t("createApiKey")}</DialogTitle>
          </DialogHeader>
          {newKey ? (
            <div className="space-y-4">
              <div className="bg-destructive/10 text-destructive text-sm rounded-md p-3">
                {t("keyWarning")}
              </div>
              <div className="flex gap-2">
                <Input readOnly value={newKey} className="font-mono text-xs" />
                <Button variant="outline" size="icon" onClick={copyKey}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <Button className="w-full" onClick={() => setCreateOpen(false)}>
                {tc("done")}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <Label>{t("nameOptional")}</Label>
                <Input
                  value={keyName}
                  onChange={(e) => setKeyName(e.target.value)}
                  placeholder={t("namePlaceholder")}
                  maxLength={50}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setCreateOpen(false)}>
                  {tc("cancel")}
                </Button>
                <Button onClick={create}>{tc("create")}</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Revoke confirm */}
      <Dialog open={!!revokeId} onOpenChange={() => setRevokeId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("revokeTitle")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t("revokeWarning")}</p>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setRevokeId(null)}>
              {tc("cancel")}
            </Button>
            <Button variant="destructive" onClick={revoke}>
              {t("revoke")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
