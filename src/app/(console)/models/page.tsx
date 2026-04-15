"use client";
import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { useAsyncData } from "@/hooks/use-async-data";
import { SearchBar } from "@/components/search-bar";
import { PageContainer } from "@/components/page-container";
import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { TableCard } from "@/components/table-card";
import { StatusChip, type StatusChipVariant } from "@/components/status-chip";
import { useExchangeRate } from "@/hooks/use-exchange-rate";
import { formatCNY } from "@/lib/utils";

// ============================================================
// Types & helpers
// ============================================================

interface ModelItem {
  id: string;
  brand?: string;
  modality: string;
  context_window?: number;
  description?: string;
  pricing: Record<string, unknown>;
  capabilities?: Record<string, boolean>;
}

interface BrandGroup {
  brand: string;
  models: ModelItem[];
}

/** Brand → icon background color (external brand identity, not DS tokens) */
const BRAND_COLORS: Record<string, string> = {
  OpenAI: "#000000",
  Anthropic: "#D85A30",
  Google: "#4285F4",
  Meta: "#0668E1",
  Mistral: "#F54E42",
  DeepSeek: "#0F9D7A",
  "智谱 AI": "#185FA5",
  xAI: "#1D1D1F",
};

/** Brand → 2-letter abbreviation */
const BRAND_ABBR: Record<string, string> = {
  OpenAI: "OA",
  Anthropic: "An",
  Google: "Go",
  Meta: "Me",
  Mistral: "Mi",
  DeepSeek: "DS",
  "智谱 AI": "ZP",
  xAI: "xA",
};

const MODELS_PER_PAGE = 20;

const MODALITY_CHIP: Record<string, StatusChipVariant> = {
  text: "info",
  image: "success",
  audio: "warning",
  video: "error",
};

function fmtPriceSplit(
  p: Record<string, unknown>,
  rate: number,
): { input: string; output: string } | null {
  if (p.unit === "call") {
    const v = Number(p.per_call ?? 0);
    if (v === 0) return null;
    return { input: formatCNY(v, rate, 2), output: "" };
  }
  const inp = Number(p.input_per_1m ?? 0);
  const out = Number(p.output_per_1m ?? 0);
  if (inp === 0 && out === 0) return null;
  return {
    input: formatCNY(inp, rate, 2),
    output: formatCNY(out, rate, 2),
  };
}

function hasCapability(m: ModelItem, cap: string): boolean {
  return !!(m.capabilities && m.capabilities[cap]);
}

// ============================================================
// Component
// ============================================================

export default function ModelsPage() {
  const t = useTranslations("models");
  const tc = useTranslations("common");
  const exchangeRate = useExchangeRate();
  const [search, setSearch] = useState("");
  const [modality, setModality] = useState("");
  const [collapsedBrands, setCollapsedBrands] = useState<Set<string>>(new Set());
  const [showAllModels, setShowAllModels] = useState<Set<string>>(new Set());

  const { data: modelsData } = useAsyncData<{ data: ModelItem[] }>(async () => {
    const q = modality ? `?modality=${modality}` : "";
    const res = await fetch(`/v1/models${q}`);
    return res.json();
  }, [modality]);
  const models = modelsData?.data ?? [];

  const grouped = useMemo(() => {
    const filtered = models.filter(
      (m) => !search || m.id.toLowerCase().includes(search.toLowerCase()),
    );
    const map = new Map<string, ModelItem[]>();
    for (const m of filtered) {
      const brand = m.brand || t("otherModels");
      if (!map.has(brand)) map.set(brand, []);
      map.get(brand)!.push(m);
    }
    const groups: BrandGroup[] = [];
    const otherLabel = t("otherModels");
    for (const [brand, brandModels] of map) {
      groups.push({ brand, models: brandModels });
    }
    // Sort: named brands first alphabetically, "Other" last
    return groups.sort((a, b) => {
      if (a.brand === otherLabel) return 1;
      if (b.brand === otherLabel) return -1;
      return a.brand.localeCompare(b.brand);
    });
  }, [modelsData, search, t]);

  const toggleCollapse = (brand: string) => {
    setCollapsedBrands((prev) => {
      const next = new Set(prev);
      if (next.has(brand)) next.delete(brand);
      else next.add(brand);
      return next;
    });
  };

  const totalModels = models.length;
  const brandCount = grouped.length;

  // BL-121: the bottom "show all" button should expand every brand at once
  // and disappear when nothing is left to expand.
  const allBrandsFullyExpanded = grouped.every(
    (g) => g.models.length <= MODELS_PER_PAGE || showAllModels.has(g.brand),
  );
  const hasExpandableBrands = grouped.some(
    (g) => g.models.length > MODELS_PER_PAGE && !showAllModels.has(g.brand),
  );
  const expandAllBrands = () => {
    setShowAllModels(new Set(grouped.map((g) => g.brand)));
  };

  return (
    <PageContainer data-testid="models-page">
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          <div className="flex items-center bg-ds-surface-container-low p-1.5 rounded-xl">
            {[
              { val: "", label: tc("all") },
              { val: "text", label: t("text") },
              { val: "image", label: t("image") },
              { val: "audio", label: t("audio") },
            ].map((m) => (
              <button
                key={m.val}
                onClick={() => setModality(m.val)}
                className={`px-5 py-2 text-sm font-semibold transition-colors ${
                  modality === m.val
                    ? "bg-white text-ds-primary rounded-lg shadow-sm font-bold"
                    : "text-ds-on-surface-variant hover:text-ds-primary"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        }
      />

      {/* ═══ Statistics ═══ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
        <SectionCard>
          <span className="text-[10px] font-bold text-ds-primary uppercase tracking-widest">
            {t("activeInfrastructure")}
          </span>
          <h3 className="text-3xl font-extrabold mt-2 font-[var(--font-heading)]">
            {totalModels} {t("totalModels")}
          </h3>
        </SectionCard>
        <SectionCard>
          <span className="text-[10px] font-bold text-ds-secondary uppercase tracking-widest">
            {t("brandGroups")}
          </span>
          <h3 className="text-3xl font-extrabold mt-2 font-[var(--font-heading)]">{brandCount}</h3>
          <p className="text-xs text-ds-on-surface-variant mt-2">{t("activeBrands")}</p>
        </SectionCard>
      </div>

      {/* ═══ Search bar ═══ */}
      <SearchBar
        placeholder={t("searchPlaceholder")}
        value={search}
        onChange={setSearch}
        className="max-w-xl"
      />

      {/* ═══ Brand Groups — code.html lines 199-387 ═══ */}
      <div className="space-y-6">
        {grouped.map((group) => {
          const collapsed = collapsedBrands.has(group.brand);
          const bgColor = BRAND_COLORS[group.brand] ?? "var(--ds-outline)";
          const abbr = BRAND_ABBR[group.brand] ?? group.brand.slice(0, 2).toUpperCase();
          const visibleModels = showAllModels.has(group.brand)
            ? group.models
            : group.models.slice(0, MODELS_PER_PAGE);
          const hasMore = group.models.length > MODELS_PER_PAGE && !showAllModels.has(group.brand);

          return (
            <div key={group.brand} className="group">
              {/* Brand header — code.html lines 201-209 */}
              <div className="flex items-center justify-between mb-4 px-2">
                <div className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white shrink-0"
                    style={{ background: bgColor }}
                  >
                    {abbr}
                  </div>
                  <h2 className="heading-2">{group.brand}</h2>
                  <span className="text-xs text-ds-outline ml-1">
                    {group.models.length} {t("modelCount")}
                  </span>
                </div>
                <button
                  onClick={() => toggleCollapse(group.brand)}
                  className="text-sm font-semibold text-ds-primary hover:underline"
                >
                  {collapsed ? t("expand") : t("collapse")}
                </button>
              </div>

              {/* Model table — code.html lines 211-300 */}
              {!collapsed && (
                <TableCard>
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-ds-surface-container-low border-b border-ds-outline-variant/5">
                      <tr>
                        <th className="px-6 py-4 text-[10px] font-bold text-ds-outline uppercase tracking-widest">
                          {t("modelId")}
                        </th>
                        <th className="px-6 py-4 text-[10px] font-bold text-ds-outline uppercase tracking-widest">
                          {t("modality")}
                        </th>
                        <th className="px-6 py-4 text-[10px] font-bold text-ds-outline uppercase tracking-widest">
                          {t("context")}
                        </th>
                        <th className="px-6 py-4 text-[10px] font-bold text-ds-outline uppercase tracking-widest">
                          {t("price")}
                        </th>
                        <th className="px-6 py-4 text-[10px] font-bold text-ds-outline uppercase tracking-widest text-right">
                          {t("actions")}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ds-outline-variant/5">
                      {visibleModels.map((m) => {
                        const priceSplit = fmtPriceSplit(m.pricing, exchangeRate);
                        const modalityVariant: StatusChipVariant =
                          MODALITY_CHIP[m.modality] ?? "info";
                        return (
                          <tr
                            key={m.id}
                            className="hover:bg-ds-surface-container-low transition-colors group/row"
                          >
                            <td className="px-6 py-4">
                              <div className="flex flex-col">
                                <span className="font-mono text-sm font-semibold text-ds-on-surface">
                                  {m.id}
                                </span>
                                {m.description && (
                                  <span className="text-[10px] text-ds-outline font-medium">
                                    {m.description}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                <StatusChip variant={modalityVariant}>{m.modality}</StatusChip>
                                {hasCapability(m, "vision") && (
                                  <StatusChip variant="warning">{t("vision")}</StatusChip>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <span className="text-sm font-semibold text-ds-on-surface-variant">
                                {m.context_window ? (
                                  <>
                                    {m.context_window.toLocaleString()}{" "}
                                    <span className="text-ds-outline font-normal">
                                      {t("tokens")}
                                    </span>
                                  </>
                                ) : (
                                  t("na")
                                )}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              {priceSplit ? (
                                <div className="flex flex-col">
                                  <span className="text-xs font-bold text-ds-on-surface">
                                    {priceSplit.input}{" "}
                                    <span className="text-ds-outline font-normal">
                                      {m.pricing.unit === "call" ? t("perImage") : t("per1mInput")}
                                    </span>
                                  </span>
                                  {m.pricing.unit !== "call" && (
                                    <span className="text-xs font-bold text-ds-on-surface">
                                      {priceSplit.output}{" "}
                                      <span className="text-ds-outline font-normal">
                                        {t("per1mOutput")}
                                      </span>
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-xs font-bold text-ds-status-success">
                                  {t("free")}
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-right" />
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {hasMore && (
                    <div className="px-6 py-3 border-t border-ds-outline-variant/5">
                      <button
                        onClick={() =>
                          setShowAllModels((prev) => {
                            const next = new Set(prev);
                            next.add(group.brand);
                            return next;
                          })
                        }
                        className="w-full py-2 text-xs font-bold text-ds-primary hover:underline"
                      >
                        {t("showAll", { count: group.models.length })}
                      </button>
                    </div>
                  )}
                </TableCard>
              )}
            </div>
          );
        })}
        {grouped.length === 0 && (
          <div className="text-center py-12 text-ds-outline">{t("noModelsFound")}</div>
        )}
      </div>

      {/* BL-121: "show all" button expands every brand at once; hidden when fully expanded. */}
      {totalModels > 0 && hasExpandableBrands && !allBrandsFullyExpanded && (
        <div className="pt-8 flex justify-center">
          <button
            type="button"
            onClick={expandAllBrands}
            data-testid="models-show-all"
            className="flex items-center gap-2 px-10 py-3 bg-ds-surface-container-low text-ds-primary font-bold rounded-xl hover:bg-ds-surface-container-high transition-all border border-ds-primary/10"
          >
            {t("showAllTotal", { count: totalModels })}
            <span className="material-symbols-outlined">expand_more</span>
          </button>
        </div>
      )}
    </PageContainer>
  );
}
