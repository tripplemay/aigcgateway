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
import { SectionCard } from "@/components/section-card";
import { Button, buttonVariants } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { timeAgo } from "@/lib/utils";
import { GlobalLibrary } from "./global-library";

interface TemplateRow {
  id: string;
  name: string;
  description: string | null;
  stepCount: number;
  executionMode: string;
  updatedAt: string;
}

interface TemplatesResponse {
  data: TemplateRow[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

const PAGE_SIZE = 20;
const COLS = 6;

const MODE_STYLE: Record<string, string> = {
  sequential: "bg-ds-primary-container/10 text-ds-primary",
  "fan-out": "bg-ds-tertiary-container/10 text-ds-tertiary",
  single: "bg-ds-surface-container-high text-ds-on-surface-variant",
};

export default function TemplatesPage() {
  const t = useTranslations("templates");
  const locale = useLocale();
  const { current, loading: projLoading } = useProject();
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = searchParams.get("tab") === "library" ? "library" : "my";

  const handleTabChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "library") {
      params.set("tab", "library");
    } else {
      params.delete("tab");
    }
    router.push(`/templates?${params.toString()}`);
  };

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const { data: result, loading } = useAsyncData<TemplatesResponse>(async () => {
    if (!current)
      return { data: [], pagination: { page: 1, pageSize: PAGE_SIZE, total: 0, totalPages: 1 } };
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (search) params.set("search", search);
    return apiFetch<TemplatesResponse>(`/api/projects/${current.id}/templates?${params}`);
  }, [current, page, search]);

  const templates = result?.data ?? [];
  const totalPages = result?.pagination.totalPages ?? 1;
  const total = result?.pagination.total ?? 0;

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const modeBadge = (mode: string) => {
    const labels: Record<string, string> = {
      sequential: t("modeSequential"),
      "fan-out": t("modeFanout"),
      single: t("modeSingle"),
    };
    return (
      <span
        className={`inline-flex items-center px-3 py-1 rounded-lg text-xs font-semibold uppercase tracking-wider ${MODE_STYLE[mode] ?? MODE_STYLE.single}`}
      >
        {labels[mode] ?? mode}
      </span>
    );
  };

  // BL-122: outermost loading guard.
  if (projLoading)
    return (
      <PageContainer data-testid="templates-loading">
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
          href="/templates/new"
          className={buttonVariants({ variant: "gradient-primary", size: "lg" })}
        >
          <span className="material-symbols-outlined text-lg">add_circle</span>
          {t("create")}
        </Link>
      }
    />
  );

  // BL-123: hand-rolled pill tabs aligned with settings/page.tsx visual.
  const TabPills = (
    <div
      className="flex gap-1 bg-ds-surface-container-low rounded-xl p-1 w-fit"
      data-testid="templates-pill-tabs"
    >
      {(["my", "library"] as const).map((tab) => (
        <button
          key={tab}
          onClick={() => handleTabChange(tab)}
          className={cn(
            "px-5 py-2 rounded-lg text-sm font-bold font-[var(--font-heading)] transition-all flex items-center",
            activeTab === tab
              ? "bg-ds-surface-container-lowest shadow-sm text-ds-primary"
              : "text-ds-on-surface-variant hover:text-ds-on-surface",
          )}
        >
          <span className="material-symbols-outlined text-base mr-1.5">
            {tab === "my" ? "folder_shared" : "public"}
          </span>
          {t(tab === "my" ? "tabMyTemplates" : "tabGlobalLibrary")}
        </button>
      ))}
    </div>
  );

  return (
    <PageContainer data-testid="templates-page">
      {header}
      {TabPills}
      {activeTab === "my" ? (
        <div className="space-y-8">
          {/* BL-122: while fetching list, show TableLoader only — no CTA bento flash */}
          {loading && !result ? (
            <TableCard title={t("title")}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="px-6 py-4">{t("templateName")}</TableHead>
                    <TableHead className="px-6 py-4">{t("steps")}</TableHead>
                    <TableHead className="px-6 py-4">{t("executionMode")}</TableHead>
                    <TableHead className="px-6 py-4">{t("descriptionLabel")}</TableHead>
                    <TableHead className="px-6 py-4">{t("updated")}</TableHead>
                    <TableHead className="px-6 py-4 w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-ds-outline-variant/10">
                  <TableLoader colSpan={COLS} />
                </TableBody>
              </Table>
            </TableCard>
          ) : templates.length === 0 && !search ? (
            <EmptyState
              icon={<span className="material-symbols-outlined text-3xl">description</span>}
              title={t("emptyTitle")}
              description={t("emptyDesc")}
              action={
                <Link
                  href="/templates/new"
                  className={buttonVariants({ variant: "gradient-primary", size: "lg" })}
                >
                  <span className="material-symbols-outlined text-sm">add</span>
                  {t("create")}
                </Link>
              }
            />
          ) : (
            <>
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
                      <TableHead className="px-6 py-4">{t("templateName")}</TableHead>
                      <TableHead className="px-6 py-4">{t("steps")}</TableHead>
                      <TableHead className="px-6 py-4">{t("executionMode")}</TableHead>
                      <TableHead className="px-6 py-4">{t("descriptionLabel")}</TableHead>
                      <TableHead className="px-6 py-4">{t("updated")}</TableHead>
                      <TableHead className="px-6 py-4 w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-ds-outline-variant/10">
                    {loading ? (
                      <TableLoader colSpan={COLS} />
                    ) : templates.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={COLS}
                          className="px-6 py-12 text-center text-ds-outline"
                        >
                          {t("emptyTitle")}
                        </TableCell>
                      </TableRow>
                    ) : (
                      templates.map((tpl) => (
                        <TableRow
                          key={tpl.id}
                          className="cursor-pointer"
                          onClick={() => router.push(`/templates/${tpl.id}`)}
                        >
                          <TableCell className="px-6 py-5 font-bold text-ds-primary">
                            {tpl.name}
                          </TableCell>
                          <TableCell className="px-6 py-5">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-ds-secondary-container text-ds-on-secondary-container rounded-full text-xs font-semibold">
                              <span className="material-symbols-outlined text-xs">reorder</span>
                              {tpl.stepCount} {t("stepsUnit")}
                            </span>
                          </TableCell>
                          <TableCell className="px-6 py-5">
                            {modeBadge(tpl.executionMode)}
                          </TableCell>
                          <TableCell className="px-6 py-5 text-sm text-ds-on-surface-variant max-w-[300px] truncate">
                            {tpl.description || "\u2014"}
                          </TableCell>
                          <TableCell className="px-6 py-5 text-xs text-ds-outline">
                            {timeAgo(tpl.updatedAt, locale)}
                          </TableCell>
                          <TableCell className="px-6 py-5 text-ds-outline-variant">
                            <div className="flex items-center gap-2">
                              <Link
                                href={`/templates/${tpl.id}/test`}
                                title={t("test")}
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center justify-center size-8 rounded-lg hover:bg-ds-primary/10 hover:text-ds-primary transition-colors"
                              >
                                <span className="material-symbols-outlined text-lg">science</span>
                              </Link>
                              <span className="material-symbols-outlined text-xl">
                                chevron_right
                              </span>
                            </div>
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

              {/* Stats + CTA bento — rendered only after data is loaded (BL-122). */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <SectionCard className="col-span-1 relative overflow-hidden group">
                  <div className="relative z-10">
                    <h3 className="heading-3 mb-1">{t("templateStats")}</h3>
                    <p className="text-xs text-ds-on-surface-variant mb-4">
                      {t("templateStatsDesc")}
                    </p>
                    <div className="flex items-end gap-4">
                      <div>
                        <span className="text-3xl font-black text-ds-primary">{total}</span>
                        <span className="text-[10px] text-ds-on-surface-variant font-bold block">
                          {t("totalTemplates")}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="absolute -right-4 -bottom-4 opacity-10 group-hover:scale-110 transition-transform">
                    <span
                      className="material-symbols-outlined text-8xl"
                      style={{ fontVariationSettings: "'FILL' 1" }}
                    >
                      account_tree
                    </span>
                  </div>
                </SectionCard>
                <div className="col-span-2">
                  <CTABanner
                    title={t("ctaTitle")}
                    description={t("ctaDesc")}
                    action={
                      <Link href="/templates/new">
                        <Button variant="gradient-primary" size="lg">
                          {t("create")}
                        </Button>
                      </Link>
                    }
                  />
                </div>
              </div>
            </>
          )}
        </div>
      ) : (
        <GlobalLibrary />
      )}
    </PageContainer>
  );
}
