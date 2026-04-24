/**
 * BL-BILLING-AUDIT-EXT-P1 F-BAX-03 — sync 工具的内部 LLM 调用
 *
 * 修复 Category D 盲区：alias-classifier / doc-enricher 原本直接 fetch
 * deepseek-chat baseUrl，绕过 engine 层 → call_logs / health_checks 都没记录，
 * 账单侧只能凭 provider 原始账单反推。
 *
 * 修复后统一走 resolveEngine + withFailover（channel 级别 failover 自动），
 * 再叠加 alias 级别 fallback 链应对 deepseek 整体不可用的情况（风险 1 缓解）。
 * 成功调用通过 writeSyncCallLog 写入 call_logs，source='sync'。
 */

import { resolveEngine } from "@/lib/engine/router";
import { withFailover } from "@/lib/engine/failover";
import { EngineError, ErrorCodes } from "@/lib/engine/types";
import { writeSyncCallLog } from "@/lib/api/post-process";

/**
 * 别名 fallback 链：deepseek 全挂时依次尝试 glm-4.7 → doubao-pro。
 * 这是 alias 级别 fallback（不同服务商同等级大模型），channel 级别 failover
 * 由 withFailover 自动处理（同一 alias 下多个 channel 自动轮转）。
 */
export const SYNC_MODEL_FALLBACK_CHAIN: readonly string[] = [
  "deepseek-chat",
  "glm-4.7",
  "doubao-pro",
];

export interface SyncLLMOptions {
  taskName: string; // 进 traceId 与 call_log.requestParams
  maxTokens?: number; // default 8192
  temperature?: number; // default 0
  jsonMode?: boolean; // default true（sync 工具目前都要求 JSON）
}

/**
 * 指向下一个 alias fallback 的错误判断：
 *   - MODEL_NOT_FOUND → alias 在本 gateway 没配 → 换下一个 alias
 *   - 其他错误（withFailover 已穷尽 channel 级别重试）→ 换下一个 alias 继续尝试
 *
 * 始终不换 alias（直接抛出给调用方）：
 *   - CONTENT_FILTERED / INVALID_REQUEST — 换 alias 也修不了
 */
function shouldPropagate(err: unknown): boolean {
  if (err instanceof EngineError) {
    return err.code === ErrorCodes.CONTENT_FILTERED || err.code === ErrorCodes.INVALID_REQUEST;
  }
  return false;
}

export async function callSyncLLM(prompt: string, options: SyncLLMOptions): Promise<string> {
  const { taskName, maxTokens = 8192, temperature = 0, jsonMode = true } = options;
  let lastError: unknown;

  for (const aliasName of SYNC_MODEL_FALLBACK_CHAIN) {
    const startTime = Date.now();
    const traceId = `sync_${taskName}_${startTime}`;

    try {
      const { candidates } = await resolveEngine(aliasName);

      const { result, route } = await withFailover(candidates, (r, adapter) =>
        adapter.chatCompletions(
          {
            model: r.model.name,
            messages: [{ role: "user", content: prompt }],
            temperature,
            max_tokens: maxTokens,
            ...(jsonMode ? { response_format: { type: "json_object" as const } } : {}),
          },
          r,
        ),
      );

      const content = result.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error(`Sync LLM ${aliasName} returned empty content`);
      }

      writeSyncCallLog({
        traceId,
        route,
        taskName,
        startTime,
        prompt,
        response: result,
      });

      return content;
    } catch (err) {
      lastError = err;
      if (shouldPropagate(err)) throw err;
      console.warn(
        `[sync-llm] alias=${aliasName} task=${taskName} failed: ${err instanceof Error ? err.message : String(err)}. Trying next fallback.`,
      );
    }
  }

  const msg = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`All sync LLM fallbacks exhausted. Last error: ${msg}`);
}
