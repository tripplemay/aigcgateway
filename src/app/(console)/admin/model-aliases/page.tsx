"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useAsyncData } from "@/hooks/use-async-data";
import { toast } from "sonner";

interface AliasItem {
  id: string;
  alias: string;
  brand: string | null;
  modality: string;
  enabled: boolean;
  linkedModelCount: number;
  activeChannelCount: number;
  createdAt: string;
}

export default function ModelAliasesPage() {
  const t = useTranslations("modelAliases");
  const [newAlias, setNewAlias] = useState("");

  const {
    data: aliasData,
    loading,
    refetch: load,
  } = useAsyncData<{ aliases: AliasItem[] }>(async () => {
    const res = await apiFetch<{ data: AliasItem[] }>("/api/admin/model-aliases");
    return { aliases: res.data };
  }, []);

  const aliases = aliasData?.aliases ?? [];

  const createAlias = async () => {
    const alias = newAlias.trim();
    if (!alias) return;
    try {
      await apiFetch("/api/admin/model-aliases", {
        method: "POST",
        body: JSON.stringify({ alias }),
      });
      toast.success(t("aliasCreated"));
      setNewAlias("");
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

  if (loading) {
    return <div className="p-12 text-center text-ds-on-surface-variant">{t("loading")}</div>;
  }

  return (
    <div className="space-y-10">
      <section>
        <h1 className="text-4xl font-extrabold tracking-tight">{t("title")}</h1>
        <p className="mt-2 text-ds-on-surface-variant text-lg">{t("subtitle")}</p>
      </section>

      {/* Create alias */}
      <section>
        <div className="flex gap-2 max-w-md">
          <input
            className="flex-1 bg-ds-surface-container-low border-none rounded-lg py-2 px-3 text-xs focus:ring-2 focus:ring-ds-primary/20 placeholder:text-ds-on-surface-variant"
            placeholder={t("aliasPlaceholder")}
            value={newAlias}
            onChange={(e) => setNewAlias(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createAlias()}
          />
          <button
            className="bg-ds-primary text-ds-on-primary text-xs font-bold px-4 py-2 rounded-lg hover:opacity-90 transition-all active:scale-95"
            onClick={createAlias}
          >
            {t("add")}
          </button>
        </div>
      </section>

      {/* Alias list */}
      <section>
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xs font-bold uppercase tracking-[0.15em] text-ds-primary flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-ds-primary" />
            {t("classifiedModels")}
          </h3>
          <span className="text-[11px] font-semibold bg-ds-primary/10 text-ds-primary px-2.5 py-1 rounded-full">
            {aliases.length} aliases
          </span>
        </div>
        {aliases.length === 0 ? (
          <p className="text-ds-on-surface-variant">{t("noAliases")}</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {aliases.map((a) => (
              <div
                key={a.id}
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
                      <h4 className="font-bold text-lg leading-tight">{a.alias}</h4>
                      <p className="text-[10px] font-bold text-ds-on-surface-variant uppercase tracking-wider">
                        {a.brand ?? "Unknown"} · {a.modality} · {a.linkedModelCount} models · {a.activeChannelCount} channels
                      </p>
                    </div>
                  </div>
                  <button
                    className="text-ds-on-surface-variant hover:text-ds-error transition-colors"
                    onClick={() => deleteAlias(a.id)}
                  >
                    <span className="material-symbols-outlined">delete</span>
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-block w-2 h-2 rounded-full ${a.enabled ? "bg-green-500" : "bg-ds-on-surface-variant/30"}`}
                  />
                  <span className="text-[11px] font-medium text-ds-on-surface-variant">
                    {a.enabled ? "Enabled" : "Disabled"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
