"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useAsyncData } from "@/hooks/use-async-data";
import { Input } from "@/components/ui/input";
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

  const { data: aliasData, loading, refetch: load } = useAsyncData<AliasData>(async () => {
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
    return <div className="p-12 text-center text-muted-foreground">{t("loading")}</div>;
  }

  const groupEntries = Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="space-y-10">
      {/* Header */}
      <section>
        <h1 className="text-4xl font-extrabold tracking-tight">{t("title")}</h1>
        <p className="mt-2 text-muted-foreground text-lg">{t("subtitle")}</p>
      </section>

      {/* Classified models */}
      <section>
        <h2 className="text-xl font-bold mb-4">{t("classifiedModels")}</h2>
        {groupEntries.length === 0 ? (
          <p className="text-muted-foreground">{t("noAliases")}</p>
        ) : (
          <div className="space-y-4">
            {groupEntries.map(([modelName, aliases]) => (
              <div key={modelName} className="bg-card rounded-xl border p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="material-symbols-outlined text-primary text-lg">link</span>
                  <span className="font-bold text-sm">{modelName}</span>
                  <span className="text-xs text-muted-foreground">
                    ({aliases.length} {aliases.length === 1 ? "alias" : "aliases"})
                  </span>
                </div>
                <div className="space-y-1 ml-7">
                  {aliases.map((a) => (
                    <div key={a.id} className="flex items-center gap-2 text-sm">
                      <code className="bg-muted px-2 py-0.5 rounded text-xs">{a.alias}</code>
                      <button
                        className="text-red-500 hover:text-red-700 text-xs"
                        onClick={() => deleteAlias(a.id)}
                      >
                        {t("delete")}
                      </button>
                    </div>
                  ))}
                  <div className="flex items-center gap-2 mt-2">
                    <Input
                      placeholder={t("addAlias")}
                      className="h-8 w-64 text-xs"
                      value={newAliasInputs[modelName] ?? ""}
                      onChange={(e) =>
                        setNewAliasInputs((prev) => ({ ...prev, [modelName]: e.target.value }))
                      }
                      onKeyDown={(e) => e.key === "Enter" && addAlias(modelName)}
                    />
                    <button
                      className="text-primary text-xs font-bold"
                      onClick={() => addAlias(modelName)}
                    >
                      {t("add")}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Unclassified models */}
      <section>
        <h2 className="text-xl font-bold mb-2">{t("unclassifiedModels")}</h2>
        <p className="text-sm text-muted-foreground mb-4">{t("unclassifiedDesc")}</p>
        {unclassified.length === 0 ? (
          <p className="text-muted-foreground">{t("noUnclassified")}</p>
        ) : (
          <div className="bg-card rounded-xl border overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-muted/30">
                  <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    Model
                  </th>
                  <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    Modality
                  </th>
                  <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    Channels
                  </th>
                  <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {unclassified.map((m) => (
                  <tr key={m.id} className="hover:bg-muted/10">
                    <td className="px-4 py-3">
                      <span className="font-bold text-sm">{m.name}</span>
                      <span className="text-xs text-muted-foreground ml-2">{m.displayName}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[10px] font-bold px-2 py-1 rounded-md bg-primary/10 text-primary">
                        {m.modality}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs">{m.channelCount}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <select
                          className="border rounded px-2 py-1 text-xs min-w-[160px]"
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
                          className="text-primary text-xs font-bold disabled:opacity-50"
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
