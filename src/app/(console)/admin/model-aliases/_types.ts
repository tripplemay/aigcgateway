/**
 * BL-ADMIN-ALIAS-UX-PHASE1 — shared types extracted from page.tsx so that
 * pure helpers (_helpers.ts) and tests can typecheck against the same
 * ApiResponse shape without dragging in the React component module.
 *
 * Underscore-prefixed file → Next.js App Router treats as private (not routed).
 */

export interface ChannelData {
  id: string;
  priority: number;
  status: string;
  costPrice: Record<string, unknown> | null;
  providerName: string;
  latencyMs: number | null;
  lastHealthResult: "PASS" | "FAIL" | null;
}

export interface LinkedModel {
  modelId: string;
  modelName: string;
  modelEnabled: boolean;
  channels: ChannelData[];
}

export interface AliasItem {
  id: string;
  alias: string;
  brand: string | null;
  modality: string;
  enabled: boolean;
  contextWindow: number | null;
  maxTokens: number | null;
  capabilities: Record<string, boolean> | null;
  description: string | null;
  sellPrice: Record<string, unknown> | null;
  openRouterModelId: string | null;
  linkedModels: LinkedModel[];
  linkedModelCount: number;
  activeChannelCount: number;
}

export interface UnlinkedModel {
  id: string;
  name: string;
  displayName: string;
  modality: string;
  channelCount: number;
  providers: string[];
}

/**
 * F-AAU-08: server-side pagination metadata.
 * total / totalPages reflect the **filtered** set, not the entire table.
 */
export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ApiResponse {
  data: AliasItem[];
  unlinkedModels: UnlinkedModel[];
  /** F-AAU-08: distinct brand values across the unfiltered alias table.
   *  Lets the brand dropdown stay complete after pagination kicks in. */
  availableBrands: string[];
  pagination: PaginationMeta;
}
