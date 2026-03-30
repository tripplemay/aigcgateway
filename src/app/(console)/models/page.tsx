"use client";
import { useEffect, useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatContext } from "@/lib/utils";

interface ModelItem {
  id: string;
  display_name: string;
  modality: string;
  context_window?: number;
  pricing: Record<string, unknown>;
}

interface ProviderGroup {
  name: string;
  displayName: string;
  models: ModelItem[];
}

function fmtPrice(p: Record<string, unknown>) {
  if (p.unit === "call") {
    const v = Number(p.per_call ?? 0);
    return v === 0 ? "Free" : `$${v}/img`;
  }
  const inp = Number(p.input_per_1m ?? 0);
  const out = Number(p.output_per_1m ?? 0);
  return inp === 0 && out === 0 ? "Free" : `$${inp} / $${out} /M`;
}

/** Extract provider name from model id like "openai/gpt-4o" → "openai" */
function getProviderName(modelId: string): string {
  const slash = modelId.indexOf("/");
  return slash > 0 ? modelId.substring(0, slash) : "other";
}

/** Capitalize first letter */
function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function ModelsPage() {
  const t = useTranslations("models");
  const tc = useTranslations("common");
  const [models, setModels] = useState<ModelItem[]>([]);
  const [search, setSearch] = useState("");
  const [modality, setModality] = useState("");
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(
    new Set(),
  );

  useEffect(() => {
    const q = modality ? `?modality=${modality}` : "";
    fetch(`/v1/models${q}`)
      .then((r) => r.json())
      .then((r) => setModels(r.data ?? []));
  }, [modality]);

  const grouped = useMemo(() => {
    const filtered = models.filter(
      (m) => !search || m.id.toLowerCase().includes(search.toLowerCase()),
    );

    const map = new Map<string, ModelItem[]>();
    for (const m of filtered) {
      const provider = getProviderName(m.id);
      if (!map.has(provider)) map.set(provider, []);
      map.get(provider)!.push(m);
    }

    const groups: ProviderGroup[] = [];
    for (const [name, items] of map) {
      groups.push({
        name,
        displayName: capitalize(name),
        models: items,
      });
    }
    return groups.sort((a, b) => a.name.localeCompare(b.name));
  }, [models, search]);

  const toggleProvider = (name: string) => {
    setExpandedProviders((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  // Auto-expand all on first load
  useEffect(() => {
    if (grouped.length > 0 && expandedProviders.size === 0) {
      setExpandedProviders(new Set(grouped.map((g) => g.name)));
    }
  }, [grouped, expandedProviders.size]);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">{t("title")}</h1>

      {/* Top bar */}
      <div className="flex gap-2 mb-4">
        <Input
          className="max-w-sm"
          placeholder={t("searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="flex gap-1 ml-auto">
          {[
            { val: "", label: tc("all") },
            { val: "text", label: t("text") },
            { val: "image", label: t("image") },
          ].map((m) => (
            <Button
              key={m.val}
              size="sm"
              variant={modality === m.val ? "default" : "outline"}
              onClick={() => setModality(m.val)}
            >
              {m.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Provider groups */}
      <div className="space-y-3">
        {grouped.map((group) => (
          <div
            key={group.name}
            className="border rounded-lg bg-white overflow-hidden"
          >
            {/* Layer 1: Provider header */}
            <button
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors"
              onClick={() => toggleProvider(group.name)}
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand/10 text-brand text-sm font-bold">
                  {group.displayName.charAt(0)}
                </div>
                <span className="font-medium text-sm">
                  {group.displayName}
                </span>
                <span className="text-xs text-muted-foreground">
                  {group.models.length} {t("modelCount")}
                </span>
              </div>
              <span className="text-muted-foreground text-xs">
                {expandedProviders.has(group.name) ? "▲" : "▼"}
              </span>
            </button>

            {/* Layer 2: Model list */}
            {expandedProviders.has(group.name) && (
              <div className="border-t">
                {group.models.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center gap-3 px-6 py-2.5 hover:bg-muted/30 transition-colors"
                  >
                    <span className="font-mono text-xs flex-1 text-text-primary">
                      {m.id}
                    </span>
                    <Badge
                      variant={m.modality === "text" ? "info" : "image"}
                      className="text-[10px]"
                    >
                      {m.modality}
                    </Badge>
                    <span className="text-xs text-muted-foreground w-16 text-right">
                      {m.context_window
                        ? formatContext(m.context_window)
                        : "—"}
                    </span>
                    <span
                      className={`text-xs font-mono w-32 text-right ${fmtPrice(m.pricing) === "Free" ? "text-success-text font-semibold" : ""}`}
                    >
                      {fmtPrice(m.pricing)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
