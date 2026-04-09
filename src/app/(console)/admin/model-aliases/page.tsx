"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useAsyncData } from "@/hooks/use-async-data";
import { toast } from "sonner";

interface AliasItem {
  id: string;
  alias: string;
  createdAt: string;
}

interface UnclassifiedModel {
  id: string;
  name: string;
  displayName: string;
  modality: string;
  channelCount: number;
}

export default function ModelAliasesPage() {
  const t = useTranslations("modelAliases");

  const [newAliasInputs, setNewAliasInputs] = useState<Record<string, string>>({});
  const [mergeTargets, setMergeTargets] = useState<Record<string, string>>({});

  // ── Data loading via useAsyncData ──
  interface AliasData {
    grouped: Record<string, AliasItem[]>;
    unclassified: UnclassifiedModel[];
    allModels: { name: string }[];
  }

  const {
    data: aliasData,
    loading,
    refetch: load,
  } = useAsyncData<AliasData>(async () => {
    const [aliasRes, modelsRes] = await Promise.all([
      apiFetch<{ data: Record<string, AliasItem[]> }>("/api/admin/model-aliases"),
      apiFetch<{
        data: Array<{
          id: string;
          name: string;
          displayName: string;
          modality: string;
          enabled: boolean;
          channelCount: number;
          activeChannelCount: number;
        }>;
      }>("/api/admin/models"),
    ]);

    const grouped = aliasRes.data;
    const allModels = modelsRes.data.map((m) => ({ name: m.name }));

    const aliasModelNames = new Set(Object.keys(grouped));
    const allAliasValues = new Set<string>();
    for (const items of Object.values(grouped)) {
      for (const item of items) allAliasValues.add(item.alias);
    }

    const unclassified = modelsRes.data
      .filter((m) => !m.enabled && !aliasModelNames.has(m.name) && !allAliasValues.has(m.name))
      .map((m) => ({
        id: m.id,
        name: m.name,
        displayName: m.displayName,
        modality: m.modality,
        channelCount: m.channelCount,
      }));

    return { grouped, unclassified, allModels };
  }, []);

  const grouped = aliasData?.grouped ?? {};
  const unclassified = aliasData?.unclassified ?? [];
  const allModels = aliasData?.allModels ?? [];

  const addAlias = async (modelName: string) => {
    const alias = newAliasInputs[modelName]?.trim();
    if (!alias) return;
    try {
      await apiFetch("/api/admin/model-aliases", {
        method: "POST",
        body: JSON.stringify({ alias, modelName }),
      });
      toast.success(t("aliasCreated"));
      setNewAliasInputs((prev) => ({ ...prev, [modelName]: "" }));
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const deleteAlias = async (id: string) => {
    try {
      await apiFetch(`/api/admin/model-aliases/${id}`, { method: "DELETE" });
      toast.success(t("aliasDeleted"));
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const mergeModel = async (sourceModelId: string) => {
    const targetModelName = mergeTargets[sourceModelId];
    if (!targetModelName) return;
    try {
      const res = await apiFetch<{ merged: { channelsMigrated: number } }>(
        "/api/admin/model-aliases/merge",
        { method: "POST", body: JSON.stringify({ sourceModelId, targetModelName }) },
      );
      toast.success(t("mergeDone", { channels: res.merged.channelsMigrated }));
      setMergeTargets((prev) => ({ ...prev, [sourceModelId]: "" }));
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  if (loading) {
    return <div className="p-12 text-center text-ds-on-surface-variant">{t("loading")}</div>;
  }

  const groupEntries = Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="space-y-10">
      {/* Header */}
      <section>
        <h1 className="text-4xl font-extrabold tracking-tight">{t("title")}</h1>
        <p className="mt-2 text-ds-on-surface-variant text-lg">{t("subtitle")}</p>
      </section>

      {/* Classified models */}
      <section>
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xs font-bold uppercase tracking-[0.15em] text-ds-primary flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-ds-primary" />
            {t("classifiedModels")}
          </h3>
          <span className="text-[11px] font-semibold bg-ds-primary/10 text-ds-primary px-2.5 py-1 rounded-full">
            {t("canonicalIdentifiers", { count: groupEntries.length })}
          </span>
        </div>
        {groupEntries.length === 0 ? (
          <p className="text-ds-on-surface-variant">{t("noAliases")}</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {groupEntries.map(([modelName, aliases]) => (
              <div
                key={modelName}
                className="bg-ds-surface-container-lowest rounded-xl p-5 transition-all duration-200 hover:shadow-lg hover:shadow-ds-primary/5"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-ds-surface-container-low flex items-center justify-center text-ds-primary">
                      <span
                        className="material-symbols-outlined"
                        style={{ fontVariationSettings: "'FILL' 1" }}
                      >
                        link
                      </span>
                    </div>
                    <div>
                      <h4 className="font-bold text-lg leading-tight">{modelName}</h4>
                      <p className="text-[10px] font-bold text-ds-on-surface-variant uppercase tracking-wider">
                        {t("aliasCount", { count: aliases.length })}
                      </p>
                    </div>
                  </div>
                  <button className="text-ds-on-surface-variant hover:text-ds-primary transition-colors">
                    <span className="material-symbols-outlined">more_vert</span>
                  </button>
                </div>
                <div className="flex flex-wrap gap-2 mb-6">
                  {aliases.map((a) => (
                    <span
                      key={a.id}
                      className="inline-flex items-center gap-1.5 px-3 py-1 bg-ds-surface-container-low text-ds-on-surface-variant rounded-full text-[11px] font-medium transition-colors hover:bg-ds-error-container hover:text-ds-on-error-container cursor-default"
                    >
                      {a.alias}
                      <span
                        className="material-symbols-outlined text-[14px] cursor-pointer"
                        onClick={() => deleteAlias(a.id)}
                      >
                        close
                      </span>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    className="flex-1 bg-ds-surface-container-low border-none rounded-lg py-2 px-3 text-xs focus:ring-2 focus:ring-ds-primary/20 placeholder:text-ds-on-surface-variant"
                    placeholder={t("aliasPlaceholder")}
                    value={newAliasInputs[modelName] ?? ""}
                    onChange={(e) =>
                      setNewAliasInputs((prev) => ({ ...prev, [modelName]: e.target.value }))
                    }
                    onKeyDown={(e) => e.key === "Enter" && addAlias(modelName)}
                  />
                  <button
                    className="bg-ds-primary text-ds-on-primary text-xs font-bold px-4 py-2 rounded-lg hover:opacity-90 transition-all active:scale-95"
                    onClick={() => addAlias(modelName)}
                  >
                    {t("add")}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Unclassified models */}
      <section>
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xs font-bold uppercase tracking-[0.15em] text-ds-tertiary flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-ds-tertiary" />
            {t("unclassifiedModels")}
          </h3>
          <button className="text-[11px] font-bold text-ds-on-surface-variant hover:text-ds-primary transition-colors uppercase tracking-wider">
            {t("scanForNew")}
          </button>
        </div>
        {unclassified.length === 0 ? (
          <p className="text-ds-on-surface-variant">{t("noUnclassified")}</p>
        ) : (
          <div className="bg-ds-surface-container-lowest rounded-xl overflow-hidden shadow-sm">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-ds-surface-container-low/50">
                  <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-ds-on-surface-variant">
                    {t("colModel")}
                  </th>
                  <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-ds-on-surface-variant">
                    {t("colModality")}
                  </th>
                  <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-ds-on-surface-variant">
                    {t("colChannels")}
                  </th>
                  <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-ds-on-surface-variant text-right">
                    {t("colActions")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ds-surface-container-low">
                {unclassified.map((m) => (
                  <tr
                    key={m.id}
                    className="hover:bg-ds-surface-container-low transition-colors group"
                  >
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-ds-surface-container-low flex items-center justify-center text-ds-on-surface-variant group-hover:text-ds-primary transition-colors">
                          <span className="material-symbols-outlined text-lg">question_mark</span>
                        </div>
                        <span className="font-semibold text-sm">{m.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <span
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider ${m.modality === "IMAGE" ? "bg-ds-tertiary-fixed text-ds-on-tertiary-fixed-variant" : "bg-ds-secondary-fixed text-ds-on-secondary-fixed-variant"}`}
                      >
                        {m.modality === "IMAGE" ? t("image") : t("text")}
                      </span>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-1.5 text-xs text-ds-on-surface-variant font-medium">
                        <span className="material-symbols-outlined text-sm">hub</span>
                        {t("nChannels", { count: m.channelCount })}
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex items-center justify-end gap-3">
                        <select
                          className="bg-ds-surface-container-low border-none rounded-lg py-1.5 px-3 text-[11px] font-semibold focus:ring-1 focus:ring-ds-primary/30 min-w-[160px]"
                          value={mergeTargets[m.id] ?? ""}
                          onChange={(e) =>
                            setMergeTargets((prev) => ({ ...prev, [m.id]: e.target.value }))
                          }
                        >
                          <option value="">{t("selectTarget")}</option>
                          {allModels
                            .filter((am) => am.name !== m.name)
                            .map((am) => (
                              <option key={am.name} value={am.name}>
                                {am.name}
                              </option>
                            ))}
                        </select>
                        <button
                          className="bg-ds-primary/10 text-ds-primary hover:bg-ds-primary hover:text-ds-on-primary transition-all px-4 py-1.5 rounded-lg text-xs font-bold disabled:opacity-50"
                          disabled={!mergeTargets[m.id]}
                          onClick={() => mergeModel(m.id)}
                        >
                          {t("merge")}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
