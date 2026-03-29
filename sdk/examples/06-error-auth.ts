/**
 * 示例 6：错误处理 — AuthError（无效 API Key）
 *
 * npx tsx examples/06-error-auth.ts
 */
import { Gateway, AuthError, GatewayError } from "../src/index";

const gw = new Gateway({
  apiKey: "pk_this_key_does_not_exist",
  baseUrl: process.env.GATEWAY_BASE_URL ?? "http://localhost:3000",
});

async function main() {
  console.log("--- AuthError 测试 ---");

  try {
    await gw.chat({
      model: "deepseek/v3",
      messages: [{ role: "user", content: "test" }],
    });
    console.log("❌ 应该抛错但没有");
  } catch (e) {
    if (e instanceof AuthError) {
      console.log("✅ AuthError");
      console.log("  status:", e.status);
      console.log("  code:", e.code);
      console.log("  message:", e.message);
    } else if (e instanceof GatewayError) {
      console.log("⚠️ GatewayError (非 AuthError):", e.code, e.message);
    } else {
      console.log("⚠️ 未知错误:", (e as Error).message);
    }
  }
}

main().catch(console.error);
