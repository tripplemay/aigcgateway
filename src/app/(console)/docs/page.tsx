"use client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

function Code({ children }: { children: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative">
      <pre className="bg-zinc-950 text-zinc-100 rounded-md p-4 text-sm font-mono overflow-x-auto whitespace-pre-wrap">
        {children}
      </pre>
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-2 right-2 text-zinc-400 hover:text-zinc-100"
        onClick={() => {
          navigator.clipboard.writeText(children);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      </Button>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export default function DocsPage() {
  const t = useTranslations("docs");
  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold mb-2">{t("title")}</h1>
      <p className="text-ds-on-surface-variant mb-6">{t("description")}</p>

      <Section title={t("secAuth")}>
        <p className="text-sm mb-3">{t("authDesc")}</p>
        <Code>{`Authorization: Bearer pk_your_api_key`}</Code>
      </Section>

      <Section title={t("secChat")}>
        <p className="text-sm mb-3">{t("chatDesc")}</p>
        <Code>{`curl -X POST /v1/chat/completions \\
  -H "Authorization: Bearer pk_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "deepseek/v3",
    "messages": [{"role": "user", "content": "Hello"}],
    "temperature": 0.7,
    "max_tokens": 1024,
    "stream": false
  }'`}</Code>
        <h4 className="font-medium mt-4 mb-2 text-sm">{t("parameters")}</h4>
        <div className="text-sm space-y-1">
          <p>
            <code className="bg-ds-surface-container-low px-1 rounded">model</code>{" "}
            <Badge variant="secondary">{t("required")}</Badge> — {t("paramModel")}{" "}
            <code>openai/gpt-4o</code>
          </p>
          <p>
            <code className="bg-ds-surface-container-low px-1 rounded">messages</code>{" "}
            <Badge variant="secondary">{t("required")}</Badge> — {t("paramMessages")}
          </p>
          <p>
            <code className="bg-ds-surface-container-low px-1 rounded">stream</code> —{" "}
            {t("paramStream")}
          </p>
          <p>
            <code className="bg-ds-surface-container-low px-1 rounded">temperature</code> —{" "}
            {t("paramTemperature")}
          </p>
          <p>
            <code className="bg-ds-surface-container-low px-1 rounded">max_tokens</code> —{" "}
            {t("paramMaxTokens")}
          </p>
        </div>
      </Section>

      <Section title={t("secImages")}>
        <p className="text-sm mb-3">{t("imagesDesc")}</p>
        <Code>{`curl -X POST /v1/images/generations \\
  -H "Authorization: Bearer pk_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "zhipu/cogview-3-flash",
    "prompt": "A friendly robot",
    "size": "1024x1024"
  }'`}</Code>
      </Section>

      <Section title={t("secModels")}>
        <p className="text-sm mb-3">{t("modelsDesc")}</p>
        <Code>{`curl /v1/models
curl /v1/models?modality=text
curl /v1/models?modality=image`}</Code>
      </Section>

      <Section title={t("secHeaders")}>
        <div className="text-sm space-y-1">
          <p>
            <code className="bg-ds-surface-container-low px-1 rounded">X-Trace-Id</code> —{" "}
            {t("headerTrace")}
          </p>
          <p>
            <code className="bg-ds-surface-container-low px-1 rounded">X-RateLimit-Limit</code> —{" "}
            {t("headerLimit")}
          </p>
          <p>
            <code className="bg-ds-surface-container-low px-1 rounded">X-RateLimit-Remaining</code>{" "}
            — {t("headerRemaining")}
          </p>
          <p>
            <code className="bg-ds-surface-container-low px-1 rounded">X-RateLimit-Reset</code> —{" "}
            {t("headerReset")}
          </p>
        </div>
      </Section>

      <Section title={t("secErrors")}>
        <div className="text-sm space-y-1">
          <p>
            <Badge variant="destructive">401</Badge> <code>invalid_api_key</code> — {t("err401")}
          </p>
          <p>
            <Badge variant="destructive">402</Badge> <code>insufficient_balance</code> —{" "}
            {t("err402")}
          </p>
          <p>
            <Badge variant="destructive">404</Badge> <code>model_not_found</code> — {t("err404")}
          </p>
          <p>
            <Badge variant="destructive">429</Badge> <code>rate_limit_exceeded</code> —{" "}
            {t("err429")}
          </p>
          <p>
            <Badge variant="destructive">502</Badge> <code>provider_error</code> — {t("err502")}
          </p>
          <p>
            <Badge variant="destructive">503</Badge> <code>channel_unavailable</code> —{" "}
            {t("err503")}
          </p>
        </div>
        <Code>{`{
  "error": {
    "type": "billing_error",
    "code": "insufficient_balance",
    "message": "Insufficient balance. Current balance: $0.002.",
    "balance": 0.002
  }
}`}</Code>
      </Section>

      <Section title={t("secRateLimits")}>
        <div className="text-sm space-y-1">
          <p>
            <strong>RPM</strong>: {t("rpmDesc")}
          </p>
          <p>
            <strong>TPM</strong>: {t("tpmDesc")}
          </p>
          <p>
            <strong>Image RPM</strong>: {t("imageRpmDesc")}
          </p>
          <p className="text-ds-on-surface-variant">{t("limitsCustomizable")}</p>
        </div>
      </Section>

      <Section title={t("secMcp")}>
        <p className="text-sm mb-3">{t("mcpDesc")}</p>
        <p className="text-sm mb-2">
          <strong>{t("endpoint")}</strong>{" "}
          <code className="bg-ds-surface-container-low px-1 rounded">
            https://aigc.guangai.ai/mcp
          </code>
        </p>
        <p className="text-sm mb-3">
          <strong>{t("protocol")}</strong> {t("protocolValue")}
        </p>
        <Code>{`// Claude Code: ~/.claude/claude_code_config.json
{
  "mcpServers": {
    "aigc-gateway": {
      "type": "streamable-http",
      "url": "https://aigc.guangai.ai/mcp",
      "headers": {
        "Authorization": "Bearer pk_your_api_key"
      }
    }
  }
}`}</Code>
        <p className="text-sm mt-3 mb-2">
          <strong>{t("availableTools")}</strong>
        </p>
        <div className="text-sm space-y-1">
          <p>
            <code className="bg-ds-surface-container-low px-1 rounded">list_models</code> —{" "}
            {t("toolListModels")}
          </p>
          <p>
            <code className="bg-ds-surface-container-low px-1 rounded">chat</code> —{" "}
            {t("toolChat")}
          </p>
          <p>
            <code className="bg-ds-surface-container-low px-1 rounded">generate_image</code> —{" "}
            {t("toolGenImage")}
          </p>
          <p>
            <code className="bg-ds-surface-container-low px-1 rounded">list_logs</code> —{" "}
            {t("toolListLogs")}
          </p>
          <p>
            <code className="bg-ds-surface-container-low px-1 rounded">get_log_detail</code> —{" "}
            {t("toolLogDetail")}
          </p>
          <p>
            <code className="bg-ds-surface-container-low px-1 rounded">get_balance</code> —{" "}
            {t("toolBalance")}
          </p>
          <p>
            <code className="bg-ds-surface-container-low px-1 rounded">get_usage_summary</code> —{" "}
            {t("toolUsage")}
          </p>
        </div>
        <p className="text-sm text-ds-on-surface-variant mt-2">
          {t.rich("mcpSetupLink", {
            link: (chunks) => (
              <a href="/mcp-setup" className="text-ds-primary underline">
                {chunks}
              </a>
            ),
          })}
        </p>
      </Section>
    </div>
  );
}
