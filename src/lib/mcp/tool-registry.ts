/**
 * BL-MCP-PAGE-REVAMP F-MR-01 — MCP tool registry (manually maintained const).
 *
 * 集中维护所有已注册到 mcp server 的 tool 元数据。前端 /mcp-setup 页面
 * 通过 GET /api/mcp/tools 拉取此 registry 渲染 tool list（替代之前 hardcoded
 * 7 个的过时数组）。
 *
 * 同步约束（铁律）：
 *   - 加新 tool 必须同步两处：src/lib/mcp/server.ts register* + 本文件
 *   - 删 tool 同样两处都改
 *   - 单测 src/lib/mcp/__tests__/tool-registry.test.ts 用 grep 检测每个
 *     name 在 server.ts 中能找到对应 register 调用，length 断言 = 28
 *
 * 不反射 server 内部状态原因：McpServer 没暴露 _registeredTools；运行时
 * 反射会增加复杂度而维护成本（写一行 const）极低。
 *
 * Category 7 组（按 server.ts register 顺序近似分组）：
 *   - models: 模型查询（1）
 *   - ai_call: AI 调用（3：chat / generate_image / embed_text）
 *   - observability: 观察 / 计费（4）
 *   - action: Action 工作流（8）
 *   - template: Template 工作流（8：含 list_public + fork_public）
 *   - api_key: API Key 管理（3）
 *   - project: 项目管理（2）
 */

export type McpToolCategory =
  | "models"
  | "ai_call"
  | "observability"
  | "action"
  | "template"
  | "api_key"
  | "project";

export interface McpToolMeta {
  name: string;
  category: McpToolCategory;
  /** i18n key under mcpSetup namespace, e.g. "toolListModels" */
  descriptionKey: string;
  /** material-symbols icon name */
  icon: string;
}

export const MCP_TOOL_REGISTRY: ReadonlyArray<McpToolMeta> = [
  // ---------- Models (1) ----------
  { name: "list_models", category: "models", descriptionKey: "toolListModels", icon: "list_alt" },

  // ---------- AI Calls (3) ----------
  { name: "chat", category: "ai_call", descriptionKey: "toolChat", icon: "forum" },
  { name: "generate_image", category: "ai_call", descriptionKey: "toolGenerateImage", icon: "image" },
  { name: "embed_text", category: "ai_call", descriptionKey: "toolEmbedText", icon: "data_object" },

  // ---------- Observability & Billing (4) ----------
  { name: "list_logs", category: "observability", descriptionKey: "toolListLogs", icon: "receipt_long" },
  { name: "get_log_detail", category: "observability", descriptionKey: "toolGetLogDetail", icon: "description" },
  { name: "get_balance", category: "observability", descriptionKey: "toolGetBalance", icon: "account_balance_wallet" },
  { name: "get_usage_summary", category: "observability", descriptionKey: "toolGetUsageSummary", icon: "analytics" },

  // ---------- Action Workflows (8) ----------
  { name: "list_actions", category: "action", descriptionKey: "toolListActions", icon: "format_list_bulleted" },
  { name: "get_action_detail", category: "action", descriptionKey: "toolGetActionDetail", icon: "info" },
  { name: "run_action", category: "action", descriptionKey: "toolRunAction", icon: "play_arrow" },
  { name: "create_action", category: "action", descriptionKey: "toolCreateAction", icon: "add_box" },
  { name: "update_action", category: "action", descriptionKey: "toolUpdateAction", icon: "edit" },
  { name: "delete_action", category: "action", descriptionKey: "toolDeleteAction", icon: "delete" },
  { name: "create_action_version", category: "action", descriptionKey: "toolCreateActionVersion", icon: "history_edu" },
  { name: "activate_version", category: "action", descriptionKey: "toolActivateVersion", icon: "task_alt" },

  // ---------- Template Workflows (8) ----------
  { name: "list_templates", category: "template", descriptionKey: "toolListTemplates", icon: "view_list" },
  { name: "get_template_detail", category: "template", descriptionKey: "toolGetTemplateDetail", icon: "description" },
  { name: "run_template", category: "template", descriptionKey: "toolRunTemplate", icon: "rocket_launch" },
  { name: "create_template", category: "template", descriptionKey: "toolCreateTemplate", icon: "add_circle" },
  { name: "update_template", category: "template", descriptionKey: "toolUpdateTemplate", icon: "edit_note" },
  { name: "delete_template", category: "template", descriptionKey: "toolDeleteTemplate", icon: "delete_sweep" },
  { name: "list_public_templates", category: "template", descriptionKey: "toolListPublicTemplates", icon: "explore" },
  { name: "fork_public_template", category: "template", descriptionKey: "toolForkPublicTemplate", icon: "fork_right" },

  // ---------- API Key Management (3) ----------
  { name: "list_api_keys", category: "api_key", descriptionKey: "toolListApiKeys", icon: "key" },
  { name: "create_api_key", category: "api_key", descriptionKey: "toolCreateApiKey", icon: "vpn_key" },
  { name: "revoke_api_key", category: "api_key", descriptionKey: "toolRevokeApiKey", icon: "key_off" },

  // ---------- Project Management (2) ----------
  { name: "get_project_info", category: "project", descriptionKey: "toolGetProjectInfo", icon: "folder_open" },
  { name: "create_project", category: "project", descriptionKey: "toolCreateProject", icon: "create_new_folder" },
];

export const MCP_CATEGORY_ORDER: ReadonlyArray<McpToolCategory> = [
  "models",
  "ai_call",
  "observability",
  "action",
  "template",
  "api_key",
  "project",
];
