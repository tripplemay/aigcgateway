"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useProject } from "@/hooks/use-project";
import { useParams, useRouter } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { toast } from "sonner";
import Link from "next/link";

interface KeyDetail {
  id: string;
  keyPrefix: string;
  maskedKey: string;
  name: string | null;
  description: string | null;
  status: string;
  permissions: Record<string, boolean>;
  expiresAt: string | null;
  rateLimit: number | null;
  ipWhitelist: string[] | null;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const PERM_ITEMS = [
  { key: "chatCompletion", label: "Chat Completion", desc: "Execute LLM queries" },
  { key: "imageGeneration", label: "Image Generation", desc: "DALL-E & Stable Diffusion" },
  { key: "logAccess", label: "Log Access", desc: "View request history" },
  { key: "projectInfo", label: "Project Info", desc: "Read metadata" },
] as const;

export default function KeySettingsPage() {
  const t = useTranslations("keys");
  const tc = useTranslations("common");
  const { current, loading: projLoading } = useProject();
  const params = useParams<{ keyId: string }>();
  const router = useRouter();
  const [detail, setDetail] = useState<KeyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Editable fields
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [rateLimit, setRateLimit] = useState("");
  const [ipWhitelist, setIpWhitelist] = useState("");

  useEffect(() => {
    if (!current || !params.keyId) return;
    setLoading(true);
    apiFetch<{ data: KeyDetail }>(`/api/projects/${current.id}/keys/${params.keyId}`)
      .then((r) => {
        setDetail(r.data);
        setName(r.data.name ?? "");
        setDescription(r.data.description ?? "");
        setPermissions(r.data.permissions ?? {});
        setRateLimit(r.data.rateLimit != null ? String(r.data.rateLimit) : "");
        setIpWhitelist((r.data.ipWhitelist ?? []).join("\n"));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [current, params.keyId]);

  const save = async () => {
    if (!current || !params.keyId) return;
    setSaving(true);
    try {
      const ipArr = ipWhitelist.trim() ? ipWhitelist.split("\n").map((s) => s.trim()).filter(Boolean) : null;
      await apiFetch(`/api/projects/${current.id}/keys/${params.keyId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: name || null,
          description: description || null,
          permissions,
          rateLimit: rateLimit ? Number(rateLimit) : null,
          ipWhitelist: ipArr,
        }),
      });
      toast.success("Saved");
    } catch (e) {
      toast.error((e as Error).message);
    }
    setSaving(false);
  };

  const revokeKey = async () => {
    if (!current || !params.keyId) return;
    if (!confirm("Are you sure? This action cannot be undone.")) return;
    try {
      await apiFetch(`/api/projects/${current.id}/keys/${params.keyId}`, { method: "DELETE" });
      toast.success("Key revoked");
      router.push("/keys");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const togglePerm = (key: string) => {
    setPermissions((prev) => {
      const current = prev[key];
      // undefined/true → false, false → true (remove from object to mean "allowed")
      if (current === false) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: false };
    });
  };

  if (projLoading || loading) return (<div className="space-y-4 pt-4"><Skeleton className="h-8 w-64" /><Skeleton className="h-32 w-full" /><Skeleton className="h-64 w-full" /></div>);
  if (!current) return <EmptyState onCreated={() => window.location.reload()} />;
  if (!detail) return <div className="text-center py-20 text-ds-outline">Key not found</div>;

  const isRevoked = detail.status === "REVOKED";

  // ── Render — 1:1 replica of API Key Settings code.html lines 160-316 ──
  return (
    <div className="max-w-5xl mx-auto">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm mb-6">
        <Link href="/keys" className="text-ds-on-surface-variant/60 hover:text-ds-primary transition-colors">API Keys</Link>
        <span className="text-ds-outline-variant">/</span>
        <span className="text-ds-primary/80 font-medium">{detail.name ?? detail.maskedKey}</span>
      </nav>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* ═══ Left Column: Core Settings — code.html lines 163-259 ═══ */}
        <div className="lg:col-span-2 space-y-8">
          {/* General Info */}
          <section className="bg-ds-surface-container-lowest rounded-xl p-6 shadow-sm ring-1 ring-ds-primary/5">
            <div className="flex items-center gap-2 mb-6">
              <span className="material-symbols-outlined text-ds-primary" style={{ fontVariationSettings: "'FILL' 1" }}>badge</span>
              <h3 className="font-[var(--font-heading)] font-bold text-lg">General Information</h3>
            </div>
            <div className="space-y-6">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-ds-on-surface-variant/60 mb-2">Key Name</label>
                <input className="w-full bg-ds-surface-container-low border-0 border-b-2 border-ds-outline-variant/30 focus:border-ds-primary focus:ring-0 px-0 py-3 text-ds-on-surface font-medium transition-all outline-none" placeholder="Enter key name..." value={name} onChange={(e) => setName(e.target.value)} disabled={isRevoked} />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-ds-on-surface-variant/60 mb-2">Description</label>
                <textarea className="w-full bg-ds-surface-container-low border-0 border-b-2 border-ds-outline-variant/30 focus:border-ds-primary focus:ring-0 px-0 py-3 text-ds-on-surface font-medium transition-all resize-none outline-none" rows={3} placeholder="Describe this key's usage..." value={description} onChange={(e) => setDescription(e.target.value)} disabled={isRevoked} />
              </div>
            </div>
          </section>

          {/* Permissions */}
          <section className="bg-ds-surface-container-lowest rounded-xl p-6 shadow-sm ring-1 ring-ds-primary/5">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-ds-primary" style={{ fontVariationSettings: "'FILL' 1" }}>shield_person</span>
                <h3 className="font-[var(--font-heading)] font-bold text-lg">Permissions</h3>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {PERM_ITEMS.map((perm) => {
                const enabled = permissions[perm.key] !== false;
                return (
                  <div key={perm.key} className={`flex items-center justify-between p-4 bg-ds-surface-container-low rounded-xl hover:bg-ds-surface-container-high transition-colors ${!enabled ? "opacity-60" : ""}`}>
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-ds-on-surface">{perm.label}</span>
                      <span className="text-[11px] text-ds-on-surface-variant/70">{perm.desc}</span>
                    </div>
                    <button onClick={() => !isRevoked && togglePerm(perm.key)} disabled={isRevoked} className={`w-11 h-6 rounded-full relative transition-colors ${enabled ? "bg-ds-primary" : "bg-ds-outline-variant"}`}>
                      <span className={`absolute top-[2px] w-5 h-5 bg-white rounded-full transition-all ${enabled ? "left-[22px]" : "left-[2px]"}`} />
                    </button>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Security & Limits */}
          <section className="bg-ds-surface-container-lowest rounded-xl p-6 shadow-sm ring-1 ring-ds-primary/5">
            <div className="flex items-center gap-2 mb-6">
              <span className="material-symbols-outlined text-ds-primary" style={{ fontVariationSettings: "'FILL' 1" }}>lock_reset</span>
              <h3 className="font-[var(--font-heading)] font-bold text-lg">Security & Limits</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-ds-on-surface-variant/60 mb-2">Rate Limit (RPM)</label>
                <div className="flex items-center gap-4">
                  <input className="flex-1 bg-ds-surface-container-low border-0 border-b-2 border-ds-outline-variant/30 focus:border-ds-primary focus:ring-0 px-0 py-3 text-ds-on-surface font-medium transition-all outline-none" type="number" value={rateLimit} onChange={(e) => setRateLimit(e.target.value)} placeholder="—" disabled={isRevoked} />
                  <span className="text-xs text-ds-on-surface-variant/60 font-semibold italic">Req/Min</span>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-ds-on-surface-variant/60 mb-2">IP Whitelist</label>
                <textarea className="w-full text-sm font-mono bg-ds-surface-container-low border-0 border-b-2 border-ds-outline-variant/30 focus:border-ds-primary focus:ring-0 px-2 py-3 text-ds-on-surface transition-all resize-none outline-none" rows={4} placeholder={"192.168.1.1\n10.0.0.1"} value={ipWhitelist} onChange={(e) => setIpWhitelist(e.target.value)} disabled={isRevoked} />
                <p className="mt-2 text-[10px] text-ds-on-surface-variant/50">One IP or CIDR per line. Empty = no restriction.</p>
              </div>
            </div>
          </section>
        </div>

        {/* ═══ Right Column — code.html lines 262-315 ═══ */}
        <div className="space-y-8">
          {/* Key Status */}
          <section className="bg-ds-surface-container-lowest rounded-xl p-6 shadow-sm ring-1 ring-ds-primary/5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-[var(--font-heading)] font-bold text-lg">Key Status</h3>
              {!isRevoked && (
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-ds-secondary opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-ds-secondary" />
                </span>
              )}
            </div>
            <div className={`flex items-center justify-between p-4 rounded-xl border ${isRevoked ? "bg-ds-error/5 border-ds-error/10" : "bg-ds-primary/5 border-ds-primary/10"}`}>
              <div className="flex flex-col">
                <span className={`text-sm font-bold uppercase tracking-tighter ${isRevoked ? "text-ds-error" : "text-ds-primary"}`}>{detail.status}</span>
                <span className="text-[11px] text-ds-on-surface-variant/70">{isRevoked ? "Permanently revoked" : "Ready for requests"}</span>
              </div>
            </div>
          </section>

          {/* API Key Exposure */}
          <section className="bg-ds-surface-container-lowest rounded-xl p-6 shadow-sm ring-1 ring-ds-primary/5">
            <h3 className="font-[var(--font-heading)] font-bold text-lg mb-4">API Key</h3>
            <div className="relative">
              <input className="w-full bg-ds-surface-container-low border-0 rounded-lg pl-4 pr-12 py-3 text-sm font-mono text-ds-on-surface-variant" readOnly value={detail.maskedKey} />
              <button onClick={() => { navigator.clipboard.writeText(detail.maskedKey); toast.success("Copied"); }} className="absolute right-2 top-1/2 -translate-y-1/2 p-2 hover:bg-ds-surface-container-high rounded-md text-ds-primary transition-colors">
                <span className="material-symbols-outlined text-[20px]">content_copy</span>
              </button>
            </div>
            <div className="mt-4 p-3 bg-ds-tertiary-fixed/30 rounded-lg flex gap-3">
              <span className="material-symbols-outlined text-ds-tertiary text-[20px]">warning</span>
              <p className="text-[11px] text-ds-on-surface-variant leading-snug">Never share your API key in publicly accessible areas.</p>
            </div>
            {!isRevoked && (
              <button onClick={save} disabled={saving} className="w-full mt-6 py-3 px-4 bg-ds-primary text-white font-bold rounded-xl text-sm hover:opacity-90 transition-all shadow-md shadow-ds-primary/20 flex items-center justify-center gap-2 disabled:opacity-50">
                <span>{saving ? "Saving..." : "Save Changes"}</span>
                <span className="material-symbols-outlined text-[18px]">save</span>
              </button>
            )}
          </section>

          {/* Danger Zone */}
          {!isRevoked && (
            <section className="bg-ds-surface-container-low rounded-xl p-6 ring-1 ring-ds-error/20">
              <div className="flex items-center gap-2 mb-4 text-ds-error">
                <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>dangerous</span>
                <h3 className="font-[var(--font-heading)] font-bold text-lg">Danger Zone</h3>
              </div>
              <p className="text-xs text-ds-on-surface-variant leading-relaxed mb-6">
                Revoking this API key is permanent. All applications using this key will stop functioning immediately.
              </p>
              <button onClick={revokeKey} className="w-full py-3 px-4 border-2 border-ds-error/20 text-ds-error font-bold rounded-xl text-sm hover:bg-ds-error hover:text-white transition-all flex items-center justify-center gap-2">
                <span className="material-symbols-outlined text-[18px]">delete</span>
                <span>Revoke API Key</span>
              </button>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
