"use client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Copy, Check } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageContainer } from "@/components/page-container";
import { PageHeader } from "@/components/page-header";

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

function Section({
  title,
  id,
  children,
}: {
  title: string;
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="mb-6 scroll-mt-20" id={id}>
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
    <PageContainer data-testid="docs-page">
      <PageHeader title={t("title")} subtitle={t("description")} />

      <Link
        href="/quickstart"
        data-testid="docs-quickstart-banner"
        className="flex items-center justify-between gap-4 px-5 py-4 rounded-xl bg-gradient-to-r from-ds-primary/5 to-ds-primary-container/10 border border-ds-primary/15 hover:from-ds-primary/10 hover:to-ds-primary-container/20 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="material-symbols-outlined text-ds-primary">rocket_launch</span>
          <span className="text-sm font-bold text-ds-on-surface">{t("quickstartBannerText")}</span>
        </div>
        <span className="text-sm font-bold text-ds-primary flex-shrink-0">
          {t("quickstartBannerCta")}
        </span>
      </Link>

      <Section title={t("secAuth")}>
        <p className="text-sm mb-3">{t("authDesc")}</p>
        <Code>{`Authorization: Bearer pk_your_api_key`}</Code>
      </Section>

      <Section title={t("secChat")} id="chat">
        <p className="text-sm mb-3">{t("chatDesc")}</p>
        <Code>{`curl https://aigc.guangai.ai/v1/chat/completions \\
  -H "Authorization: Bearer pk_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "deepseek-v3",
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
            <code>gpt-4o-mini</code>, <code>claude-sonnet-4-6</code>, <code>deepseek-v3</code>
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
          <p>
            <code className="bg-ds-surface-container-low px-1 rounded">max_reasoning_tokens</code> —{" "}
            {t("paramMaxReasoningTokens")}
          </p>
          <p>
            <code className="bg-ds-surface-container-low px-1 rounded">top_p</code> —{" "}
            {t("paramTopP")}
          </p>
          <p>
            <code className="bg-ds-surface-container-low px-1 rounded">frequency_penalty</code> —{" "}
            {t("paramFrequencyPenalty")}
          </p>
          <p>
            <code className="bg-ds-surface-container-low px-1 rounded">tools</code> —{" "}
            {t("paramTools")}
          </p>
          <p>
            <code className="bg-ds-surface-container-low px-1 rounded">tool_choice</code> —{" "}
            {t("paramToolChoice")}
          </p>
        </div>
      </Section>

      <Section title={t("secImages")} id="images">
        <p className="text-sm mb-3">{t("imagesDesc")}</p>
        <Code>{`curl https://aigc.guangai.ai/v1/images/generations \\
  -H "Authorization: Bearer pk_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "cogview-3-flash",
    "prompt": "A friendly robot",
    "size": "1024x1024"
  }'`}</Code>
      </Section>

      <Section title={t("secEmbeddings")} id="embeddings">
        <p className="text-sm mb-3">{t("embeddingsDesc")}</p>
        <Code>{`# Single input
curl https://aigc.guangai.ai/v1/embeddings \\
  -H "Authorization: Bearer pk_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "bge-m3",
    "input": "AIGC Gateway aggregates 10+ AI providers."
  }'

# Batch (up to 100 inputs)
curl https://aigc.guangai.ai/v1/embeddings \\
  -H "Authorization: Bearer pk_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "bge-m3",
    "input": ["hello", "world", "AIGC Gateway"]
  }'`}</Code>
        <p className="text-xs text-ds-on-surface-variant mt-3">{t("embeddingsModelsHint")}</p>
      </Section>

      <Section title={t("secModels")} id="models">
        <p className="text-sm mb-3">{t("modelsDesc")}</p>
        <Code>{`curl https://aigc.guangai.ai/v1/models
curl https://aigc.guangai.ai/v1/models?modality=text
curl https://aigc.guangai.ai/v1/models?modality=image`}</Code>
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

      <Section title={t("secErrors")} id="errors">
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

      <Section title={t("secRateLimits")} id="rate-limits">
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

      <Section title={t("secMcp")} id="mcp">
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
          <strong>{t("availableTools")} (28)</strong>
        </p>
        <div className="text-sm space-y-3">
          <div>
            <p className="font-semibold text-xs text-ds-on-surface-variant uppercase tracking-wider mb-1">
              {t("toolGroupCore")}
            </p>
            <div className="space-y-0.5">
              <ToolItem name="list_models" desc={t("toolListModels")} />
              <ToolItem name="chat" desc={t("toolChat")} />
              <ToolItem name="generate_image" desc={t("toolGenImage")} />
            </div>
          </div>
          <div>
            <p className="font-semibold text-xs text-ds-on-surface-variant uppercase tracking-wider mb-1">
              {t("toolGroupAccount")}
            </p>
            <div className="space-y-0.5">
              <ToolItem name="get_balance" desc={t("toolBalance")} />
              <ToolItem name="get_usage_summary" desc={t("toolUsage")} />
              <ToolItem name="get_project_info" desc={t("toolProjectInfo")} />
              <ToolItem name="create_project" desc={t("toolCreateProject")} />
              <ToolItem name="list_api_keys" desc={t("toolListApiKeys")} />
              <ToolItem name="create_api_key" desc={t("toolCreateApiKey")} />
              <ToolItem name="revoke_api_key" desc={t("toolRevokeApiKey")} />
            </div>
          </div>
          <div>
            <p className="font-semibold text-xs text-ds-on-surface-variant uppercase tracking-wider mb-1">
              {t("toolGroupLogs")}
            </p>
            <div className="space-y-0.5">
              <ToolItem name="list_logs" desc={t("toolListLogs")} />
              <ToolItem name="get_log_detail" desc={t("toolLogDetail")} />
            </div>
          </div>
          <div>
            <p className="font-semibold text-xs text-ds-on-surface-variant uppercase tracking-wider mb-1">
              {t("toolGroupActions")}
            </p>
            <div className="space-y-0.5">
              <ToolItem name="list_actions" desc={t("toolListActions")} />
              <ToolItem name="create_action" desc={t("toolCreateAction")} />
              <ToolItem name="get_action_detail" desc={t("toolGetActionDetail")} />
              <ToolItem name="update_action" desc={t("toolUpdateAction")} />
              <ToolItem name="delete_action" desc={t("toolDeleteAction")} />
              <ToolItem name="create_action_version" desc={t("toolCreateActionVersion")} />
              <ToolItem name="activate_version" desc={t("toolActivateVersion")} />
              <ToolItem name="run_action" desc={t("toolRunAction")} />
            </div>
          </div>
          <div>
            <p className="font-semibold text-xs text-ds-on-surface-variant uppercase tracking-wider mb-1">
              {t("toolGroupTemplates")}
            </p>
            <div className="space-y-0.5">
              <ToolItem name="list_templates" desc={t("toolListTemplates")} />
              <ToolItem name="create_template" desc={t("toolCreateTemplate")} />
              <ToolItem name="get_template_detail" desc={t("toolGetTemplateDetail")} />
              <ToolItem name="update_template" desc={t("toolUpdateTemplate")} />
              <ToolItem name="delete_template" desc={t("toolDeleteTemplate")} />
              <ToolItem name="run_template" desc={t("toolRunTemplate")} />
              <ToolItem name="list_public_templates" desc={t("toolListPublicTemplates")} />
              <ToolItem name="fork_public_template" desc={t("toolForkPublicTemplate")} />
            </div>
          </div>
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
    </PageContainer>
  );
}

function ToolItem({ name, desc }: { name: string; desc: string }) {
  return (
    <p>
      <code className="bg-ds-surface-container-low px-1 rounded">{name}</code> — {desc}
    </p>
  );
}
