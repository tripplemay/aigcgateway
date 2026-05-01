/**
 * BL-ADMIN-ALIAS-UX-PHASE1 — pure state transformers for optimistic
 * mutations on the alias list. Each `applyXxx` is a pure ApiResponse-in /
 * ApiResponse-out function safe to feed into useAsyncData.mutate(fn).
 *
 * Designed for race-safety: the closures live inside `mutate((cur) => ...)`
 * so they always see the latest state, not the value captured at handler
 * invocation. Combined with `isAliasEnabledStillTarget` (D2.3) callers can
 * detect that a later operation has already overwritten this op's effect
 * and skip rollback.
 */
import type { AliasItem, ApiResponse } from "./_types";

/**
 * Spread-merge `patch` into the alias whose id matches `aliasId`. Other
 * aliases pass through unchanged. The merge is shallow — server-only
 * fields (linkedModels, etc.) that are absent from `patch` are preserved.
 *
 * Used by saveChanges (F-AAU-05) to apply the local editState diff
 * without losing fields the server hasn't echoed back.
 */
export function applyAliasPatch(
  state: ApiResponse | null,
  aliasId: string,
  patch: Partial<AliasItem>,
): ApiResponse | null {
  if (!state) return state;
  return {
    ...state,
    data: state.data.map((a) => (a.id === aliasId ? { ...a, ...patch } : a)),
  };
}

/**
 * Toggle convenience: equivalent to applyAliasPatch(state, id, { enabled }).
 * Kept as a named helper so handler call-sites read intent-first.
 */
export function applyToggleEnabled(
  state: ApiResponse | null,
  aliasId: string,
  enabled: boolean,
): ApiResponse | null {
  return applyAliasPatch(state, aliasId, { enabled });
}

/**
 * Reorder all channels under `aliasId` so that each `orderedIds[i]` channel
 * gets `priority = i + 1`. Channels not in `orderedIds` (shouldn't happen —
 * the dnd source always emits the full set for one alias) keep priority.
 *
 * F-AAU-04: orderedIds may span multiple linkedModels (cross-model drag).
 * Patch walks every linkedModel of the target alias and updates by ch.id.
 */
export function applyChannelReorder(
  state: ApiResponse | null,
  aliasId: string,
  orderedIds: string[],
): ApiResponse | null {
  if (!state) return state;
  const idxMap = new Map<string, number>(orderedIds.map((id, i) => [id, i + 1]));
  return {
    ...state,
    data: state.data.map((a) => {
      if (a.id !== aliasId) return a;
      return {
        ...a,
        linkedModels: a.linkedModels.map((lm) => ({
          ...lm,
          channels: lm.channels.map((ch) => {
            const newPriority = idxMap.get(ch.id);
            return newPriority !== undefined ? { ...ch, priority: newPriority } : ch;
          }),
        })),
      };
    }),
  };
}

/**
 * Remove `aliasId` from the data array. Decrements pagination.total so
 * stat-card counts stay coherent until the next refetch.
 */
export function applyDeleteAlias(
  state: ApiResponse | null,
  aliasId: string,
): ApiResponse | null {
  if (!state) return state;
  const removed = state.data.some((a) => a.id === aliasId);
  if (!removed) return state;
  return {
    ...state,
    data: state.data.filter((a) => a.id !== aliasId),
    pagination: {
      ...state.pagination,
      total: Math.max(0, state.pagination.total - 1),
      totalPages: Math.max(
        1,
        Math.ceil(Math.max(0, state.pagination.total - 1) / state.pagination.pageSize),
      ),
    },
  };
}

/**
 * Filter out `modelId` from the alias's linkedModels and recompute the
 * linkedModelCount + activeChannelCount derived fields so the row badges
 * stay correct without a refetch.
 */
export function applyUnlinkModel(
  state: ApiResponse | null,
  aliasId: string,
  modelId: string,
): ApiResponse | null {
  if (!state) return state;
  return {
    ...state,
    data: state.data.map((a) => {
      if (a.id !== aliasId) return a;
      const nextLinked = a.linkedModels.filter((lm) => lm.modelId !== modelId);
      return {
        ...a,
        linkedModels: nextLinked,
        linkedModelCount: nextLinked.length,
        activeChannelCount: nextLinked
          .flatMap((lm) => lm.channels)
          .filter((ch) => ch.status === "ACTIVE").length,
      };
    }),
  };
}

/**
 * Race-protected rollback predicate (D2.3). Returns true iff the alias
 * with `aliasId` exists in `state` AND its `enabled` field is **still**
 * the value this handler optimistically wrote.
 *
 * Use it inside `mutate((cur) => isAliasEnabledStillTarget(cur, id, v) ? prev : cur)`:
 * if a later handler has already flipped enabled to a different value,
 * we skip the rollback so we don't clobber that newer state.
 */
export function isAliasEnabledStillTarget(
  state: ApiResponse | null,
  aliasId: string,
  enabled: boolean,
): boolean {
  if (!state) return false;
  return state.data.some((a) => a.id === aliasId && a.enabled === enabled);
}
