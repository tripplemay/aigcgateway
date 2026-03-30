"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useProject } from "@/hooks/use-project";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Copy, ExternalLink } from "lucide-react";
import Link from "next/link";

interface ApiKeyRow {
  id: string;
  keyPrefix: string;
  name: string | null;
  status: string;
}

const TOOLS = [
  { name: "list_models", descKey: "toolListModels" },
  { name: "chat", descKey: "toolChat" },
  { name: "generate_image", descKey: "toolGenerateImage" },
  { name: "list_logs", descKey: "toolListLogs" },
  { name: "get_log_detail", descKey: "toolGetLogDetail" },
  { name: "get_balance", descKey: "toolGetBalance" },
  { name: "get_usage_summary", descKey: "toolGetUsageSummary" },
] as const;

function generateConfig(
  type: "claude" | "cursor" | "generic",
  keyPrefix: string,
): string {
  const url = "https://aigc.guangai.ai/mcp";
  const keyPlaceholder = `${keyPrefix}••••••••`;

  if (type === "claude") {
    return JSON.stringify(
      {
        mcpServers: {
          "aigc-gateway": {
            type: "streamable-http",
            url,
            headers: { Authorization: `Bearer ${keyPlaceholder}` },
          },
        },
      },
      null,
      2,
    );
  }

  if (type === "cursor") {
    return JSON.stringify(
      {
        mcpServers: {
          "aigc-gateway": {
            url,
            headers: { Authorization: `Bearer ${keyPlaceholder}` },
          },
        },
      },
      null,
      2,
    );
  }

  // Generic
  return `URL: ${url}\nAuthorization: Bearer ${keyPlaceholder}`;
}

export default function McpSetupPage() {
  const t = useTranslations("mcpSetup");
  const { current, loading: projLoading } = useProject();
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [selectedKey, setSelectedKey] = useState<string>("");
  const [tab, setTab] = useState<"claude" | "cursor" | "generic">("claude");

  useEffect(() => {
    if (!current) return;
    apiFetch<{ data: ApiKeyRow[] }>(`/api/projects/${current.id}/keys`).then(
      (r) => {
        const active = r.data.filter((k) => k.status === "ACTIVE");
        setKeys(active);
        if (active.length > 0) setSelectedKey(active[0].keyPrefix);
      },
    );
  }, [current]);

  if (projLoading) {
    return (
      <div className="space-y-4 pt-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const copyConfig = () => {
    const config = generateConfig(tab, selectedKey);
    navigator.clipboard.writeText(config);
    toast.success(t("copied"));
  };

  return (
    <div className="max-w-2xl">
      <h1 className="text-[20px] font-semibold text-text-primary mb-1">
        {t("title")}
      </h1>
      <p className="text-[13px] text-text-tertiary mb-6">{t("subtitle")}</p>

      {/* Step 1: API Key */}
      <div className="bg-white border border-border-custom rounded-xl p-5 mb-4">
        <h2 className="text-[14px] font-semibold text-text-primary mb-2">
          {t("step1")}
        </h2>
        <p className="text-[13px] text-text-secondary mb-3">
          {t("step1Desc")}
        </p>
        {keys.length === 0 ? (
          <div className="flex items-center gap-3">
            <p className="text-[13px] text-text-tertiary">{t("noKey")}</p>
            <Link href="/keys">
              <Button size="sm" variant="outline">
                {t("goToKeys")} <ExternalLink className="h-3 w-3 ml-1" />
              </Button>
            </Link>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-text-tertiary">
              {t("selectKey")}:
            </span>
            <select
              className="border border-border-custom rounded-md px-2 py-1 text-[13px] bg-white"
              value={selectedKey}
              onChange={(e) => setSelectedKey(e.target.value)}
            >
              {keys.map((k) => (
                <option key={k.id} value={k.keyPrefix}>
                  {k.keyPrefix}•••• {k.name ? `(${k.name})` : ""}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Step 2: Config */}
      <div className="bg-white border border-border-custom rounded-xl p-5 mb-4">
        <h2 className="text-[14px] font-semibold text-text-primary mb-2">
          {t("step2")}
        </h2>
        <p className="text-[13px] text-text-secondary mb-3">
          {t("step2Desc")}
        </p>

        {/* Tabs */}
        <div className="flex gap-1 mb-3">
          {(["claude", "cursor", "generic"] as const).map((type) => (
            <Button
              key={type}
              size="sm"
              variant={tab === type ? "default" : "outline"}
              onClick={() => setTab(type)}
            >
              {t(type === "claude" ? "claudeCode" : type === "cursor" ? "cursor" : "generic")}
            </Button>
          ))}
        </div>

        {/* Config path hint */}
        {tab === "claude" && (
          <p className="text-[11px] text-text-hint mb-2 font-mono">
            {t("claudePath")}
          </p>
        )}
        {tab === "cursor" && (
          <p className="text-[11px] text-text-hint mb-2 font-mono">
            {t("cursorPath")}
          </p>
        )}

        {/* Config block */}
        <div className="relative">
          <pre className="bg-[#1a1a1a] text-[#e0e0e0] rounded-lg p-4 text-[12px] font-mono leading-relaxed overflow-x-auto">
            {generateConfig(tab, selectedKey || "pk_your_")}
          </pre>
          <Button
            size="sm"
            variant="outline"
            className="absolute top-2 right-2 h-7 text-[11px]"
            onClick={copyConfig}
          >
            <Copy className="h-3 w-3 mr-1" />
            {t("copy")}
          </Button>
        </div>
      </div>

      {/* Step 3: Tools */}
      <div className="bg-white border border-border-custom rounded-xl p-5">
        <h2 className="text-[14px] font-semibold text-text-primary mb-2">
          {t("step3")}
        </h2>
        <p className="text-[13px] text-text-secondary mb-3">
          {t("step3Desc")}
        </p>
        <h3 className="text-[12px] font-medium text-text-tertiary mb-2">
          {t("tools")}
        </h3>
        <div className="space-y-2">
          {TOOLS.map((tool) => (
            <div
              key={tool.name}
              className="flex items-center gap-3 py-1.5 border-b border-border-custom last:border-0"
            >
              <Badge variant="info" className="font-mono text-[11px]">
                {tool.name}
              </Badge>
              <span className="text-[13px] text-text-secondary">
                {t(tool.descKey)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
