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

      <Section title="Authentication">
        <p className="text-sm mb-3">
          All API requests require an API Key in the Authorization header:
        </p>
        <Code>{`Authorization: Bearer pk_your_api_key`}</Code>
      </Section>

      <Section title="POST /v1/chat/completions">
        <p className="text-sm mb-3">Generate text completions. Supports streaming.</p>
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
        <h4 className="font-medium mt-4 mb-2 text-sm">Parameters</h4>
        <div className="text-sm space-y-1">
          <p>
            <code className="bg-ds-surface-container-low px-1 rounded">model</code>{" "}
            <Badge variant="secondary">required</Badge> — Platform model name, e.g.{" "}
            <code>openai/gpt-4o</code>
          </p>
          <p>
            <code className="bg-ds-surface-container-low px-1 rounded">messages</code>{" "}
            <Badge variant="secondary">required</Badge> — Array of message objects
          </p>
          <p>
            <code className="bg-ds-surface-container-low px-1 rounded">stream</code> — Enable SSE
            streaming (default: false)
          </p>
          <p>
            <code className="bg-ds-surface-container-low px-1 rounded">temperature</code> — Sampling
            temperature (auto-clamped per provider)
          </p>
          <p>
            <code className="bg-ds-surface-container-low px-1 rounded">max_tokens</code> — Maximum
            output tokens
          </p>
        </div>
      </Section>

      <Section title="POST /v1/images/generations">
        <p className="text-sm mb-3">Generate images.</p>
        <Code>{`curl -X POST /v1/images/generations \\
  -H "Authorization: Bearer pk_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "zhipu/cogview-3-flash",
    "prompt": "A friendly robot",
    "size": "1024x1024"
  }'`}</Code>
      </Section>

      <Section title="GET /v1/models">
        <p className="text-sm mb-3">List available models with pricing.</p>
        <Code>{`curl /v1/models
curl /v1/models?modality=text
curl /v1/models?modality=image`}</Code>
      </Section>

      <Section title="Response Headers">
        <div className="text-sm space-y-1">
          <p>
            <code className="bg-ds-surface-container-low px-1 rounded">X-Trace-Id</code> — Unique
            trace ID for audit logs
          </p>
          <p>
            <code className="bg-ds-surface-container-low px-1 rounded">X-RateLimit-Limit</code> —
            Rate limit (RPM)
          </p>
          <p>
            <code className="bg-ds-surface-container-low px-1 rounded">X-RateLimit-Remaining</code>{" "}
            — Remaining requests
          </p>
          <p>
            <code className="bg-ds-surface-container-low px-1 rounded">X-RateLimit-Reset</code> —
            Reset timestamp
          </p>
        </div>
      </Section>

      <Section title="Error Codes">
        <div className="text-sm space-y-1">
          <p>
            <Badge variant="destructive">401</Badge> <code>invalid_api_key</code> — Invalid or
            revoked API Key
          </p>
          <p>
            <Badge variant="destructive">402</Badge> <code>insufficient_balance</code> — Balance is
            zero
          </p>
          <p>
            <Badge variant="destructive">404</Badge> <code>model_not_found</code> — Model does not
            exist
          </p>
          <p>
            <Badge variant="destructive">429</Badge> <code>rate_limit_exceeded</code> — Rate limit
            hit (check Retry-After header)
          </p>
          <p>
            <Badge variant="destructive">502</Badge> <code>provider_error</code> — Upstream provider
            error
          </p>
          <p>
            <Badge variant="destructive">503</Badge> <code>channel_unavailable</code> — No active
            channel for model
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

      <Section title="Rate Limits">
        <div className="text-sm space-y-1">
          <p>
            <strong>RPM</strong>: 60 requests/minute (all models combined)
          </p>
          <p>
            <strong>TPM</strong>: 100,000 tokens/minute
          </p>
          <p>
            <strong>Image RPM</strong>: 10 requests/minute
          </p>
          <p className="text-ds-on-surface-variant">
            Limits can be customized per project by admin.
          </p>
        </div>
      </Section>

      <Section title="MCP (Model Context Protocol)">
        <p className="text-sm mb-3">
          Connect AI editors (Claude Code, Cursor, Windsurf) to AIGC Gateway via MCP. Use the same
          API Key for authentication.
        </p>
        <p className="text-sm mb-2">
          <strong>Endpoint:</strong>{" "}
          <code className="bg-ds-surface-container-low px-1 rounded">
            https://aigc.guangai.ai/mcp
          </code>
        </p>
        <p className="text-sm mb-3">
          <strong>Protocol:</strong> Streamable HTTP (stateless)
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
          <strong>Available Tools:</strong>
        </p>
        <div className="text-sm space-y-1">
          <p>
            <code className="bg-ds-surface-container-low px-1 rounded">list_models</code> — List
            models with pricing
          </p>
          <p>
            <code className="bg-ds-surface-container-low px-1 rounded">chat</code> — Text generation
            (non-streaming)
          </p>
          <p>
            <code className="bg-ds-surface-container-low px-1 rounded">generate_image</code> — Image
            generation
          </p>
          <p>
            <code className="bg-ds-surface-container-low px-1 rounded">list_logs</code> — View call
            logs
          </p>
          <p>
            <code className="bg-ds-surface-container-low px-1 rounded">get_log_detail</code> — Full
            call details
          </p>
          <p>
            <code className="bg-ds-surface-container-low px-1 rounded">get_balance</code> — Check
            balance
          </p>
          <p>
            <code className="bg-ds-surface-container-low px-1 rounded">get_usage_summary</code> —
            Usage statistics
          </p>
        </div>
        <p className="text-sm text-ds-on-surface-variant mt-2">
          See{" "}
          <a href="/mcp-setup" className="text-ds-primary underline">
            MCP Setup
          </a>{" "}
          page for full configuration guide.
        </p>
      </Section>
    </div>
  );
}
