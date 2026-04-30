import { writeFileSync } from "fs";
import React from "react";
import { renderToString } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";

const OUTPUT =
  process.env.OUTPUT_FILE ?? "docs/test-reports/r1-design-system-foundation-e2e-2026-04-08.json";

type Step = { name: string; ok: boolean; detail: string };

async function runRenderChecks() {
  const steps: Step[] = [];
  const messages = {
    common: {
      page: "Page",
      prev: "Previous",
      next: "Next",
    },
  };
  // `tsx` in this repo compiles TSX with classic runtime in this context.
  // Expose React globally before importing TSX component modules.
  (globalThis as { React?: typeof React }).React = React;
  const { SearchBar } = await import("@/components/search-bar");
  const { Pagination } = await import("@/components/pagination");

  try {
    const searchHtml = renderToString(
      <NextIntlClientProvider
        locale="en"
        messages={messages}
        onError={() => {}}
        getMessageFallback={({ namespace, key }) => `${namespace}.${key}`}
      >
        <SearchBar placeholder="Search" value="abc" onChange={() => {}} />
      </NextIntlClientProvider>,
    );
    steps.push({
      name: "AC4 SearchBar can import and render",
      ok: searchHtml.includes("type=\"search\""),
      detail: `htmlLength=${searchHtml.length}`,
    });
  } catch (err) {
    steps.push({
      name: "AC4 SearchBar can import and render",
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    });
  }

  try {
    const paginationHtml = renderToString(
      <NextIntlClientProvider
        locale="en"
        messages={messages}
        onError={() => {}}
        getMessageFallback={({ namespace, key }) => `${namespace}.${key}`}
      >
        <Pagination page={2} totalPages={5} onPageChange={() => {}} total={100} pageSize={20} />
      </NextIntlClientProvider>,
    );

    steps.push({
      name: "AC4 Pagination can import and render",
      ok: paginationHtml.includes("Previous") && paginationHtml.includes("Next"),
      detail: `htmlLength=${paginationHtml.length}`,
    });
  } catch (err) {
    steps.push({
      name: "AC4 Pagination can import and render",
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    });
  }

  return steps;
}

async function main() {
  const steps = await runRenderChecks();
  const passCount = steps.filter((s) => s.ok).length;
  const failCount = steps.length - passCount;

  writeFileSync(
    OUTPUT,
    JSON.stringify(
      {
        passCount,
        failCount,
        steps,
      },
      null,
      2,
    ),
    "utf8",
  );

  if (failCount > 0) process.exit(1);
}

void main();
