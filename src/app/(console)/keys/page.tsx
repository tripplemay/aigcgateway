"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useProject } from "@/hooks/use-project";
import { useAsyncData } from "@/hooks/use-async-data";
import { toast } from "sonner";
import { timeAgo } from "@/lib/utils";
import { EmptyState } from "@/components/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { SearchBar } from "@/components/search-bar";
import { Pagination } from "@/components/pagination";
import { CreateKeyDialog } from "@/components/keys/create-key-dialog";
import { RevokeKeyDialog } from "@/components/keys/revoke-key-dialog";
import Link from "next/link";

// ============================================================
// Types
// ============================================================

interface ApiKeyRow {
  id: string;
  keyPrefix: string;
  maskedKey: string;
  name: string | null;
  status: string;
  lastUsedAt: string | null;
  createdAt: string;
}

const PAGE_SIZE = 5;

// ============================================================
// Component
// ============================================================

export default function KeysPage() {
  const t = useTranslations("keys");
  const tc = useTranslations("common");
  const { current, loading: projLoading } = useProject();

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  // Create dialog state
  const [createOpen, setCreateOpen] = useState(false);

  // Revoke dialog state
  const [revokeId, setRevokeId] = useState<string | null>(null);

  // ── Data loading via useAsyncData ──
  const {
    data: keysData,
    loading,
    refetch,
  } = useAsyncData<{ data: ApiKeyRow[] }>(async () => {
    if (!current) return { data: [] };
    return apiFetch<{ data: ApiKeyRow[] }>(`/api/projects/${current.id}/keys`);
  }, [current]);

  const keys = keysData?.data ?? [];

  // Client-side filtering + pagination
  const normalizedSearch = search.trim().toLowerCase();
  const filtered = normalizedSearch
    ? keys.filter(
        (k) =>
          (k.name ?? "").toLowerCase().includes(normalizedSearch) ||
          k.maskedKey.toLowerCase().includes(normalizedSearch),
      )
    : keys;

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageKeys = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const activeCount = keys.filter((k) => k.status === "ACTIVE").length;

  const copyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    toast.success(tc("copied"));
  };

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  // ── Loading & empty states ──
  if (projLoading)
    return (
      <div className="space-y-4 pt-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  if (!current) return <EmptyState onCreated={() => window.location.reload()} />;

  // ── Render — 1:1 replica of design-draft/keys/code.html lines 187-415 ──
  return (
    <>
      <div className="max-w-7xl mx-auto space-y-8">
        {/* ═══ Page Header — code.html lines 190-198 ═══ */}
        <div className="flex items-end justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2 py-0.5 bg-ds-primary-fixed text-ds-on-primary-fixed-variant text-[10px] font-black rounded uppercase tracking-tighter">
                {t("infrastructureSecurity")}
              </span>
            </div>
            <h1 className="text-4xl font-extrabold tracking-tighter text-ds-on-surface font-[var(--font-heading)]">
              {t("title")}
            </h1>
            <p className="text-ds-on-surface-variant text-sm mt-1">{t("subtitle")}</p>
          </div>
        </div>

        {/* ═══ Premium Stats Section — code.html lines 200-230 ═══ */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1: Active Infrastructure */}
          <div className="p-6 rounded-2xl bg-ds-surface-container-lowest border-l-4 border-ds-primary shadow-sm flex justify-between items-center group hover:bg-ds-surface-container transition-all duration-300">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">
                {t("activeInfrastructure")}
              </p>
              <h2 className="text-4xl font-black tracking-tighter text-ds-on-surface font-[var(--font-heading)]">
                {activeCount}{" "}
                <span className="text-slate-300 font-light text-2xl">/ {keys.length} keys</span>
              </h2>
            </div>
            <div className="w-12 h-12 rounded-xl bg-ds-primary/5 flex items-center justify-center text-ds-primary">
              <span
                className="material-symbols-outlined text-3xl"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                developer_board
              </span>
            </div>
          </div>
          {/* Card 2: Daily Capacity */}
          <div className="p-6 rounded-2xl bg-ds-surface-container-lowest border-l-4 border-ds-tertiary shadow-sm flex justify-between items-center group hover:bg-ds-surface-container transition-all duration-300">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">
                {t("dailyCapacity")}
              </p>
              <h2 className="text-4xl font-black tracking-tighter text-ds-on-surface font-[var(--font-heading)]">
                1,000,000 <span className="text-slate-300 font-light text-2xl">req</span>
              </h2>
            </div>
            <div className="w-12 h-12 rounded-xl bg-ds-tertiary/5 flex items-center justify-center text-ds-tertiary">
              <span
                className="material-symbols-outlined text-3xl"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                speed
              </span>
            </div>
          </div>
          {/* Card 3: Quick Action CTA */}
          <div className="p-6 rounded-2xl bg-ds-primary text-ds-on-primary shadow-xl shadow-ds-primary/10 relative overflow-hidden flex flex-col justify-between">
            <div className="absolute -right-4 -top-4 w-24 h-24 bg-white/10 rounded-full blur-2xl" />
            <div>
              <p className="text-[10px] uppercase tracking-widest opacity-80 font-bold">
                {t("quickAction")}
              </p>
              <h3 className="text-xl font-bold mt-1 font-[var(--font-heading)]">
                {t("generateNewKey")}
              </h3>
            </div>
            <button
              onClick={() => setCreateOpen(true)}
              className="mt-4 w-full py-2.5 bg-white text-ds-primary font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-indigo-50 transition-all scale-95 active:scale-100 duration-150"
            >
              <span className="material-symbols-outlined">add</span>
              <span>{t("createKey")}</span>
            </button>
          </div>
        </section>

        {/* ═══ Key Management Table — code.html lines 232-355 ═══ */}
        <section className="bg-ds-surface-container-lowest rounded-2xl shadow-sm border border-slate-200/5 overflow-hidden">
          {/* Table header bar */}
          <div className="px-6 py-5 flex justify-between items-center border-b border-ds-outline-variant/10">
            <h3 className="text-lg font-extrabold tracking-tight font-[var(--font-heading)]">
              {t("activeKeys")}
            </h3>
            <SearchBar
              placeholder={t("searchKeys")}
              value={search}
              onChange={handleSearchChange}
              className="w-64"
            />
          </div>
          {/* Table */}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="px-6 py-4">{t("nameAndProject")}</TableHead>
                <TableHead className="px-6 py-4">{t("accessKey")}</TableHead>
                <TableHead className="px-6 py-4">{t("created")}</TableHead>
                <TableHead className="px-6 py-4">{t("lastUsed")}</TableHead>
                <TableHead className="px-6 py-4 text-center">{t("status")}</TableHead>
                <TableHead className="px-6 py-4 text-right">{t("actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-ds-outline-variant/10">
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="px-6 py-12 text-center text-ds-outline">
                    {tc("loading")}
                  </TableCell>
                </TableRow>
              ) : pageKeys.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="px-6 py-12 text-center text-ds-outline">
                    {t("noKeysFound")}
                  </TableCell>
                </TableRow>
              ) : (
                pageKeys.map((k) => (
                  <TableRow key={k.id}>
                    {/* Name & Project */}
                    <TableCell className="px-6 py-5">
                      <div className="font-bold text-ds-on-surface text-sm">
                        {k.name ?? t("unnamedKey")}
                      </div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                        {t("project")}: {current.name}
                      </div>
                    </TableCell>
                    {/* Access Key — masked with copy button for active keys */}
                    <TableCell className="px-6 py-5">
                      <div
                        className={`flex items-center gap-2 font-mono text-xs bg-ds-surface-container-low px-2 py-1 rounded ${k.status === "REVOKED" ? "text-slate-400 opacity-60" : "text-slate-600"}`}
                      >
                        <span>{k.maskedKey}</span>
                        {k.status === "ACTIVE" && (
                          <button
                            onClick={() => copyKey(k.maskedKey)}
                            className="p-1 hover:bg-ds-primary-fixed rounded transition-colors text-ds-primary"
                          >
                            <span className="material-symbols-outlined text-sm">content_copy</span>
                          </button>
                        )}
                      </div>
                    </TableCell>
                    {/* Created */}
                    <TableCell className="px-6 py-5 text-xs text-slate-500 font-medium">
                      {new Date(k.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </TableCell>
                    {/* Last Used */}
                    <TableCell className="px-6 py-5 text-xs text-slate-500 font-medium">
                      {k.lastUsedAt ? timeAgo(k.lastUsedAt) : tc("never")}
                    </TableCell>
                    {/* Status */}
                    <TableCell className="px-6 py-5 text-center">
                      {k.status === "ACTIVE" ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black bg-green-50 text-green-700 border border-green-200 uppercase tracking-tighter">
                          {t("active")}
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black bg-slate-100 text-slate-500 border border-slate-200 uppercase tracking-tighter">
                          {t("revoked")}
                        </span>
                      )}
                    </TableCell>
                    {/* Actions */}
                    <TableCell className="px-6 py-5 text-right">
                      <div className="flex justify-end gap-1">
                        {k.status === "ACTIVE" ? (
                          <>
                            <Link
                              href={`/keys/${k.id}`}
                              className="p-2 text-slate-400 hover:text-ds-primary hover:bg-ds-primary/5 rounded-lg transition-all"
                            >
                              <span className="material-symbols-outlined text-lg">edit</span>
                            </Link>
                            <button
                              onClick={() => setRevokeId(k.id)}
                              className="p-2 text-slate-400 hover:text-ds-error hover:bg-ds-error/5 rounded-lg transition-all"
                            >
                              <span className="material-symbols-outlined text-lg">block</span>
                            </button>
                          </>
                        ) : (
                          <>
                            <button className="p-2 text-slate-400 hover:text-ds-primary hover:bg-ds-primary/5 rounded-lg transition-all">
                              <span className="material-symbols-outlined text-lg">history</span>
                            </button>
                            <button className="p-2 text-slate-400 hover:text-ds-error hover:bg-ds-error/5 rounded-lg transition-all">
                              <span className="material-symbols-outlined text-lg">delete</span>
                            </button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          {/* Pagination */}
          {filtered.length > 0 && (
            <Pagination
              page={safePage}
              totalPages={totalPages}
              onPageChange={setPage}
              total={filtered.length}
              pageSize={PAGE_SIZE}
              className="px-6 py-4 bg-ds-surface-container-high/30 border-t border-ds-outline-variant/10"
            />
          )}
        </section>

        {/* ═══ Security Best Practices — code.html lines 357-391 ═══ */}
        <section className="space-y-6 pt-4">
          <div className="mb-2">
            <h3 className="text-2xl font-black tracking-tighter text-ds-on-surface font-[var(--font-heading)]">
              {t("securityBestPractices")}
            </h3>
            <p className="text-sm text-slate-500 mt-1">{t("securitySubtitle")}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 rounded-2xl bg-ds-surface-container-lowest border border-slate-200/5 shadow-sm flex gap-4 transition-transform hover:scale-[1.02]">
              <div className="w-12 h-12 shrink-0 rounded-xl bg-ds-primary/5 flex items-center justify-center text-ds-primary">
                <span className="material-symbols-outlined text-2xl">lock</span>
              </div>
              <div>
                <h4 className="font-black text-ds-on-surface mb-1 font-[var(--font-heading)]">
                  {t("neverHardcode")}
                </h4>
                <p className="text-xs text-slate-500 leading-relaxed font-medium">
                  {t("neverHardcodeDesc")}
                </p>
              </div>
            </div>
            <div className="p-6 rounded-2xl bg-ds-surface-container-lowest border border-slate-200/5 shadow-sm flex gap-4 transition-transform hover:scale-[1.02]">
              <div className="w-12 h-12 shrink-0 rounded-xl bg-ds-tertiary/5 flex items-center justify-center text-ds-tertiary">
                <span className="material-symbols-outlined text-2xl">autorenew</span>
              </div>
              <div>
                <h4 className="font-black text-ds-on-surface mb-1 font-[var(--font-heading)]">
                  {t("rotateKeys")}
                </h4>
                <p className="text-xs text-slate-500 leading-relaxed font-medium">
                  {t("rotateKeysDesc")}
                </p>
              </div>
            </div>
            <div className="p-6 rounded-2xl bg-ds-surface-container-lowest border border-slate-200/5 shadow-sm flex gap-4 transition-transform hover:scale-[1.02]">
              <div className="w-12 h-12 shrink-0 rounded-xl bg-ds-secondary/5 flex items-center justify-center text-ds-secondary">
                <span className="material-symbols-outlined text-2xl">policy</span>
              </div>
              <div>
                <h4 className="font-black text-ds-on-surface mb-1 font-[var(--font-heading)]">
                  {t("leastPrivilege")}
                </h4>
                <p className="text-xs text-slate-500 leading-relaxed font-medium">
                  {t("leastPrivilegeDesc")}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ═══ Footer — code.html lines 393-406 ═══ */}
        <footer className="py-12 border-t border-ds-outline-variant/10">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6 text-[10px] text-slate-400 font-bold uppercase tracking-widest">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-sm">verified_user</span>
              <span>AIGC Gateway Security v4.2.1-stable</span>
            </div>
            <div className="flex gap-8">
              <button
                className="hover:text-ds-primary transition-colors"
                onClick={() => toast.info(t("comingSoon"))}
              >
                Privacy Policy
              </button>
              <button
                className="hover:text-ds-primary transition-colors"
                onClick={() => toast.info(t("comingSoon"))}
              >
                Terms of Service
              </button>
              <button
                className="hover:text-ds-primary transition-colors"
                onClick={() => toast.info(t("comingSoon"))}
              >
                System Status
              </button>
            </div>
            <p>&copy; 2024 Algorithmic Atelier. All rights reserved.</p>
          </div>
        </footer>
      </div>

      {/* ═══ FAB — code.html lines 411-415 ═══ */}
      <div className="fixed bottom-8 right-8 z-50">
        <button
          onClick={() => setCreateOpen(true)}
          className="w-14 h-14 rounded-2xl bg-ds-primary text-white shadow-2xl shadow-ds-primary/30 flex items-center justify-center hover:scale-110 active:scale-95 transition-all duration-200"
        >
          <span
            className="material-symbols-outlined text-3xl"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            add
          </span>
        </button>
      </div>

      {/* ═══ Create API Key Dialog ═══ */}
      <CreateKeyDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={refetch} />

      {/* ═══ Revoke Confirm Dialog ═══ */}
      <RevokeKeyDialog
        keyId={revokeId}
        onOpenChange={() => setRevokeId(null)}
        onRevoked={refetch}
      />
    </>
  );
}
