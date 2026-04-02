"use client";
import { useEffect, useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { formatContext } from "@/lib/utils";
import "material-symbols/outlined.css";

// ============================================================
// Types & helpers (unchanged)
// ============================================================

interface ModelItem {
  id: string;
  display_name: string;
  modality: string;
  provider_name?: string;
  context_window?: number;
  pricing: Record<string, unknown>;
}

interface ProviderGroup {
  name: string;
  displayName: string;
  models: ModelItem[];
}

const PROVIDER_COLORS: Record<string, string> = {
  openai: "#534AB7",
  anthropic: "#D85A30",
  deepseek: "#0F9D7A",
  zhipu: "#185FA5",
  volcengine: "#E24B4A",
  siliconflow: "#0F9D7A",
  openrouter: "#888780",
};
const PROVIDER_ABBR: Record<string, string> = {
  openai: "OA",
  anthropic: "An",
  deepseek: "DS",
  zhipu: "ZP",
  volcengine: "VE",
  siliconflow: "SF",
  openrouter: "OR",
};

const MODELS_PER_PAGE = 20;

function fmtPrice(p: Record<string, unknown>) {
  if (p.unit === "call") {
    const v = Number(p.per_call ?? 0);
    return v === 0 ? "Free" : `$${v}/img`;
  }
  const inp = Number(p.input_per_1m ?? 0);
  const out = Number(p.output_per_1m ?? 0);
  return inp === 0 && out === 0 ? "Free" : `$${inp} / $${out} /M`;
}

function getProviderKey(modelId: string): string {
  const slash = modelId.indexOf("/");
  return slash > 0 ? modelId.substring(0, slash) : "other";
}

// ============================================================
// Component
// ============================================================

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
    const filtered = models.filter(
      (m) => !search || m.id.toLowerCase().includes(search.toLowerCase()),
    );
    const map = new Map<string, { displayName: string; models: ModelItem[] }>();
    for (const m of filtered) {
      const key = getProviderKey(m.id);
      if (!map.has(key)) map.set(key, { displayName: m.provider_name ?? key, models: [] });
      const group = map.get(key)!;
      if (m.provider_name && group.displayName === key) group.displayName = m.provider_name;
      group.models.push(m);
    }
    const groups: ProviderGroup[] = [];
    for (const [name, val] of map)
      groups.push({ name, displayName: val.displayName, models: val.models });
    return groups.sort((a, b) => a.name.localeCompare(b.name));
  }, [models, search]);

  const toggle = (set: Set<string>, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };

  const totalModels = models.length;
  const textModels = models.filter((m) => m.modality === "text").length;
  const imageModels = models.filter((m) => m.modality === "image").length;

  // ── Render — 1:1 replica of Models (Full Redesign) code.html ──
  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* ═══ Page Header ═══ */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h2 className="text-3xl font-extrabold tracking-tight font-[var(--font-heading)] text-ds-on-surface">
            {t("title")}
          </h2>
          <p className="text-ds-on-surface-variant font-medium mt-1">
            Browse available models and pricing across all providers.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
              search
            </span>
            <input
              className="pl-9 pr-4 py-2 text-sm rounded-full bg-ds-surface-container-low border-none focus:ring-2 focus:ring-ds-primary/20 w-56 transition-all placeholder:text-slate-400 outline-none"
              type="text"
              placeholder={t("searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {/* Modality filter */}
          <div className="flex bg-ds-surface-container-low p-1 rounded-xl">
            {[
              { val: "", label: tc("all") },
              { val: "text", label: t("text") },
              { val: "image", label: t("image") },
            ].map((m) => (
              <button
                key={m.val}
                onClick={() => setModality(m.val)}
                className={`px-4 py-1.5 text-xs font-bold uppercase tracking-wider transition-all ${
                  modality === m.val
                    ? "text-indigo-700 bg-white rounded-lg shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ═══ Bento Grid Statistics — code.html lines 170-196 ═══ */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12">
        {/* First card: col-span-2 — lines 172-185 */}
        <div className="col-span-1 md:col-span-2 bg-ds-surface-container-lowest p-6 rounded-xl shadow-[0px_20px_40px_rgba(19,27,46,0.04)] flex flex-col justify-between overflow-hidden relative">
          <div className="relative z-10">
            <span className="text-[10px] font-bold text-ds-primary uppercase tracking-widest">
              Active Infrastructure
            </span>
            <h3 className="text-3xl font-extrabold mt-2 font-[var(--font-heading)]">
              {totalModels} Total Models
            </h3>
          </div>
          {/* Mini bar chart — lines 177-182 */}
          <div className="mt-8 flex items-end gap-2 relative z-10">
            <div className="w-1/4 h-12 bg-ds-primary/10 rounded-lg" />
            <div className="w-1/4 h-20 bg-ds-primary/20 rounded-lg" />
            <div className="w-1/4 h-16 bg-ds-primary/40 rounded-lg" />
            <div className="w-1/4 h-24 bg-ds-primary rounded-lg" />
          </div>
          {/* Decorative — line 184 */}
          <div className="absolute -right-12 -top-12 w-48 h-48 bg-indigo-50 rounded-full blur-3xl opacity-50" />
        </div>
        {/* Optimization card — lines 186-190 */}
        <div className="bg-ds-surface-container-lowest p-6 rounded-xl shadow-[0px_20px_40px_rgba(19,27,46,0.04)]">
          <span className="text-[10px] font-bold text-ds-tertiary uppercase tracking-widest">
            Optimization
          </span>
          <h3 className="text-3xl font-extrabold mt-2 font-[var(--font-heading)]">—</h3>
          <p className="text-xs text-ds-on-surface-variant mt-2">Avg. Latency Overhead</p>
        </div>
        {/* Active Providers card — lines 191-195 */}
        <div className="bg-ds-surface-container-lowest p-6 rounded-xl shadow-[0px_20px_40px_rgba(19,27,46,0.04)]">
          <span className="text-[10px] font-bold text-ds-secondary uppercase tracking-widest">
            Active Providers
          </span>
          <h3 className="text-3xl font-extrabold mt-2 font-[var(--font-heading)]">
            {grouped.length}
          </h3>
          <p className="text-xs text-ds-on-surface-variant mt-2">Provider groups</p>
        </div>
      </div>

      {/* ═══ Provider Groups ═══ */}
      <div className="space-y-4">
        {grouped.map((group) => {
          const expanded = expandedProviders.has(group.name);
          const bgColor = PROVIDER_COLORS[group.name] ?? "#888780";
          const abbr = PROVIDER_ABBR[group.name] ?? group.displayName.slice(0, 2);
          const visibleModels = showAllModels.has(group.name)
            ? group.models
            : group.models.slice(0, MODELS_PER_PAGE);
          const hasMore = group.models.length > MODELS_PER_PAGE && !showAllModels.has(group.name);

          return (
            <div
              key={group.name}
              className="bg-ds-surface-container-lowest rounded-xl shadow-sm overflow-hidden"
            >
              {/* Provider header */}
              <div
                onClick={() => setExpandedProviders((s) => toggle(s, group.name))}
                className="flex items-center gap-3 px-6 py-4 cursor-pointer hover:bg-ds-surface-container-low transition-colors"
              >
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white shrink-0"
                  style={{ background: bgColor }}
                >
                  {abbr}
                </div>
                <span className="text-sm font-bold text-ds-on-surface">{group.displayName}</span>
                <span className="text-xs text-slate-500 ml-1">
                  {group.models.length} {t("modelCount")}
                </span>
                <span className="material-symbols-outlined text-slate-400 ml-auto text-sm">
                  {expanded ? "expand_less" : "expand_more"}
                </span>
              </div>

              {/* Model list */}
              {expanded && (
                <div className="px-6 pb-4">
                  {visibleModels.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center gap-4 px-4 py-3 rounded-lg hover:bg-ds-surface-container-low transition-colors"
                    >
                      <span className="text-sm font-medium font-mono flex-1 text-ds-on-surface">
                        {m.id}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                          m.modality === "text"
                            ? "bg-indigo-50 text-indigo-700"
                            : "bg-pink-50 text-pink-700"
                        }`}
                      >
                        {m.modality}
                      </span>
                      <span className="text-xs text-slate-500 w-20 text-right">
                        {m.context_window ? formatContext(m.context_window) : "—"}
                      </span>
                      <span
                        className={`text-xs font-mono w-32 text-right ${
                          fmtPrice(m.pricing) === "Free"
                            ? "text-green-600 font-bold"
                            : "text-slate-600"
                        }`}
                      >
                        {fmtPrice(m.pricing)}
                      </span>
                    </div>
                  ))}
                  {hasMore && (
                    <button
                      onClick={() =>
                        setShowAllModels((s) => {
                          const n = new Set(s);
                          n.add(group.name);
                          return n;
                        })
                      }
                      className="w-full py-3 text-xs font-bold text-ds-primary hover:underline"
                    >
                      {t("showAll", { count: group.models.length })}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {grouped.length === 0 && (
          <div className="text-center py-12 text-ds-outline">No models found</div>
        )}
      </div>
    </div>
  );
}
