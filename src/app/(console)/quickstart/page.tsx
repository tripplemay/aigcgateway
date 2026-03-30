"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";

const stepCodes = [
  `npm install aigc-gateway-sdk`,
  `import { Gateway } from 'aigc-gateway-sdk'

const gw = new Gateway({
  apiKey: 'pk_...',
  baseUrl: '${typeof window !== "undefined" ? window.location.origin : ""}'
})

const res = await gw.chat({
  model: 'deepseek/v3',
  messages: [{ role: 'user', content: 'Hello!' }],
})

console.log(res.content)`,
  `const stream = await gw.chat({
  model: 'deepseek/v3',
  messages: [{ role: 'user', content: 'Write a poem' }],
  stream: true,
})

for await (const chunk of stream) {
  process.stdout.write(chunk.content)
}

console.log('Usage:', stream.usage)`,
  `const img = await gw.image({
  model: 'zhipu/cogview-3-flash',
  prompt: 'A friendly robot teacher',
  size: '1024x1024',
})

console.log(img.url)`,
];

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="relative">
      <pre className="bg-zinc-950 text-zinc-100 rounded-md p-4 text-sm font-mono overflow-x-auto">
        {code}
      </pre>
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-2 right-2 text-zinc-400 hover:text-zinc-100"
        onClick={copy}
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      </Button>
    </div>
  );
}

export default function QuickStartPage() {
  const t = useTranslations("quickstart");
  const stepTitles = [t("step1"), t("step2"), t("step3"), t("step4")];
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">{t("title")}</h1>
      <div className="space-y-6">
        {stepCodes.map((code, i) => (
          <Card key={i}>
            <CardHeader>
              <CardTitle className="text-base">{stepTitles[i]}</CardTitle>
            </CardHeader>
            <CardContent>
              <CodeBlock code={code} />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
