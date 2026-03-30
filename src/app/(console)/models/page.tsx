"use client";
import { useEffect, useState, useMemo } from "react";
import { useTranslations } from "next-intl";
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

const PROVIDER_COLORS: Record<string, string> = {
  openai: "#534AB7", anthropic: "#D85A30", deepseek: "#0F9D7A",
  zhipu: "#185FA5", volcengine: "#E24B4A", siliconflow: "#0F9D7A", openrouter: "#888780",
};
const PROVIDER_ABBR: Record<string, string> = {
  openai: "OA", anthropic: "An", deepseek: "DS",
  zhipu: "ZP", volcengine: "VE", siliconflow: "SF", openrouter: "OR",
};

const MODELS_PER_PAGE = 20;

function fmtPrice(p: Record<string, unknown>) {
  if (p.unit === "call") { const v = Number(p.per_call ?? 0); return v === 0 ? "Free" : `$${v}/img`; }
  const inp = Number(p.input_per_1m ?? 0);
  const out = Number(p.output_per_1m ?? 0);
  return inp === 0 && out === 0 ? "Free" : `$${inp} / $${out} /M`;
}

function getProviderName(modelId: string): string {
  const slash = modelId.indexOf("/");
  return slash > 0 ? modelId.substring(0, slash) : "other";
}

function capitalize(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }

export default function ModelsPage() {
  const t = useTranslations("models");
  const tc = useTranslations("common");
  const [models, setModels] = useState<ModelItem[]>([]);
  const [search, setSearch] = useState("");
  const [modality, setModality] = useState("");
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(new Set());
  const [showAllModels, setShowAllModels] = useState<Set<string>>(new Set());

  useEffect(() => {
    const q = modality ? `?modality=${modality}` : "";
    fetch(`/v1/models${q}`)
      .then((r) => r.json())
      .then((r) => setModels(r.data ?? []));
  }, [modality]);

  const grouped = useMemo(() => {
    const filtered = models.filter((m) => !search || m.id.toLowerCase().includes(search.toLowerCase()));
    const map = new Map<string, ModelItem[]>();
    for (const m of filtered) {
      const prov = getProviderName(m.id);
      if (!map.has(prov)) map.set(prov, []);
      map.get(prov)!.push(m);
    }
    const groups: ProviderGroup[] = [];
    for (const [name, items] of map) {
      groups.push({ name, displayName: capitalize(name), models: items });
    }
    return groups.sort((a, b) => a.name.localeCompare(b.name));
  }, [models, search]);

  const toggle = (set: Set<string>, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 500 }}>{t("title")}</h1>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            className="focus:outline-none"
            style={{ fontSize: 13, padding: "7px 12px", border: "0.5px solid #e5e4e0", borderRadius: 8, width: 220, background: "#fff", fontFamily: "inherit" }}
            type="text"
            placeholder={t("searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div style={{ display: "flex", gap: 2, background: "#e5e4e0", borderRadius: 8, padding: 2 }}>
            {[{ val: "", label: tc("all") }, { val: "text", label: t("text") }, { val: "image", label: t("image") }].map((m) => (
              <button
                key={m.val}
                onClick={() => setModality(m.val)}
                style={{
                  fontSize: 13, padding: "6px 14px", borderRadius: 6, cursor: "pointer",
                  background: modality === m.val ? "#fff" : "transparent",
                  color: modality === m.val ? "#2C2C2A" : "#5F5E5A",
                  fontWeight: modality === m.val ? 500 : 400,
                  border: "none", fontFamily: "inherit",
                  boxShadow: modality === m.val ? "0 0 0 0.5px #e5e4e0" : "none",
                }}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Provider groups */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {grouped.map((group) => {
          const expanded = expandedProviders.has(group.name);
          const bgColor = PROVIDER_COLORS[group.name] ?? "#888780";
          const abbr = PROVIDER_ABBR[group.name] ?? group.displayName.slice(0, 2);
          const visibleModels = showAllModels.has(group.name) ? group.models : group.models.slice(0, MODELS_PER_PAGE);
          const hasMore = group.models.length > MODELS_PER_PAGE && !showAllModels.has(group.name);

          return (
            <div key={group.name} style={{ border: "0.5px solid #e5e4e0", borderRadius: 12, overflow: "hidden", background: "#fff" }}>
              {/* Provider header */}
              <div
                onClick={() => setExpandedProviders((s) => toggle(s, group.name))}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", cursor: "pointer" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#f8f7f5")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <div style={{ width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 500, color: "#fff", flexShrink: 0, background: bgColor }}>
                  {abbr}
                </div>
                <span style={{ fontSize: 14, fontWeight: 500 }}>{group.displayName}</span>
                <span style={{ fontSize: 12, color: "#888780", marginLeft: 4 }}>{group.models.length} {t("modelCount")}</span>
                <span style={{ fontSize: 12, color: "#B4B2A9", marginLeft: "auto" }}>{expanded ? "\u25B2" : "\u25B6"}</span>
              </div>

              {/* Model list */}
              {expanded && (
                <div style={{ padding: "0 16px 12px" }}>
                  {visibleModels.map((m) => (
                    <div
                      key={m.id}
                      style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 8 }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "#f8f7f5")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <span style={{ fontSize: 13, fontWeight: 500, flex: 1, fontFamily: "'SF Mono','Fira Code','Consolas',monospace" }}>{m.id}</span>
                      <span style={{
                        fontSize: 11, padding: "2px 8px", borderRadius: 4, fontWeight: 500,
                        background: m.modality === "text" ? "#E6F1FB" : "#FBEAF0",
                        color: m.modality === "text" ? "#0C447C" : "#72243E",
                      }}>
                        {m.modality}
                      </span>
                      <span style={{ fontSize: 12, color: "#888780" }}>{m.context_window ? formatContext(m.context_window) : "\u2014"}</span>
                      <span style={{
                        fontSize: 12, fontFamily: "'SF Mono','Fira Code','Consolas',monospace",
                        color: fmtPrice(m.pricing) === "Free" ? "#639922" : "#5F5E5A",
                        fontWeight: fmtPrice(m.pricing) === "Free" ? 600 : 400,
                      }}>
                        {fmtPrice(m.pricing)}
                      </span>
                    </div>
                  ))}

                  {hasMore && (
                    <button
                      onClick={() => setShowAllModels((s) => { const n = new Set(s); n.add(group.name); return n; })}
                      style={{ display: "block", width: "100%", padding: "10px 0", fontSize: 12, color: "#5F5E5A", background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit" }}
                    >
                      {t("showAll", { count: group.models.length })}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
