"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatContext } from "@/lib/utils";

interface ModelItem {
  id: string;
  display_name: string;
  modality: string;
  context_window?: number;
  pricing: Record<string, unknown>;
}

export default function ModelsPage() {
  const t = useTranslations("models");
  const tc = useTranslations("common");
  const [models, setModels] = useState<ModelItem[]>([]);
  const [search, setSearch] = useState("");
  const [modality, setModality] = useState("");

  useEffect(() => {
    const q = modality ? `?modality=${modality}` : "";
    fetch(`/v1/models${q}`)
      .then((r) => r.json())
      .then((r) => setModels(r.data ?? []));
  }, [modality]);

  const filtered = models.filter(
    (m) => !search || m.id.toLowerCase().includes(search.toLowerCase()),
  );

  const fmtPrice = (p: Record<string, unknown>) => {
    if (p.unit === "call") return Number(p.per_call) === 0 ? "Free" : `$${p.per_call}/img`;
    const inp = Number(p.input_per_1m ?? 0);
    const out = Number(p.output_per_1m ?? 0);
    return inp === 0 && out === 0 ? "Free" : `$${inp} / $${out} /M`;
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">{t("title")}</h1>
      <div className="flex gap-2 mb-4">
        <Input
          className="max-w-sm"
          placeholder={t("searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="flex gap-1 ml-auto">
          {["", "text", "image"].map((m) => (
            <Button
              key={m}
              size="sm"
              variant={modality === m ? "default" : "outline"}
              onClick={() => setModality(m)}
            >
              {m || tc("all")}
            </Button>
          ))}
        </div>
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{tc("name")}</TableHead>
                <TableHead>{t("type")}</TableHead>
                <TableHead>{t("price")}</TableHead>
                <TableHead>{t("context")}</TableHead>
                <TableHead>{tc("status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="text-[13px] font-medium text-text-primary">
                    {m.id}
                  </TableCell>
                  <TableCell>
                    <Badge variant={m.modality === "text" ? "info" : "image"}>{m.modality}</Badge>
                  </TableCell>
                  <TableCell
                    className={`font-mono text-[11px] ${fmtPrice(m.pricing) === "Free" ? "text-success-text font-semibold" : ""}`}
                  >
                    {fmtPrice(m.pricing)}
                  </TableCell>
                  <TableCell className="text-text-tertiary">
                    {m.context_window ? formatContext(m.context_window) : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="success">{t("active")}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
