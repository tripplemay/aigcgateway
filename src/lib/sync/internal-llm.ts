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
/**
 * BL-DEEPSEEK-V4-HOTFIX F-DSV4-04：链首原为 `deepseek-chat`、次位 `glm-4.7`，
 * 两个别名在生产都已 `enabled=false`（DeepSeek 直连下线该模型名；glm-4.7 被
 * glm-5 取代），于是每次 sync LLM 调用都要先空转两跳 MODEL_NOT_FOUND 才落到
 * `doubao-pro`。
 *
 * 2026-07-25 按生产实况重排，三跳分属三家服务商（配额/密钥/余额相互独立）：
 *   deepseek-v4-flash（DeepSeek，4 通道，便宜）
 *   → glm-5（智谱，4 通道）
 *   → doubao-pro（字节，5 通道）
 *
 * ⚠️ 这是硬编码别名，会随运营下架而腐坏。`callSyncLLM` 在整条链上**每一跳**
 * 命中 MODEL_NOT_FOUND 时都会打 `[sync-llm] chain rot` 警告 —— 看到它就说明
 * 这里该改了，别等到链路全断。
 */
export const SYNC_MODEL_FALLBACK_CHAIN: readonly string[] = [
  "deepseek-v4-flash",
  "glm-5",
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
      // F-DSV4-04: MODEL_NOT_FOUND 意味着这个别名在本网关根本不存在或已停用
      // ——是配置腐坏，不是运行时故障。单独喊一声，好过混在通用失败日志里
      // 常年没人注意（deepseek-chat / glm-4.7 就是这么烂在链里两个月的）。
      if (err instanceof EngineError && err.code === ErrorCodes.MODEL_NOT_FOUND) {
        console.warn(
          `[sync-llm] chain rot: alias=${aliasName} 在本网关不可用（未配置或已停用），` +
            `SYNC_MODEL_FALLBACK_CHAIN 需要更新。task=${taskName}`,
        );
      } else {
        console.warn(
          `[sync-llm] alias=${aliasName} task=${taskName} failed: ${err instanceof Error ? err.message : String(err)}. Trying next fallback.`,
        );
      }
    }
  }

  const msg = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`All sync LLM fallbacks exhausted. Last error: ${msg}`);
}
