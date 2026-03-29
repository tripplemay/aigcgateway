/**
 * 示例 8：错误处理 — InsufficientBalanceError（余额不足）
 *
 * 需要用一个余额为 0 的项目的 API Key 测试
 *
 * npx tsx examples/08-error-balance.ts
 */
import { Gateway, InsufficientBalanceError, GatewayError } from "../src/index";

const gw = new Gateway({
  apiKey: process.env.GATEWAY_API_KEY_ZERO_BALANCE ?? "pk_zero_balance",
  baseUrl: process.env.GATEWAY_BASE_URL ?? "http://localhost:3000",
});

async function main() {
  console.log("--- InsufficientBalanceError 测试 ---");

  try {
    await gw.chat({
      model: "deepseek/v3",
      messages: [{ role: "user", content: "test" }],
    });
    console.log("❌ 应该抛错但没有");
  } catch (e) {
    if (e instanceof InsufficientBalanceError) {
      console.log("✅ InsufficientBalanceError");
      console.log("  status:", e.status);
      console.log("  code:", e.code);
      console.log("  balance:", e.balance);
      console.log("  message:", e.message);
    } else if (e instanceof GatewayError) {
      console.log("⚠️ GatewayError:", e.status, e.code, e.message);
    } else {
      console.log("⚠️ 未知错误:", (e as Error).message);
    }
  }
}

main().catch(console.error);
