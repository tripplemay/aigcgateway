"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

interface Channel {
  id: string;
  providerName: string;
  modelName: string;
  realModelId: string;
  priority: number;
  costPrice: Record<string, unknown>;
  sellPrice: Record<string, unknown>;
  status: string;
  lastHealthResult: string | null;
}

export default function ChannelsPage() {
  const t = useTranslations("adminChannels");
  const tc = useTranslations("common");
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPriority, setEditingPriority] = useState<string | null>(null);
  const [priorityValue, setPriorityValue] = useState("");

  const load = async () => {
    setLoading(true);
    const r = await apiFetch<{ data: Channel[] }>("/api/admin/channels");
    setChannels(r.data);
    setLoading(false);
  };
  useEffect(() => {
    load();
  }, []);

  const updatePriority = async (id: string) => {
    const p = Number(priorityValue);
    if (p > 0) {
      await apiFetch(`/api/admin/channels/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ priority: p }),
      });
      toast.success(t("priorityUpdated"));
      load();
    }
    setEditingPriority(null);
  };

  const toggleStatus = async (ch: Channel) => {
    const next = ch.status === "ACTIVE" ? "DISABLED" : "ACTIVE";
    await apiFetch(`/api/admin/channels/${ch.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: next }),
    });
    load();
  };

  const deleteChannel = async (id: string) => {
    if (!confirm(t("deleteConfirm"))) return;
    await apiFetch(`/api/admin/channels/${id}`, { method: "DELETE" });
    toast.success(t("deleted"));
    load();
  };

  const fmtPrice = (p: Record<string, unknown>) =>
    p.unit === "call" ? `$${p.perCall}/call` : `$${p.inputPer1M}/$${p.outputPer1M} /M`;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Model</TableHead>
                <TableHead>{t("provider")}</TableHead>
                <TableHead>{t("realId")}</TableHead>
                <TableHead>{t("priority")}</TableHead>
                <TableHead>Cost</TableHead>
                <TableHead>{t("sell")}</TableHead>
                <TableHead>{tc("status")}</TableHead>
                <TableHead>{t("health")}</TableHead>
                <TableHead>{tc("actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    {tc("loading")}
                  </TableCell>
                </TableRow>
              ) : (
                channels.map((ch) => (
                  <TableRow key={ch.id}>
                    <TableCell className="font-medium text-xs text-text-primary">
                      {ch.modelName}
                    </TableCell>
                    <TableCell>{ch.providerName}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {ch.realModelId}
                    </TableCell>
                    <TableCell>
                      {editingPriority === ch.id ? (
                        <Input
                          className="w-16 h-7 text-center"
                          autoFocus
                          value={priorityValue}
                          onChange={(e) => setPriorityValue(e.target.value)}
                          onBlur={() => updatePriority(ch.id)}
                          onKeyDown={(e) => e.key === "Enter" && updatePriority(ch.id)}
                        />
                      ) : (
                        <button
                          className="text-primary hover:underline"
                          onClick={() => {
                            setEditingPriority(ch.id);
                            setPriorityValue(String(ch.priority));
                          }}
                        >
                          {ch.priority}
                        </button>
                      )}
                    </TableCell>
                    <TableCell className="text-xs font-mono">{fmtPrice(ch.costPrice)}</TableCell>
                    <TableCell className="text-xs font-mono">{fmtPrice(ch.sellPrice)}</TableCell>
                    <TableCell>
                      <button onClick={() => toggleStatus(ch)}>
                        <Badge variant={ch.status === "ACTIVE" ? "success" : "error"}>
                          {ch.status.toLowerCase()}
                        </Badge>
                      </button>
                    </TableCell>
                    <TableCell>
                      {ch.lastHealthResult === "PASS"
                        ? "✓"
                        : ch.lastHealthResult === "FAIL"
                          ? "✗"
                          : "?"}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        onClick={() => deleteChannel(ch.id)}
                      >
                        {tc("delete")}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
