"use client";
import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useProject } from "@/hooks/use-project";
import { useAsyncData } from "@/hooks/use-async-data";
import { EmptyState } from "@/components/empty-state";
import { PageContainer } from "@/components/page-container";
import { PageHeader } from "@/components/page-header";
import { PageLoader } from "@/components/page-loader";
import { TableCard } from "@/components/table-card";
import { TableLoader } from "@/components/table-loader";
import { CTABanner } from "@/components/cta-banner";
import { StatusChip } from "@/components/status-chip";
import { buttonVariants } from "@/components/ui/button";
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
import Link from "next/link";
import { useRouter } from "next/navigation";
import { timeAgo } from "@/lib/utils";

interface ActionRow {
  id: string;
  name: string;
  description: string | null;
  model: string;
  activeVersionId: string | null;
  activeVersion: { id: string; versionNumber: number } | null;
  updatedAt: string;
}

interface ActionsResponse {
  data: ActionRow[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

const PAGE_SIZE = 20;
const COLS = 6;

export default function ActionsPage() {
  const t = useTranslations("actions");
  const locale = useLocale();
  const { current, loading: projLoading } = useProject();
  const router = useRouter();

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const { data: result, loading } = useAsyncData<ActionsResponse>(async () => {
    if (!current)
      return { data: [], pagination: { page: 1, pageSize: PAGE_SIZE, total: 0, totalPages: 1 } };
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (search) params.set("search", search);
    return apiFetch<ActionsResponse>(`/api/projects/${current.id}/actions?${params}`);
  }, [current, page, search]);

  const actions = result?.data ?? [];
  const totalPages = result?.pagination.totalPages ?? 1;
  const total = result?.pagination.total ?? 0;

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  // BL-122: outermost loading guard — never render fake table + CTA banner while fetching.
  if (projLoading)
    return (
      <PageContainer data-testid="actions-loading">
        <PageLoader />
      </PageContainer>
    );
  if (!current) return <EmptyState onCreated={() => window.location.reload()} />;

  const header = (
    <PageHeader
      title={t("title")}
      subtitle={t("subtitle")}
      actions={
        <Link
          href="/actions/new"
          className={buttonVariants({ variant: "gradient-primary", size: "lg" })}
        >
          + {t("create")}
        </Link>
      }
    />
  );

  // BL-122: while the actions list is loading, show header + TableCard with
  // TableLoader rows only, no CTA banner and no fake empty state.
  if (loading && !result) {
    return (
      <PageContainer data-testid="actions-page">
        {header}
        <TableCard title={t("title")}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="px-6 py-4">{t("colActionName")}</TableHead>
                <TableHead className="px-6 py-4">{t("model")}</TableHead>
                <TableHead className="px-6 py-4">{t("version")}</TableHead>
                <TableHead className="px-6 py-4">{t("description")}</TableHead>
                <TableHead className="px-6 py-4">{t("updated")}</TableHead>
                <TableHead className="px-6 py-4 w-10" />
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-ds-outline-variant/10">
              <TableLoader colSpan={COLS} />
            </TableBody>
          </Table>
        </TableCard>
      </PageContainer>
    );
  }

  // First-visit empty (no data, no search) — dedicated empty state, no CTA banner.
  if (actions.length === 0 && !search) {
    return (
      <PageContainer data-testid="actions-page">
        {header}
        <EmptyState
          icon={<span className="material-symbols-outlined text-3xl">bolt</span>}
          title={t("emptyTitle")}
          description={t("emptyDesc")}
          action={
            <Link
              href="/actions/new"
              className={buttonVariants({ variant: "gradient-primary", size: "lg" })}
            >
              + {t("create")}
            </Link>
          }
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer data-testid="actions-page">
      {header}
      <TableCard
        title={t("title")}
        search={
          <SearchBar
            placeholder={t("searchPlaceholder")}
            value={search}
            onChange={handleSearchChange}
            className="w-64"
          />
        }
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="px-6 py-4">{t("colActionName")}</TableHead>
              <TableHead className="px-6 py-4">{t("model")}</TableHead>
              <TableHead className="px-6 py-4">{t("version")}</TableHead>
              <TableHead className="px-6 py-4">{t("description")}</TableHead>
              <TableHead className="px-6 py-4">{t("updated")}</TableHead>
              <TableHead className="px-6 py-4 w-10" />
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-ds-outline-variant/10">
            {loading ? (
              <TableLoader colSpan={COLS} />
            ) : actions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={COLS} className="px-6 py-12 text-center text-ds-outline">
                  {t("emptyTitle")}
                </TableCell>
              </TableRow>
            ) : (
              actions.map((action) => (
                <TableRow
                  key={action.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/actions/${action.id}`)}
                >
                  <TableCell className="px-6 py-5 font-bold text-ds-primary">
                    {action.name}
                  </TableCell>
                  <TableCell className="px-6 py-5 text-sm font-medium text-ds-on-surface-variant">
                    {action.model.split("/").pop()}
                  </TableCell>
                  <TableCell className="px-6 py-5">
                    {action.activeVersion ? (
                      <StatusChip variant="info">v{action.activeVersion.versionNumber}</StatusChip>
                    ) : (
                      <span className="text-slate-400">{"\u2014"}</span>
                    )}
                  </TableCell>
                  <TableCell className="px-6 py-5 text-sm text-slate-500 max-w-[300px] truncate">
                    {action.description || "\u2014"}
                  </TableCell>
                  <TableCell className="px-6 py-5 text-xs text-slate-400">
                    {timeAgo(action.updatedAt, locale)}
                  </TableCell>
                  <TableCell className="px-6 py-5 text-slate-300 group-hover:text-ds-primary transition-colors">
                    <span className="material-symbols-outlined text-xl">chevron_right</span>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        {total > 0 && (
          <Pagination
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
            total={total}
            pageSize={PAGE_SIZE}
            className="px-6 py-4 bg-ds-surface-container-high/30 border-t border-ds-outline-variant/10"
          />
        )}
      </TableCard>

      <CTABanner
        title={t("ctaTitle")}
        description={t("ctaDesc")}
        action={
          <Link
            href="/templates"
            className="px-8 py-4 border-2 border-indigo-500/30 hover:border-indigo-500 hover:bg-indigo-500/10 text-indigo-400 font-bold rounded-xl transition-all active:scale-95 inline-block"
          >
            {t("ctaButton")}
          </Link>
        }
      />
    </PageContainer>
  );
}
