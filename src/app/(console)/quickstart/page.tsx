"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { PageContainer } from "@/components/page-container";
import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";

const BASE_URL = "https://aigc.guangai.ai/v1";

const CURL_FIRST_CALL = `curl ${BASE_URL}/chat/completions \\
  -H "Authorization: Bearer pk_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "deepseek-v3",
    "messages": [
      { "role": "user", "content": "Say hello in one short sentence." }
    ]
  }'`;

const SDK_INSTALL = `npm install openai`;

const SDK_CALL = `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.AIGC_API_KEY, // pk_...
  baseURL: "${BASE_URL}",
});

const res = await client.chat.completions.create({
  model: "gpt-4o-mini",
  messages: [{ role: "user", content: "Say hello in one short sentence." }],
});

console.log(res.choices[0].message.content);`;

const SDK_STREAM = `const stream = await client.chat.completions.create({
  model: "claude-sonnet-4-6",
  messages: [{ role: "user", content: "Write a haiku about the ocean." }],
  stream: true,
});

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content ?? "");
}`;

interface NextItem {
  href: string;
  icon: string;
  titleKey: "nextChat" | "nextImages" | "nextModels" | "nextErrors" | "nextRateLimits" | "nextMcp";
  descKey:
    | "nextChatDesc"
    | "nextImagesDesc"
    | "nextModelsDesc"
    | "nextErrorsDesc"
    | "nextRateLimitsDesc"
    | "nextMcpDesc";
}

const NEXT_ITEMS: NextItem[] = [
  { href: "/docs#chat", icon: "forum", titleKey: "nextChat", descKey: "nextChatDesc" },
  { href: "/docs#images", icon: "image", titleKey: "nextImages", descKey: "nextImagesDesc" },
  { href: "/docs#models", icon: "list_alt", titleKey: "nextModels", descKey: "nextModelsDesc" },
  { href: "/docs#errors", icon: "error", titleKey: "nextErrors", descKey: "nextErrorsDesc" },
  {
    href: "/docs#rate-limits",
    icon: "speed",
    titleKey: "nextRateLimits",
    descKey: "nextRateLimitsDesc",
  },
  { href: "/mcp-setup", icon: "extension", titleKey: "nextMcp", descKey: "nextMcpDesc" },
];

function CodeBlock({ code, fileName }: { code: string; fileName: string }) {
  const t = useTranslations("quickstart");
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="relative bg-[#1e1e2e] rounded-xl p-4 font-mono text-xs overflow-hidden">
      <div className="flex items-center justify-between mb-2">
        <span className="text-slate-500">{fileName}</span>
        <button
          onClick={copy}
          className="flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors"
          type="button"
        >
          <span className="material-symbols-outlined text-sm">
            {copied ? "check" : "content_copy"}
          </span>
          <span>{copied ? t("copied") : t("copy")}</span>
        </button>
      </div>
      <pre className="text-slate-300 leading-relaxed whitespace-pre-wrap">{code}</pre>
    </div>
  );
}

interface StepCardProps {
  num: number | string;
  title: string;
  tag: string;
  desc: string;
  children?: React.ReactNode;
}

function StepCard({ num, title, tag, desc, children }: StepCardProps) {
  return (
    <SectionCard className="[&>div]:flex [&>div]:flex-col">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 font-[var(--font-heading)] font-extrabold text-lg">
            {num}
          </div>
          <h2 className="heading-2">{title}</h2>
        </div>
        <span className="text-xs font-bold uppercase tracking-widest text-slate-400 bg-slate-50 px-2.5 py-1 rounded-full">
          {tag}
        </span>
      </div>
      <p className="text-ds-on-surface-variant text-sm mb-5 leading-relaxed">{desc}</p>
      {children}
    </SectionCard>
  );
}

export default function QuickStartPage() {
  const t = useTranslations("quickstart");

  return (
    <PageContainer size="narrow" data-testid="quickstart-page">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      <div className="space-y-6">
        {/* Step 0 — get an API key */}
        <StepCard num={0} title={t("step0Title")} tag={t("step0Tag")} desc={t("step0Desc")}>
          <div className="flex items-center justify-between gap-4 bg-ds-surface-container-low rounded-lg px-4 py-3">
            <p className="text-xs text-ds-on-surface-variant font-mono">{t("step0Note")}</p>
            <Link
              href="/keys"
              className="flex-shrink-0 inline-flex items-center gap-1 px-4 py-2 bg-gradient-to-r from-ds-primary to-ds-primary-container text-white text-sm font-bold rounded-full shadow-lg shadow-ds-primary/20 hover:opacity-90 active:scale-95 transition-all"
            >
              {t("step0CtaText")}
              <span className="material-symbols-outlined text-base">arrow_forward</span>
            </Link>
          </div>
        </StepCard>

        {/* Step 1 — curl */}
        <StepCard num={1} title={t("step1Title")} tag={t("step1Tag")} desc={t("step1Desc")}>
          <CodeBlock code={CURL_FIRST_CALL} fileName="terminal" />
        </StepCard>

        {/* Step 2 — OpenAI SDK */}
        <StepCard num={2} title={t("step2Title")} tag={t("step2Tag")} desc={t("step2Desc")}>
          <div className="space-y-3">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                {t("step2Install")}
              </p>
              <CodeBlock code={SDK_INSTALL} fileName="terminal" />
            </div>
            <CodeBlock code={SDK_CALL} fileName="hello.ts" />
          </div>
        </StepCard>

        {/* Step 3 — streaming */}
        <StepCard num={3} title={t("step3Title")} tag={t("step3Tag")} desc={t("step3Desc")}>
          <CodeBlock code={SDK_STREAM} fileName="stream.ts" />
        </StepCard>

        {/* Step 4 — what to explore next */}
        <StepCard num={4} title={t("step4Title")} tag={t("step4Tag")} desc={t("step4Desc")}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {NEXT_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="group flex items-start gap-3 p-4 rounded-lg bg-ds-surface-container-low hover:bg-ds-surface-container transition-colors"
                data-testid={`quickstart-next-${item.titleKey}`}
              >
                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-ds-primary/10 text-ds-primary flex items-center justify-center">
                  <span className="material-symbols-outlined text-base">{item.icon}</span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-ds-on-surface group-hover:text-ds-primary transition-colors">
                    {t(item.titleKey)}
                  </p>
                  <p className="text-xs text-ds-on-surface-variant mt-0.5">{t(item.descKey)}</p>
                </div>
              </Link>
            ))}
          </div>
        </StepCard>
      </div>
    </PageContainer>
  );
}
