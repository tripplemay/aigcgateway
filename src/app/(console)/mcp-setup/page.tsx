"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useAsyncData } from "@/hooks/use-async-data";
import { useProject } from "@/hooks/use-project";
import { toast } from "sonner";
import Link from "next/link";
import { PageContainer } from "@/components/page-container";
import { PageHeader } from "@/components/page-header";
import { PageLoader } from "@/components/page-loader";
import { SectionCard } from "@/components/section-card";
import { StatusChip } from "@/components/status-chip";
import { Button } from "@/components/ui/button";
import type { McpToolMeta, McpToolCategory } from "@/lib/mcp/tool-registry";

// ============================================================
// Types & config
// ============================================================

interface ApiKeyRow {
  id: string;
  keyPrefix: string;
  name: string | null;
  status: string;
}

type ClientType =
  | "claude-code"
  | "claude-desktop"
  | "cursor"
  | "codex"
  | "vscode"
  | "windsurf"
  | "cline"
  | "roo-code"
  | "jetbrains"
  | "generic";

const CLIENT_OPTIONS: { value: ClientType; label: string; icon: string }[] = [
  { value: "claude-code", label: "Claude Code", icon: "terminal" },
  { value: "claude-desktop", label: "Claude Desktop", icon: "computer" },
  { value: "cursor", label: "Cursor", icon: "edit" },
  { value: "codex", label: "Codex", icon: "code" },
  { value: "vscode", label: "VS Code Copilot", icon: "code_blocks" },
  { value: "windsurf", label: "Windsurf", icon: "surfing" },
  { value: "cline", label: "Cline", icon: "smart_toy" },
  { value: "roo-code", label: "Roo Code", icon: "smart_toy" },
  { value: "jetbrains", label: "JetBrains", icon: "integration_instructions" },
  { value: "generic", label: "Generic", icon: "settings" },
];

const MCP_URL = "https://aigc.guangai.ai/mcp";

// BL-MCP-PAGE-REVAMP F-MR-02: category 渲染顺序 + i18n key 对应
const CATEGORY_META: Array<{ id: McpToolCategory; labelKey: string; exampleKey: string }> = [
  { id: "models", labelKey: "categoryModels", exampleKey: "exampleModels" },
  { id: "ai_call", labelKey: "categoryAiCall", exampleKey: "exampleAiCall" },
  { id: "observability", labelKey: "categoryObservability", exampleKey: "exampleObservability" },
  { id: "action", labelKey: "categoryAction", exampleKey: "exampleAction" },
  { id: "template", labelKey: "categoryTemplate", exampleKey: "exampleTemplate" },
  { id: "api_key", labelKey: "categoryApiKey", exampleKey: "exampleApiKey" },
  { id: "project", labelKey: "categoryProject", exampleKey: "exampleProject" },
];

// BL-MCP-PAGE-REVAMP F-MR-04: 4 个安全 tool — 仅 read-only / ~$0.000004 cost
type TryItTool = "list_models" | "get_balance" | "get_usage_summary" | "embed_text";
const TRY_IT_TOOLS: TryItTool[] = [
  "list_models",
  "get_balance",
  "get_usage_summary",
  "embed_text",
];

function generateConfig(client: ClientType, apiKey: string): string {
  const bearer = `Bearer ${apiKey || "pk_your_api_key"}`;

  switch (client) {
    case "claude-code":
      return `claude mcp add aigc-gateway \\
  --transport streamable-http \\
  --url ${MCP_URL} \\
  --header "Authorization: ${bearer}"`;

    case "claude-desktop":
      return JSON.stringify(
        {
          mcpServers: {
            "aigc-gateway": {
              type: "streamable-http",
              url: MCP_URL,
              headers: { Authorization: bearer },
            },
          },
        },
        null,
        2,
      );

    case "cursor":
      return JSON.stringify(
        {
          mcpServers: {
            "aigc-gateway": {
              url: MCP_URL,
              headers: { Authorization: bearer },
            },
          },
        },
        null,
        2,
      );

    case "codex":
      return `[mcp_servers.aigc-gateway]
url = "${MCP_URL}"

[mcp_servers.aigc-gateway.http_headers]
"Authorization" = "${bearer}"`;

    case "vscode":
      return JSON.stringify(
        {
          servers: {
            "aigc-gateway": {
              type: "http",
              url: MCP_URL,
              headers: { Authorization: bearer },
            },
          },
        },
        null,
        2,
      );

    case "windsurf":
      return JSON.stringify(
        {
          mcpServers: {
            "aigc-gateway": {
              serverUrl: MCP_URL,
              headers: { Authorization: bearer },
            },
          },
        },
        null,
        2,
      );

    case "cline":
      return JSON.stringify(
        {
          mcpServers: {
            "aigc-gateway": {
              url: MCP_URL,
              headers: { Authorization: bearer },
            },
          },
        },
        null,
        2,
      );

    case "roo-code":
      return JSON.stringify(
        {
          mcpServers: {
            "aigc-gateway": {
              url: MCP_URL,
              headers: { Authorization: bearer },
            },
          },
        },
        null,
        2,
      );

    case "jetbrains":
      return JSON.stringify(
        {
          servers: {
            "aigc-gateway": {
              type: "http",
              url: MCP_URL,
              headers: { Authorization: bearer },
            },
          },
        },
        null,
        2,
      );

    case "generic":
      return `URL: ${MCP_URL}\nAuthorization: ${bearer}`;
  }
}

function getConfigPath(client: ClientType): string {
  switch (client) {
    case "claude-code":
      return "Terminal";
    case "claude-desktop":
      return "claude_desktop_config.json";
    case "cursor":
      return ".cursor/mcp.json";
    case "codex":
      return "codex.toml";
    case "vscode":
      return ".vscode/mcp.json";
    case "windsurf":
      return "~/.codeium/windsurf/mcp_config.json";
    case "cline":
      return "cline_mcp_settings.json";
    case "roo-code":
      return "roo_mcp_settings.json";
    case "jetbrains":
      return "Settings → Tools → MCP Servers";
    case "generic":
      return "URL + Header";
  }
}

function getConfigLang(client: ClientType): string {
  if (client === "claude-code") return "bash";
  if (client === "codex") return "toml";
  if (client === "generic") return "text";
  return "json";
}

// ============================================================
// Page
// ============================================================

export default function McpSetupPage() {
  const t = useTranslations("mcpSetup");
  const { current, loading: projLoading } = useProject();
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [apiKey, setApiKey] = useState("");
  const [client, setClient] = useState<ClientType>("claude-code");
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // BL-MCP-PAGE-REVAMP F-MR-01: 动态拉 28+ tool registry
  const { data: toolsResp } = useAsyncData<{ data: McpToolMeta[] }>(
    () => apiFetch("/api/mcp/tools"),
    [],
  );
  const tools = toolsResp?.data ?? [];

  // 按 category 分组
  const groupedTools = useMemo(() => {
    const groups = new Map<McpToolCategory, McpToolMeta[]>();
    for (const cat of CATEGORY_META) groups.set(cat.id, []);
    for (const tool of tools) {
      const list = groups.get(tool.category);
      if (list) list.push(tool);
    }
    return groups;
  }, [tools]);

  // F-MR-04 try-it state
  const [tryItTool, setTryItTool] = useState<TryItTool>("list_models");
  const [tryItModality, setTryItModality] = useState<string>("all");
  const [tryItInput, setTryItInput] = useState<string>("hello");
  const [tryItRunning, setTryItRunning] = useState(false);
  const [tryItResponse, setTryItResponse] = useState<string>("");

  const loadKeys = useCallback(() => {
    apiFetch<{ data: ApiKeyRow[] }>("/api/keys").then((r) => {
      setKeys(r.data.filter((k) => k.status === "ACTIVE"));
    });
  }, []);

  useEffect(() => {
    loadKeys();
  }, [loadKeys]);

  if (projLoading)
    return (
      <PageContainer data-testid="mcp-setup-loading">
        <PageLoader />
      </PageContainer>
    );

  const selectKeyFromList = (prefix: string) => {
    setApiKey(`${prefix}••••••••`);
    toast.info(t("pasteFullKey"));
  };

  const configText = generateConfig(client, apiKey);
  const selectedClient = CLIENT_OPTIONS.find((c) => c.value === client)!;

  const copyConfig = () => {
    if (!apiKey || apiKey.includes("••••")) {
      toast.error(t("enterKeyFirst"));
      return;
    }
    navigator.clipboard.writeText(configText);
    toast.success(t("copied"));
  };

  // ===== Try-it runner =====
  const runTryIt = async () => {
    setTryItRunning(true);
    setTryItResponse("");
    try {
      let result: unknown;
      if (tryItTool === "list_models") {
        const q = tryItModality && tryItModality !== "all" ? `?modality=${tryItModality}` : "";
        result = await apiFetch(`/api/v1/models${q}`);
      } else if (tryItTool === "get_balance") {
        if (!current?.id) {
          toast.error(t("tryItProjectRequired"));
          setTryItRunning(false);
          return;
        }
        result = await apiFetch(`/api/projects/${current.id}/balance`);
      } else if (tryItTool === "get_usage_summary") {
        if (!current?.id) {
          toast.error(t("tryItProjectRequired"));
          setTryItRunning(false);
          return;
        }
        result = await apiFetch(`/api/projects/${current.id}/usage`);
      } else if (tryItTool === "embed_text") {
        // 需用户在 step 1 输入 API Key（pk_xxx），不能含 ••••
        if (!apiKey || apiKey.includes("••••")) {
          toast.error(t("tryItKeyRequired"));
          setTryItRunning(false);
          return;
        }
        const res = await fetch("/api/v1/embeddings", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({ model: "bge-m3", input: tryItInput.slice(0, 1000) }),
        });
        const body = await res.json();
        if (!res.ok) {
          throw new Error(body.error?.message ?? `HTTP ${res.status}`);
        }
        // 截断 embedding 数组到首 5 维 + dimensions
        const data = body.data?.[0];
        const emb = Array.isArray(data?.embedding) ? data.embedding : [];
        result = {
          model: body.model,
          usage: body.usage,
          dimensions: emb.length,
          embedding_first_5: emb.slice(0, 5),
          traceId: res.headers.get("x-trace-id") ?? null,
        };
      }
      setTryItResponse(JSON.stringify(result, null, 2));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setTryItResponse(`{\n  "error": ${JSON.stringify(msg)}\n}`);
      toast.error(`${t("tryItErrorTitle")}: ${msg}`);
    } finally {
      setTryItRunning(false);
    }
  };

  return (
    <PageContainer data-testid="mcp-setup-page">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      {/* Bento Grid */}
      <div className="grid grid-cols-12 gap-8">
        {/* Left Column: Step 1 */}
        <div className="col-span-12 lg:col-span-5 flex flex-col gap-6">
          {/* ═══ Step 1: API Key ═══ */}
          <SectionCard className="relative overflow-hidden group">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-10 h-10 rounded-full bg-ds-primary flex items-center justify-center text-white font-bold text-sm">
                1
              </div>
              <div>
                <h3 className="heading-3">{t("step1")}</h3>
                <p className="text-sm text-ds-on-surface-variant">{t("step1Desc")}</p>
              </div>
            </div>

            {/* API Key input */}
            <div className="space-y-3">
              <input
                type="text"
                className="w-full bg-ds-surface-container-low border-none rounded-lg px-4 py-3 text-sm font-mono text-ds-on-surface outline-none focus:ring-2 focus:ring-ds-primary/20 transition-all placeholder:text-ds-outline"
                placeholder={t("keyPlaceholder")}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />

              {/* Key list shortcuts */}
              {keys.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {keys.map((k) => (
                    <button
                      key={k.id}
                      onClick={() => selectKeyFromList(k.keyPrefix)}
                      className="px-3 py-1.5 text-xs font-mono bg-ds-surface-container-low rounded-lg hover:bg-ds-surface-container transition-colors text-ds-on-surface-variant"
                    >
                      {k.keyPrefix}••••
                      {k.name && <span className="ml-1 text-ds-outline font-sans">({k.name})</span>}
                    </button>
                  ))}
                </div>
              )}

              {keys.length === 0 && (
                <div className="text-center py-2">
                  <Link href="/keys" className="text-sm font-bold text-ds-primary hover:underline">
                    {t("goToKeys")}
                  </Link>
                </div>
              )}
            </div>
          </SectionCard>
        </div>

        {/* Right Column: Step 2 */}
        <div className="col-span-12 lg:col-span-7">
          {/* ═══ Step 2: Client + Config ═══ */}
          <SectionCard className="h-full">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-10 h-10 rounded-full bg-ds-primary flex items-center justify-center text-white font-bold text-sm">
                2
              </div>
              <div>
                <h3 className="heading-3">{t("step2")}</h3>
                <p className="text-sm text-ds-on-surface-variant">{t("step2Desc")}</p>
              </div>
            </div>

            {/* Client dropdown */}
            <div className="relative mb-6">
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="w-full flex items-center justify-between px-4 py-3 bg-ds-surface-container-low rounded-lg text-sm font-bold text-ds-on-surface hover:bg-ds-surface-container transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-ds-primary">
                    {selectedClient.icon}
                  </span>
                  <span>{selectedClient.label}</span>
                </div>
                <span className="material-symbols-outlined text-ds-outline">
                  {dropdownOpen ? "expand_less" : "expand_more"}
                </span>
              </button>
              {dropdownOpen && (
                <div className="absolute z-20 mt-1 w-full bg-ds-surface rounded-xl shadow-xl border border-ds-outline-variant/20 py-1 max-h-80 overflow-y-auto">
                  {CLIENT_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => {
                        setClient(opt.value);
                        setDropdownOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-ds-primary/10 transition-colors ${
                        client === opt.value
                          ? "text-ds-primary font-bold bg-ds-primary/5"
                          : "text-ds-on-surface"
                      }`}
                    >
                      <span className="material-symbols-outlined text-lg">{opt.icon}</span>
                      <span>{opt.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Config path hint */}
            <div className="flex items-center gap-2 mb-3 text-xs text-ds-outline">
              <span className="material-symbols-outlined text-sm">folder</span>
              <span className="font-mono">{getConfigPath(client)}</span>
              <StatusChip variant="neutral">{getConfigLang(client)}</StatusChip>
            </div>

            {/* Config code block */}
            <div className="bg-ds-terminal-surface rounded-2xl p-6 overflow-x-auto border border-white/10">
              <pre className="text-sm font-mono leading-relaxed text-ds-inverse-on-surface whitespace-pre-wrap">
                {configText}
              </pre>
            </div>

            {/* Copy button */}
            <Button
              variant="gradient-primary"
              size="lg"
              onClick={copyConfig}
              className="mt-6 w-full"
            >
              <span className="material-symbols-outlined text-base">content_copy</span>
              <span>{t("copyConfig")}</span>
            </Button>
          </SectionCard>
        </div>
      </div>

      {/* ═══ Available Tools (no step number; F-MR-02 layout) ═══ */}
      <SectionCard className="mt-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg bg-ds-primary/10 text-ds-primary">
            <span className="material-symbols-outlined">build</span>
          </div>
          <h3 className="heading-3">{t("protocolTools")}</h3>
        </div>

        {/* F-MR-02: 7 category sections + F-MR-03 example prompts */}
        <div className="flex flex-col gap-6">
          {CATEGORY_META.map((cat) => {
            const list = groupedTools.get(cat.id) ?? [];
            if (list.length === 0) return null;
            return (
              <div key={cat.id}>
                <h4 className="text-base font-bold text-ds-on-surface mb-2">{t(cat.labelKey)}</h4>
                {/* F-MR-03 example prompt — quote 样式 */}
                <div className="border-l-4 border-ds-primary bg-ds-surface-container-low p-3 rounded-r mb-3">
                  <p className="text-xs text-ds-on-surface-variant mb-1 font-bold uppercase tracking-wide">
                    {t("examplePrompt")}
                  </p>
                  <p className="text-sm italic text-ds-on-surface">{t(cat.exampleKey)}</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {list.map((tool) => (
                    <div
                      key={tool.name}
                      className="flex items-start gap-3 p-3 bg-ds-surface rounded-lg shadow-sm"
                    >
                      <div className="p-2 bg-ds-primary/10 text-ds-primary rounded-lg shrink-0">
                        <span className="material-symbols-outlined">{tool.icon}</span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-mono font-bold truncate">{tool.name}</p>
                        <p className="text-xs text-ds-on-surface-variant">
                          {t(tool.descriptionKey)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </SectionCard>

      {/* ═══ F-MR-04 Try-it Panel ═══ */}
      <SectionCard className="mt-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg bg-ds-secondary/10 text-ds-secondary">
            <span className="material-symbols-outlined">play_circle</span>
          </div>
          <h3 className="heading-3">{t("tryItTitle")}</h3>
        </div>
        <p className="text-sm text-ds-on-surface-variant mb-6">{t("tryItSubtitle")}</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Tool dropdown + parameter form */}
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-bold uppercase tracking-wide text-ds-on-surface-variant">
                {t("tryItToolLabel")}
              </span>
              <select
                value={tryItTool}
                onChange={(e) => setTryItTool(e.target.value as TryItTool)}
                className="bg-ds-surface-container-low border-none rounded-lg px-4 py-2.5 text-sm font-mono text-ds-on-surface outline-none focus:ring-2 focus:ring-ds-primary/20"
              >
                {TRY_IT_TOOLS.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>

            {tryItTool === "list_models" && (
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-bold uppercase tracking-wide text-ds-on-surface-variant">
                  {t("tryItModalityLabel")}
                </span>
                <select
                  value={tryItModality}
                  onChange={(e) => setTryItModality(e.target.value)}
                  className="bg-ds-surface-container-low border-none rounded-lg px-4 py-2.5 text-sm text-ds-on-surface outline-none focus:ring-2 focus:ring-ds-primary/20"
                >
                  <option value="all">{t("tryItModalityAll")}</option>
                  <option value="text">{t("tryItModalityText")}</option>
                  <option value="image">{t("tryItModalityImage")}</option>
                  <option value="embedding">{t("tryItModalityEmbedding")}</option>
                </select>
              </label>
            )}

            {tryItTool === "embed_text" && (
              <>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-bold uppercase tracking-wide text-ds-on-surface-variant">
                    {t("tryItInputLabel")}
                  </span>
                  <textarea
                    value={tryItInput}
                    onChange={(e) => setTryItInput(e.target.value)}
                    maxLength={1000}
                    rows={3}
                    placeholder={t("tryItInputPlaceholder")}
                    className="bg-ds-surface-container-low border-none rounded-lg px-4 py-2.5 text-sm text-ds-on-surface outline-none focus:ring-2 focus:ring-ds-primary/20 resize-none"
                  />
                </label>
                <p className="text-xs text-ds-warning bg-ds-warning/10 px-3 py-2 rounded-lg">
                  ⚠️ {t("tryItCostWarning")}
                </p>
              </>
            )}

            <Button
              variant="gradient-primary"
              size="lg"
              onClick={runTryIt}
              disabled={tryItRunning}
              className="mt-2 w-full"
            >
              <span className="material-symbols-outlined text-base">play_arrow</span>
              <span>{tryItRunning ? t("tryItRunning") : t("tryItRun")}</span>
            </Button>
          </div>

          {/* Response display */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-bold uppercase tracking-wide text-ds-on-surface-variant">
              {t("tryItResponse")}
            </span>
            <pre
              className="bg-ds-terminal-surface text-ds-inverse-on-surface rounded-2xl p-4 text-xs font-mono whitespace-pre-wrap break-words overflow-auto border border-white/10"
              style={{ maxHeight: 400, minHeight: 160 }}
            >
              {tryItResponse || "—"}
            </pre>
          </div>
        </div>
      </SectionCard>
    </PageContainer>
  );
}
