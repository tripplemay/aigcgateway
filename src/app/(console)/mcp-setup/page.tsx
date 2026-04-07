"use client";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { useProject } from "@/hooks/use-project";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import Link from "next/link";

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

  const loadKeys = useCallback(() => {
    if (!current) return;
    apiFetch<{ data: ApiKeyRow[] }>(`/api/projects/${current.id}/keys`).then((r) => {
      setKeys(r.data.filter((k) => k.status === "ACTIVE"));
    });
  }, [current]);

  useEffect(() => {
    loadKeys();
  }, [loadKeys]);

  if (projLoading)
    return (
      <div className="space-y-4 pt-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
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

  return (
    <div className="max-w-3xl mx-auto">
      {/* Page Header */}
      <header className="mb-10">
        <div className="flex items-center gap-3 mb-2">
          <span className="bg-indigo-100 text-indigo-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest">
            Setup Guide
          </span>
        </div>
        <h2 className="text-4xl font-extrabold tracking-tight text-ds-on-surface mb-2 font-[var(--font-heading)]">
          {t("title")}
        </h2>
        <p className="text-slate-500">{t("subtitle")}</p>
      </header>

      <div className="space-y-8">
        {/* ═══ Step 1: API Key ═══ */}
        <section className="bg-ds-surface-container-lowest p-8 rounded-xl shadow-sm">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-10 h-10 rounded-full bg-ds-primary flex items-center justify-center text-white font-bold text-sm">
              1
            </div>
            <div>
              <h3 className="text-lg font-bold font-[var(--font-heading)]">{t("step1")}</h3>
              <p className="text-sm text-slate-500">{t("step1Desc")}</p>
            </div>
          </div>

          {/* API Key input */}
          <div className="space-y-3">
            <input
              type="text"
              className="w-full bg-ds-surface-container-low border-none rounded-lg px-4 py-3 text-sm font-mono text-ds-on-surface outline-none focus:ring-2 focus:ring-ds-primary/20 transition-all placeholder:text-slate-400"
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
                    className="px-3 py-1.5 text-xs font-mono bg-ds-surface-container-low rounded-lg hover:bg-ds-surface-container transition-colors text-slate-600"
                  >
                    {k.keyPrefix}••••
                    {k.name && (
                      <span className="ml-1 text-slate-400 font-sans">({k.name})</span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {keys.length === 0 && (
              <div className="text-center py-2">
                <Link href="/keys" className="text-sm font-bold text-indigo-600 hover:underline">
                  {t("goToKeys")}
                </Link>
              </div>
            )}
          </div>
        </section>

        {/* ═══ Step 2: Client + Config ═══ */}
        <section className="bg-ds-surface-container-lowest p-8 rounded-xl shadow-sm">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-10 h-10 rounded-full bg-ds-primary-container flex items-center justify-center text-white font-bold text-sm">
              2
            </div>
            <div>
              <h3 className="text-lg font-bold font-[var(--font-heading)]">{t("step2")}</h3>
              <p className="text-sm text-slate-500">{t("step2Desc")}</p>
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
              <span className="material-symbols-outlined text-slate-400">
                {dropdownOpen ? "expand_less" : "expand_more"}
              </span>
            </button>
            {dropdownOpen && (
              <div className="absolute z-20 mt-1 w-full bg-white rounded-xl shadow-xl border border-slate-100 py-1 max-h-80 overflow-y-auto">
                {CLIENT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => {
                      setClient(opt.value);
                      setDropdownOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-indigo-50 transition-colors ${
                      client === opt.value
                        ? "text-indigo-600 font-bold bg-indigo-50/50"
                        : "text-slate-700"
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
          <div className="flex items-center gap-2 mb-3 text-xs text-slate-400">
            <span className="material-symbols-outlined text-sm">folder</span>
            <span className="font-mono">{getConfigPath(client)}</span>
            <span className="px-1.5 py-0.5 bg-slate-100 rounded text-[10px] font-bold uppercase">
              {getConfigLang(client)}
            </span>
          </div>

          {/* Config code block */}
          <div className="bg-slate-950 rounded-2xl p-6 overflow-x-auto border border-slate-800">
            <pre className="text-sm font-mono leading-relaxed text-indigo-100 whitespace-pre-wrap">
              {configText}
            </pre>
          </div>

          {/* Copy button */}
          <button
            onClick={copyConfig}
            className="mt-6 w-full py-3.5 bg-ds-primary text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-ds-primary/20 hover:opacity-90 active:scale-[0.98] transition-all text-sm"
          >
            <span className="material-symbols-outlined">content_copy</span>
            <span>{t("copyConfig")}</span>
          </button>
        </section>
      </div>
    </div>
  );
}
