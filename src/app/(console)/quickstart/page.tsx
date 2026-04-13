"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { PageContainer } from "@/components/page-container";
import { PageHeader } from "@/components/page-header";

// ============================================================
// Step data — code.html lines 172-255
// ============================================================

const STEPS = [
  {
    num: 1,
    title: "Install SDK",
    tag: "Environment",
    desc: "Prepare your local environment by installing the AIGC core gateway package via NPM or Yarn.",
    fileName: "Terminal",
    code: `npm install @guangai/aigc-sdk\n# or\nyarn add @guangai/aigc-sdk`,
  },
  {
    num: 2,
    title: "Basic Chat",
    tag: "Foundation",
    desc: "Initialize the client and send your first synchronous prompt to the default gateway.",
    fileName: "index.js",
    code: `import { AigcClient } from '@guangai/aigc-sdk'

const client = new AigcClient({
  apiKey: 'pk_...',
  baseUrl: '${typeof window !== "undefined" ? window.location.origin : ""}/v1'
})

const res = await client.chat({
  model: 'deepseek/v3',
  messages: [{ role: 'user', content: 'Hello!' }],
})

console.log(res.content)`,
  },
  {
    num: 3,
    title: "Streaming Response",
    tag: "Real-time",
    desc: "Enable low-latency interfaces by streaming tokens directly to your client side.",
    fileName: "stream.js",
    code: `const stream = await client.chat({
  model: 'deepseek/v3',
  messages: [{ role: 'user', content: 'Write a poem' }],
  stream: true,
})

for await (const chunk of stream) {
  process.stdout.write(chunk.content)
}

console.log('Usage:', stream.usage)`,
  },
  {
    num: 4,
    title: "Image Generation",
    tag: "Creative",
    desc: "Connect to image generation endpoints for high-fidelity visual synthesis.",
    fileName: "images.js",
    code: `const img = await client.image({
  model: 'zhipu/cogview-3-flash',
  prompt: 'A friendly robot teacher',
  size: '1024x1024',
})

console.log(img.url)`,
  },
];

// ============================================================
// CodeBlock — code.html lines 182-191 pattern
// ============================================================

function CodeBlock({ code, fileName }: { code: string; fileName: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="relative bg-[#1e1e2e] rounded-xl p-4 font-mono text-xs overflow-hidden">
      {/* code.html lines 183-188: header with filename + copy */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-slate-500">{fileName}</span>
        <button
          onClick={copy}
          className="flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors"
        >
          <span className="material-symbols-outlined text-sm">
            {copied ? "check" : "content_copy"}
          </span>
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
      <pre className="text-slate-300 leading-relaxed">{code}</pre>
    </div>
  );
}

// ============================================================
// Page — code.html lines 163-271
// ============================================================

export default function QuickStartPage() {
  const t = useTranslations("quickstart");

  return (
    <PageContainer size="narrow" data-testid="quickstart-page">
      <PageHeader
        title={t("title")}
        subtitle="Initialize your journey into automated creativity with our streamlined SDK integration. Four steps to production-ready AI."
      />

      {/* Steps Grid — code.html lines 171-256 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {STEPS.map((step) => (
          /* code.html lines 173-192 pattern */
          <section
            key={step.num}
            className="group flex flex-col bg-ds-surface-container-lowest rounded-xl p-6 shadow-sm ring-1 ring-slate-100 hover:shadow-md transition-shadow"
          >
            {/* Header — lines 174-179 */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-4">
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 font-[var(--font-heading)] font-extrabold text-lg">
                  {step.num}
                </div>
                <h2 className="text-xl font-bold font-[var(--font-heading)]">{step.title}</h2>
              </div>
              {/* Tag pill — line 179 */}
              <span className="text-xs font-bold uppercase tracking-widest text-slate-400 bg-slate-50 px-2.5 py-1 rounded-full">
                {step.tag}
              </span>
            </div>
            {/* Description — line 181 */}
            <p className="text-ds-on-surface-variant text-sm mb-5 leading-relaxed">{step.desc}</p>
            {/* Code block — lines 182-191 */}
            <CodeBlock code={step.code} fileName={step.fileName} />
          </section>
        ))}
      </div>
    </PageContainer>
  );
}
