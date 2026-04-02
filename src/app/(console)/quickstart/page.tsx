"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import "material-symbols/outlined.css";

const stepCodes = [
  `npm install @guangai/aigc-sdk`,
  `import { AigcClient } from '@guangai/aigc-sdk'

const client = new AigcClient({
  apiKey: 'pk_...',
  baseUrl: '${typeof window !== "undefined" ? window.location.origin : ""}/v1'
})

const res = await client.chat({
  model: 'deepseek/v3',
  messages: [{ role: 'user', content: 'Hello!' }],
})

console.log(res.content)`,
  `const stream = await client.chat({
  model: 'deepseek/v3',
  messages: [{ role: 'user', content: 'Write a poem' }],
  stream: true,
})

for await (const chunk of stream) {
  process.stdout.write(chunk.content)
}

console.log('Usage:', stream.usage)`,
  `const img = await client.image({
  model: 'zhipu/cogview-3-flash',
  prompt: 'A friendly robot teacher',
  size: '1024x1024',
})

console.log(img.url)`,
];

const STEP_ICONS = ["download", "code", "stream", "image"];

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="relative">
      <pre className="bg-[#1e1e2e] text-indigo-200 rounded-xl p-5 text-sm font-mono overflow-x-auto leading-relaxed">
        {code}
      </pre>
      <button
        onClick={copy}
        className="absolute top-3 right-3 p-2 text-slate-500 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
      >
        <span className="material-symbols-outlined text-sm">
          {copied ? "check" : "content_copy"}
        </span>
      </button>
    </div>
  );
}

export default function QuickStartPage() {
  const t = useTranslations("quickstart");
  const stepTitles = [t("step1"), t("step2"), t("step3"), t("step4")];

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div>
        <h2 className="text-3xl font-extrabold tracking-tight font-[var(--font-heading)] text-ds-on-surface">
          {t("title")}
        </h2>
        <p className="text-ds-on-surface-variant font-medium mt-1">
          Get started with AIGC Gateway in 4 simple steps.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {stepCodes.map((code, i) => (
          <div key={i} className="bg-ds-surface-container-lowest rounded-2xl shadow-sm overflow-hidden">
            <div className="p-6 flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-ds-primary/10 flex items-center justify-center text-ds-primary shrink-0">
                <span className="material-symbols-outlined">{STEP_ICONS[i]}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-ds-primary uppercase tracking-widest">
                  Step {i + 1}
                </span>
                <h3 className="font-[var(--font-heading)] font-bold text-ds-on-surface">
                  {stepTitles[i]}
                </h3>
              </div>
            </div>
            <div className="px-6 pb-6">
              <CodeBlock code={code} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
